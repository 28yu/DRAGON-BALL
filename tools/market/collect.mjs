// 中古相場の自動取得（1日1回、GitHub Actions から実行）
// 使い方: node tools/market/collect.mjs
//   環境変数 RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY（楽天を取得する場合はどちらも必須）
//
// 方針
// - 楽天市場は公式API、ヤフオク（落札済み）・駿河屋・ブックオフは公開ページを1日1回だけ読む。
// - 各サイトの robots.txt を毎回確認し、アクセスが禁止されていれば取得しない。
// - リクエストの間は数秒あけ、サイトに負荷をかけない。
// - メルカリは公開ページに価格が含まれず、非公開の仕組みを回避しないと取得できないため対象外。
// - 対象は market を設定した商品と、シリーズ内のフィギュア（figures）1体ずつ。
// - 同じ検索語（再販シリーズなど）は1回の実行で1度だけ読み、結果を使い回す。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { request } from "node:https";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { UA, sleep, getText, decode, toNum, filterRows } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ITEMS = join(ROOT, "data/items.json");
const HISTORY = join(ROOT, "data/market-history.json");
// 楽天APIに「許可されたWebサイト」として登録するサイトのURL
const SITE_URL = "https://28yu.github.io/DRAGON-BALL/";

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本時間の日付


// Referer を確実に送るため、fetch ではなく node:https で取得する（楽天API用）
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers, timeout: 30000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}


const SOURCES = {
  // 楽天市場：公式API（出品中の価格。新品・中古が混ざる）
  rakuten: {
    label: "楽天市場（出品中）",
    kind: "listing",
    // 楽天ウェブサービス規約 第10条9号（取得した情報を不特定多数と共有できる場所に保存しない）に合わせ、
    // 公開リポジトリには個々の出品情報（商品名・URL）を残さず、集計値（件数・最安・中央値・最高）だけを記録する
    storeSamples: false,
    searchUrl: (q) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
    async fetch(q) {
      // 2026年の楽天APIの刷新に対応：新しい窓口（openapi.rakuten.co.jp、商品検索は 20260701 版）、アプリIDとアクセスキーの両方が必須、
      // 登録した「許可されたWebサイト」からの呼び出しであることを示す Referer を付ける
      const appId = process.env.RAKUTEN_APP_ID;
      const accessKey = process.env.RAKUTEN_ACCESS_KEY;
      if (!appId) return { skipped: "楽天のアプリID（RAKUTEN_APP_ID）が未設定" };
      if (!accessKey) return { skipped: "楽天のアクセスキー（RAKUTEN_ACCESS_KEY）が未設定" };
      const params = new URLSearchParams({ format: "json", formatVersion: "2", applicationId: appId, accessKey, keyword: q, hits: "30", sort: "standard" });
      await sleep(1200); // APIの利用回数制限（1秒1回）に合わせる
      const { status, body } = await httpsGet(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params}`, {
        "User-Agent": UA,
        Referer: SITE_URL,
        Origin: new URL(SITE_URL).origin,
      });
      if (status !== 200) throw new Error(`HTTP ${status} ${body.slice(0, 200)}`);
      const json = JSON.parse(body);
      // 楽天APIはエラー時に error / errors を返すことがあるので、内容をそのまま記録に残す
      if (json.error || json.errors) throw new Error(`楽天APIエラー ${JSON.stringify(json.error_description || json.errors || json.error).slice(0, 200)}`);
      return { rows: (json.Items || []).map((x) => x.Item || x).map((Item) => ({ title: Item.itemName, price: Item.itemPrice, url: Item.itemUrl })) };
    },
  },
  // ヤフオク：落札済みの検索結果（過去の落札価格）
  yahoo: {
    label: "ヤフオク（落札済み）",
    kind: "sold",
    // 出品名に「箱説付」「未開封」などの状態が書かれるため、状態の区分ごとにも集計する
    useGrades: true,
    // robots.txt に「Disallow: /closedsearch/*?*n=」（表示件数の指定）があるため n= は付けない（付けなくても1ページ50件まで表示される）
    searchUrl: (q) => `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(q)}&va=${encodeURIComponent(q)}&b=1`,
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
function stats(rows) {
  const prices = rows.map((r) => r.price).sort((a, b) => a - b);
  if (prices.length === 0) return { count: 0, min: null, median: null, max: null };
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
  return { count: prices.length, min: prices[0], median, max: prices[prices.length - 1] };
}

// 状態の区分（未開封・箱付き・ソフトのみ など）ごとの集計。
// 区分は items.json の market.grades、なければカテゴリーの marketGrades で定義する。
// 出品名を上の区分から順に調べ、match に当てはまり unless に当てはまらない最初の区分に入れる（match のない区分は「それ以外すべて」）。
// どの区分にも入らない出品は、全体の集計にだけ含める。
function gradeStats(rows, grades) {
  const groups = grades.map(() => []);
  for (const r of rows) {
    const i = grades.findIndex((g) => (!g.match || new RegExp(g.match, "i").test(r.title)) && !(g.unless && new RegExp(g.unless, "i").test(r.title)));
    if (i >= 0) groups[i].push(r);
  }
  return grades.map((g, i) => ({ key: g.key, label: g.label, ...stats(groups[i]) }));
}

// ---------- メイン ----------
const DATA = JSON.parse(readFileSync(ITEMS, "utf-8"));
const categoryGrades = Object.fromEntries((DATA.categories || []).map((c) => [c.id, c.marketGrades]));
// 版ごとの相場（market.variants。例：ファミコンの完全復刻版）は、通常の検索とは別に検索し、記録に variant を付けて分ける
const withVariants = (i) => [i, ...(i.market?.variants || []).map((v) => ({ id: i.id, category: i.category, variant: v.key, variantLabel: v.label, market: v }))];
const items = DATA.items.flatMap((i) => [i, ...(i.figures || []).map((f) => ({ ...f, category: i.category }))]).flatMap(withVariants).filter((i) => i.market?.query);
const history = existsSync(HISTORY)
  ? JSON.parse(readFileSync(HISTORY, "utf-8"))
  : { meta: { description: "中古相場の自動取得履歴（tools/market/collect.mjs が1日1回更新）。手で編集しない。" }, records: [] };

const run = { date: today, startedAt: new Date().toISOString(), sources: {} };
for (const [key, src] of Object.entries(SOURCES)) {
  const st = { label: src.label, ok: 0, empty: 0, skipped: 0, failed: 0, messages: [] };
  const cache = new Map();
  for (const item of items) {
    try {
      if (!cache.has(item.market.query)) cache.set(item.market.query, await src.fetch(item.market.query));
      const r = cache.get(item.market.query);
      if (r.skipped) {
        st.skipped++;
        if (!st.messages.includes(r.skipped)) st.messages.push(r.skipped);
        // サイト全体に関わる理由（規約・設定）なら残りの商品も取得しない
        if (r.skipped.startsWith("robots") || r.skipped.includes("未設定")) { st.skipped += items.length - 1 - items.indexOf(item); break; }
        continue;
      }
      const rows = filterRows(r.rows, item.market);
      const grades = src.useGrades ? item.market.grades || categoryGrades[item.category] : null;
      const s = stats(rows);
      if (s.count === 0) st.empty++; else st.ok++;
      console.log(`[${key}] ${item.id}${item.variant ? `（${item.variantLabel}）` : ""} 取得${r.rows.length}件 → 対象${s.count}件` + (r.htmlLength ? `（ページ${r.htmlLength}文字）` : ""));
      if (r.rows.length === 0 && r.html && !st.debugShown) {
        // 初回の調査用：読み取れなかったページの一部を記録に残す（1サイト1回だけ）
        st.debugShown = true;
        const i = Math.max(0, r.html.search(/円|￥|¥|Product|item/));
        console.log(`[${key}] 調査用（ページの一部）: ${r.html.slice(i, i + 1500).replace(/\s+/g, " ")}`);
      }
      history.records = history.records.filter((x) => !(x.date === today && x.id === item.id && x.source === key && (x.variant || null) === (item.variant || null)));
      history.records.push({
        date: today, id: item.id, ...(item.variant ? { variant: item.variant, variantLabel: item.variantLabel } : {}), source: key, kind: src.kind, ...s,
        ...(grades?.length ? { grades: gradeStats(rows, grades) } : {}),
        searchUrl: src.searchUrl(item.market.query),
        ...(src.storeSamples === false ? {} : { samples: rows.slice(0, 3).map((x) => ({ title: x.title.slice(0, 80), price: x.price, url: x.url })) }),
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
