// 出品中の一覧の自動取得（1日1回、GitHub Actions から collect.mjs のあとに実行。2026-10-08 オーナー指示）
// 使い方: node tools/market/listings.mjs
//
// 方針
// - 集める物（items.json の market を設定した商品・フィギュア・版）ごとに、いま出品中の物を検索して data/listings.json に書く（毎回上書き）。
// - ヤフオク（出品中の検索ページ。Yahoo!フリマの出品も含まれる）とブックオフ（公式オンラインストア）の公開ページを読む。
//   どちらも robots.txt を確認し、禁止されているページは読まない（ヤフオクは並べ替え・件数の指定が禁止のため付けない）。
// - 楽天市場は規約（取得した情報を不特定多数と共有できる場所に保存しない）のため、個々の出品は記録しない。
// - メルカリは公開ページに価格が含まれず、非公開の仕組みを回避しないと取得できないため対象外（画面には検索へのリンクだけを出す）。
// - 出品の写真は保存しない（出品者の写真のため）。記録するのは出品名・価格・終了日時など一覧に出ている文字の情報だけ。
// - 相場と同じ条件（market.mustInclude / exclude）で、関係のない出品・まとめ売りなどを除く。
// - 状態は一覧に出ないため、出品名の語から分ける（ファミコン・スーファミはカテゴリーの marketGrades、それ以外は未開封かどうかだけ）。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getText, decode, toNum, filterRows } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = JSON.parse(readFileSync(join(ROOT, "data/items.json"), "utf-8"));
const OUT = join(ROOT, "data/listings.json");
const MAX_PAGES = 2; // ヤフオクは1ページ50件。50件ちょうどなら2ページ目まで読む

// 状態の区分。カテゴリーに marketGrades があればそれを使い、なければ「未開封・新品」とそれ以外に分ける
const SEALED = { key: "sealed", label: "未開封・新品", match: "未開封|シュリンク|(?<!ほぼ|シール)未使用(?!シール)|新品(?!電池|の電池)", unless: "(未開封|未使用|新品)[\\s]*[？?]" };
const OTHER = { key: "other", label: "中古・記載なし" };
const categoryGrades = Object.fromEntries((DATA.categories || []).map((c) => [c.id, c.marketGrades]));
function gradeOf(title, grades) {
  const list = grades?.length ? grades : [SEALED, OTHER];
  const g = list.find((x) => (!x.match || new RegExp(x.match, "i").test(title)) && !(x.unless && new RegExp(x.unless, "i").test(title)));
  return g ? { key: g.key, label: g.label } : null;
}

// ---------- 取得元 ----------
const SOURCES = {
  yahoo: {
    label: "ヤフオク（出品中）",
    searchUrl: (q, page = 1) => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}&va=${encodeURIComponent(q)}&b=${(page - 1) * 50 + 1}`,
    async fetch(q) {
      const rows = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        // 0件のときは「404」が返る（ページは表示される）ので、出品なしとして扱う
        const r = await getText(this.searchUrl(q, page), { okStatus: [404] });
        if (r.skipped) return page === 1 ? r : { rows };
        // 0件のページ（404）には、検索語と関係のない「おすすめ」の出品が並ぶので読まない
        if (r.status === 404) break;
        const blocks = r.text.split('<li class="Product">').slice(1);
        for (const b of blocks) {
          const attr = (name) => (b.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || "";
          const id = attr("data-auction-id");
          const title = decode(attr("data-auction-title"));
          const price = toNum(attr("data-auction-price"));
          if (!id || !title || !price) continue;
          const buyNow = toNum(attr("data-auction-buynowprice")) || null;
          const bids = toNum((b.match(/class="Product__bid"[^>]*>([\s\S]*?)<\/dd>/) || [])[1] || "0");
          const postage = decode((b.match(/class="Product__postage"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
          const flea = attr("data-auction-isflea") === "1";
          rows.push({
            id: `yahoo:${id}`,
            site: flea ? "yahoo_flea" : "yahoo",
            title,
            price,
            buyNow,
            bids,
            // 即決価格と現在価格が同じで入札がなければ「即決のみ」に近いが、一覧では区別できないため形式は即決価格の有無で分ける
            format: flea ? "fixed" : buyNow ? (buyNow === price && !bids ? "fixed" : "auction_buynow") : "auction",
            endTime: toNum(attr("data-auction-endtime")) || null,
            shipping: /送料無料/.test(postage) || attr("data-auction-isfreeshipping") === "1" ? 0 : toNum(postage.match(/送料\s*([\d,]+)\s*円/)?.[1] || "") || null,
            store: attr("data-auction-isshoppingitem") === "1",
            url: `https://auctions.yahoo.co.jp/jp/auction/${id}`,
          });
        }
        if (blocks.length < 50) break;
      }
      return { rows };
    },
  },
  bookoff: {
    label: "ブックオフ（出品中）",
    searchUrl: (q) => `https://shopping.bookoff.co.jp/search/keyword/${encodeURIComponent(q)}`,
    async fetch(q) {
      const r = await getText(this.searchUrl(q));
      if (r.skipped) return r;
      const rows = [];
      for (const block of r.text.split(/<div class="productItem[\s"]/).slice(1)) {
        const t = block.match(/class="productItem__title"[^>]*>([\s\S]*?)<\/p>/);
        const p = block.match(/class="productItem__price"[^>]*>\s*(?:&yen;|[￥¥])\s*([\d,]+)/);
        const u = block.match(/href="(\/(used|new)\/(\d+))"/);
        if (!t || !p || !u) continue;
        rows.push({
          id: `bookoff:${u[2]}:${u[3]}`,
          site: "bookoff",
          title: decode(t[1]),
          price: toNum(p[1]),
          format: "fixed",
          condition: u[2] === "new" ? "新品" : "中古",
          url: new URL(u[1], "https://shopping.bookoff.co.jp").href,
        });
      }
      return { rows };
    },
  },
};

// ---------- 対象（商品・フィギュア・版） ----------
const targets = [];
for (const it of DATA.items || []) {
  const push = (x, extra = {}) => x.market?.query && targets.push({ id: x.id, category: it.category, market: x.market, ...extra });
  push(it);
  for (const v of it.market?.variants || []) push({ id: it.id, market: v, ownership: it.ownership }, { variant: v.key, variantLabel: v.label });
  for (const f of it.figures || []) push(f, { series: it.id });
}

// ---------- メイン ----------
const listings = new Map(); // 出品のID → 出品（同じ出品が複数の商品に当てはまるときは matches にまとめる）
const status = {};
for (const [key, src] of Object.entries(SOURCES)) {
  const st = { label: src.label, ok: 0, empty: 0, skipped: 0, failed: 0, messages: [] };
  const cache = new Map();
  for (const tg of targets) {
    const q = tg.market.query;
    try {
      if (!cache.has(q)) cache.set(q, await src.fetch(q));
      const r = cache.get(q);
      if (r.skipped) {
        st.skipped++;
        if (!st.messages.includes(r.skipped)) st.messages.push(r.skipped);
        if (r.skipped.startsWith("robots")) break;
        continue;
      }
      const rows = filterRows(r.rows, tg.market);
      if (rows.length) st.ok++; else st.empty++;
      const grades = tg.market.grades || categoryGrades[tg.category];
      for (const row of rows) {
        const cur = listings.get(row.id) || { ...row, grade: row.condition ? null : gradeOf(row.title, grades), matches: [] };
        if (!cur.matches.some((m) => m.id === tg.id && (m.variant || null) === (tg.variant || null))) {
          cur.matches.push({ id: tg.id, ...(tg.variant ? { variant: tg.variant, variantLabel: tg.variantLabel } : {}) });
        }
        listings.set(row.id, cur);
      }
      console.log(`[${key}] ${tg.id}${tg.variant ? `（${tg.variantLabel}）` : ""} 取得${r.rows.length}件 → 対象${rows.length}件`);
    } catch (e) {
      st.failed++;
      const msg = `${tg.id}: ${e.message}`.slice(0, 200);
      st.messages.push(msg);
      console.log(`[${key}] 失敗 ${msg}`);
    }
  }
  status[key] = st;
  console.log(`[${key}] 出品あり${st.ok} / 出品なし${st.empty} / 取得しない${st.skipped} / 失敗${st.failed}`);
}

// 取得元がすべて失敗した日は、前回の一覧を消さずに残す
const total = Object.values(status).reduce((n, s) => n + s.ok + s.empty, 0);
if (total === 0) {
  console.log("どの取得元からも一覧を取得できなかったため、data/listings.json は更新しない");
  process.exit(0);
}
const out = {
  meta: {
    description: "いま出品中の物の一覧（tools/market/listings.mjs が1日1回上書きする）。手で編集しない。",
    updatedAt: new Date().toISOString(),
    sources: status,
  },
  listings: [...listings.values()].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)),
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`出品中: ${out.listings.length}件`);
