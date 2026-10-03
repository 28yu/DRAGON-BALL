// 中古相場の自動取得（1日1回、GitHub Actions から実行）
// 使い方: node tools/market/collect.mjs
//   環境変数 RAKUTEN_APP_ID（必須：楽天）/ RAKUTEN_ACCESS_KEY（任意）
//
// 方針
// - 楽天市場は公式API、ヤフオク（落札済み）・駿河屋・ブックオフは公開ページを1日1回だけ読む。
// - 各サイトの robots.txt を毎回確認し、アクセスが禁止されていれば取得しない。
// - リクエストの間は数秒あけ、サイトに負荷をかけない。
// - メルカリは公開ページに価格が含まれず、非公開の仕組みを回避しないと取得できないため対象外。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ITEMS = join(ROOT, "data/items.json");
const HISTORY = join(ROOT, "data/market-history.json");
const UA = "DragonBallCollectionBot/1.0 (personal collection price log; +https://github.com/28yu/DRAGON-BALL)";
const WAIT_MS = 3000;
// どの商品でも除外する出品（まとめ売り・本体・攻略本など相場をゆがめるもの）
const GLOBAL_EXCLUDE = ["まとめ", "セット", "本体", "大量", "空箱", "箱のみ", "説明書のみ"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本時間の日付

// ---------- robots.txt ----------
const robotsCache = new Map();
async function robotsAllows(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA } });
      // 404/410（ファイルなし）は制限なし。それ以外のエラーは確認できないものとして扱う
      if (res.ok) rules = parseRobots(await res.text());
      else if (res.status === 404 || res.status === 410) rules = [];
      else rules = null;
    } catch {
      rules = null; // robots.txt を確認できない場合は安全側に倒して取得しない
    }
    robotsCache.set(u.origin, rules);
  }
  const rules = robotsCache.get(u.origin);
  if (rules === null) return { ok: false, reason: "robots.txt を確認できなかったため取得しない" };
  const path = u.pathname + u.search;
  let best = null;
  for (const r of rules) {
    if (r.pattern && matchRobots(path, r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  if (best && !best.allow) return { ok: false, reason: `robots.txt で禁止（Disallow: ${best.pattern}）` };
  return { ok: true };
}
function parseRobots(text) {
  // User-agent: * のグループだけを使う
  const rules = [];
  let agents = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (inRules) { agents = []; inRules = false; }
      agents.push(val.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      inRules = true;
      if (agents.includes("*")) rules.push({ allow: key === "allow", pattern: val });
    }
  }
  return rules;
}
function matchRobots(path, pattern) {
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

// ---------- 取得処理 ----------
async function getText(url) {
  const check = await robotsAllows(url);
  if (!check.ok) return { skipped: check.reason };
  await sleep(WAIT_MS);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text() };
}

const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const toNum = (s) => Number(String(s).replace(/[^\d]/g, ""));

const SOURCES = {
  // 楽天市場：公式API（出品中の価格。新品・中古が混ざる）
  rakuten: {
    label: "楽天市場（出品中）",
    kind: "listing",
    searchUrl: (q) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
    async fetch(q) {
      const appId = process.env.RAKUTEN_APP_ID;
      if (!appId) return { skipped: "楽天のアプリID（RAKUTEN_APP_ID）が未設定" };
      const params = new URLSearchParams({ format: "json", applicationId: appId, keyword: q, hits: "30", sort: "standard" });
      if (process.env.RAKUTEN_ACCESS_KEY) params.set("accessKey", process.env.RAKUTEN_ACCESS_KEY);
      await sleep(1200); // APIの利用回数制限（1秒1回）に合わせる
      const res = await fetch(`https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      return { rows: (json.Items || []).map(({ Item }) => ({ title: Item.itemName, price: Item.itemPrice, url: Item.itemUrl })) };
    },
  },
  // ヤフオク：落札済みの検索結果（過去の落札価格）
  yahoo: {
    label: "ヤフオク（落札済み）",
    kind: "sold",
    searchUrl: (q) => `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(q)}&va=${encodeURIComponent(q)}&b=1&n=50`,
    async fetch(q) {
      const r = await getText(this.searchUrl(q));
      if (r.skipped) return r;
      // ページ内に埋め込まれたデータ（__NEXT_DATA__）から、商品名と落札価格を持つ項目を集める
      const rows = [];
      const m = r.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (m) {
        const seen = new Set();
        const walk = (o) => {
          if (Array.isArray(o)) return o.forEach(walk);
          if (!o || typeof o !== "object") return;
          if (typeof o.auctionId === "string" && typeof o.title === "string" && typeof o.price === "number" && !seen.has(o.auctionId)) {
            seen.add(o.auctionId);
            const url = o.isFleamarketItem ? null : `https://auctions.yahoo.co.jp/jp/auction/${o.auctionId}`;
            rows.push({ title: o.title, price: o.price, url });
          }
          Object.values(o).forEach(walk);
        };
        try { walk(JSON.parse(m[1])); } catch (e) { throw new Error(`埋め込みデータを読めない: ${e.message}`); }
      }
      return { rows, htmlLength: r.text.length, html: r.text };
    },
  },
  // 駿河屋：出品中の価格
  surugaya: {
    label: "駿河屋（出品中）",
    kind: "listing",
    searchUrl: (q) => `https://www.suruga-ya.jp/search?category=&search_word=${encodeURIComponent(q)}`,
    async fetch(q) {
      const r = await getText(this.searchUrl(q));
      if (r.skipped) return r;
      const rows = [];
      for (const block of r.text.split(/<div class="item[\s"]/).slice(1)) {
        const t = block.match(/<p class="title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const p = block.match(/(?:中古|価格)[\s\S]{0,200}?[￥¥]\s*([\d,]+)/) || block.match(/[￥¥]\s*([\d,]+)/);
        if (t && p) rows.push({ title: decode(t[2]), price: toNum(p[1]), url: new URL(t[1], "https://www.suruga-ya.jp").href });
      }
      return { rows, htmlLength: r.text.length, html: r.text };
    },
  },
  // ブックオフ公式オンラインストア：出品中の価格
  bookoff: {
    label: "ブックオフ（出品中）",
    kind: "listing",
    searchUrl: (q) => `https://shopping.bookoff.co.jp/search/keyword/${encodeURIComponent(q)}`,
    async fetch(q) {
      const r = await getText(this.searchUrl(q));
      if (r.skipped) return r;
      // 商品ごとのブロック（productItem）から、商品名（productItem__title）と価格欄（productItem__price）を読む
      const rows = [];
      for (const block of r.text.split(/<div class="productItem[\s"]/).slice(1)) {
        const t = block.match(/class="productItem__title"[^>]*>([\s\S]*?)<\/p>/);
        const p = block.match(/class="productItem__price"[^>]*>\s*(?:&yen;|[￥¥])\s*([\d,]+)/);
        const u = block.match(/href="(\/(?:used|new)\/\d+)"/);
        if (t && p) rows.push({ title: decode(t[1]), price: toNum(p[1]), url: u ? new URL(u[1], "https://shopping.bookoff.co.jp").href : null });
      }
      return { rows, htmlLength: r.text.length, html: r.text };
    },
  },
};

// ---------- 集計 ----------
function filterRows(rows, market) {
  const inc = (market.mustInclude || []).map((s) => new RegExp(s, "i"));
  const exc = [...(market.exclude || []), ...GLOBAL_EXCLUDE];
  return rows.filter((r) => r.price > 0 && inc.every((re) => re.test(r.title)) && !exc.some((w) => new RegExp(w, "i").test(r.title)));
}
function stats(rows) {
  const prices = rows.map((r) => r.price).sort((a, b) => a - b);
  if (prices.length === 0) return { count: 0, min: null, median: null, max: null };
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
  return { count: prices.length, min: prices[0], median, max: prices[prices.length - 1] };
}

// ---------- メイン ----------
const items = JSON.parse(readFileSync(ITEMS, "utf-8")).items.filter((i) => i.market?.query);
const history = existsSync(HISTORY)
  ? JSON.parse(readFileSync(HISTORY, "utf-8"))
  : { meta: { description: "中古相場の自動取得履歴（tools/market/collect.mjs が1日1回更新）。手で編集しない。" }, records: [] };

const run = { date: today, startedAt: new Date().toISOString(), sources: {} };
for (const [key, src] of Object.entries(SOURCES)) {
  const st = { label: src.label, ok: 0, empty: 0, skipped: 0, failed: 0, messages: [] };
  for (const item of items) {
    try {
      const r = await src.fetch(item.market.query);
      if (r.skipped) {
        st.skipped++;
        if (!st.messages.includes(r.skipped)) st.messages.push(r.skipped);
        // サイト全体に関わる理由（規約・設定）なら残りの商品も取得しない
        if (r.skipped.startsWith("robots") || r.skipped.includes("未設定")) { st.skipped += items.length - 1 - items.indexOf(item); break; }
        continue;
      }
      const rows = filterRows(r.rows, item.market);
      const s = stats(rows);
      if (s.count === 0) st.empty++; else st.ok++;
      console.log(`[${key}] ${item.id} 取得${r.rows.length}件 → 対象${s.count}件` + (r.htmlLength ? `（ページ${r.htmlLength}文字）` : ""));
      if (r.rows.length === 0 && r.html && !st.debugShown) {
        // 初回の調査用：読み取れなかったページの一部を記録に残す（1サイト1回だけ）
        st.debugShown = true;
        const i = Math.max(0, r.html.search(/円|￥|¥|Product|item/));
        console.log(`[${key}] 調査用（ページの一部）: ${r.html.slice(i, i + 1500).replace(/\s+/g, " ")}`);
      }
      history.records = history.records.filter((x) => !(x.date === today && x.id === item.id && x.source === key));
      history.records.push({
        date: today, id: item.id, source: key, kind: src.kind, ...s,
        searchUrl: src.searchUrl(item.market.query),
        samples: rows.slice(0, 3).map((x) => ({ title: x.title.slice(0, 80), price: x.price, url: x.url })),
      });
    } catch (e) {
      st.failed++;
      const msg = `${item.id}: ${e.message}`.slice(0, 200);
      st.messages.push(msg);
      console.log(`[${key}] 失敗 ${msg}`);
    }
  }
  delete st.debugShown;
  run.sources[key] = st;
  console.log(`[${key}] 成功${st.ok} / 該当なし${st.empty} / 取得しない${st.skipped} / 失敗${st.failed}`);
}
run.sources.mercari = { label: "メルカリ", ok: 0, empty: 0, skipped: items.length, failed: 0, messages: ["公開ページに価格が含まれず、非公開の仕組みを回避しないと取得できないため対象外"] };
run.finishedAt = new Date().toISOString();
history.meta.lastRun = run;
history.meta.updatedAt = today;
history.records.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id) || a.source.localeCompare(b.source));
writeFileSync(HISTORY, JSON.stringify(history, null, 2) + "\n");
console.log(`記録件数: ${history.records.length}`);
