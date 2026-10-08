// 出品名から「どの商品の出品か」「状態」を判定する（メルカリの取り込み用。2026-10-08）
// 条件は tools/market/lib.mjs の filterRows・tools/market/listings.mjs の gradeOf と同じ。
// 変えるときは両方をそろえる（ヤフオク・ブックオフはサーバー側、メルカリは画面側で同じ判定をする）。

const MATCH_GLOBAL_EXCLUDE = ["まとめ", "セット", "本体", "大量", "空箱", "箱のみ", "説明書のみ"];
const MATCH_GLOBAL_PATTERN = { "セット": "(?<!カ)セット" };
const MATCH_SEALED = { key: "sealed", label: "未開封・新品", match: "未開封|シュリンク|(?<!ほぼ|シール)未使用(?!シール)|新品(?!電池|の電池)", unless: "(未開封|未使用|新品)[\\s]*[？?]" };
const MATCH_OTHER = { key: "other", label: "中古・記載なし" };

function titleMatches(title, market) {
  const allow = market.allowWords || [];
  const exc = [...(market.exclude || []), ...MATCH_GLOBAL_EXCLUDE.filter((w) => !allow.includes(w)).map((w) => MATCH_GLOBAL_PATTERN[w] || w)];
  try {
    return (market.mustInclude || []).every((s) => new RegExp(s, "i").test(title)) && !exc.some((w) => new RegExp(w, "i").test(title));
  } catch (e) {
    return false;
  }
}

// 商品・フィギュア・版のうち、検索語（market.query / mercariQuery）を持つもの
function marketTargets(data) {
  const out = [];
  for (const it of data.items || []) {
    const push = (x, extra = {}) => x.market?.query && out.push({ id: x.id, category: it.category, market: x.market, ...extra });
    push(it);
    for (const v of it.market?.variants || []) push({ id: it.id, market: v }, { variant: v.key, variantLabel: v.label });
    for (const f of it.figures || []) push(f, { series: it.id });
  }
  return out;
}

// 1件の出品（title・keyword）が当てはまる商品。取り込んだ検索語と同じ検索語の商品を優先し、無ければすべての商品で調べる
function matchListing(title, keyword, targets) {
  const kw = (keyword || "").trim();
  const same = kw ? targets.filter((tg) => tg.market.query === kw || tg.market.mercariQuery === kw) : [];
  const pool = same.length ? same : targets;
  return pool.filter((tg) => titleMatches(title, tg.market)).map((tg) => ({ id: tg.id, ...(tg.variant ? { variant: tg.variant, variantLabel: tg.variantLabel } : {}) }));
}

function gradeOfTitle(title, grades) {
  const list = grades?.length ? grades : [MATCH_SEALED, MATCH_OTHER];
  const g = list.find((x) => {
    try {
      return (!x.match || new RegExp(x.match, "i").test(title)) && !(x.unless && new RegExp(x.unless, "i").test(title));
    } catch (e) {
      return false;
    }
  });
  return g ? { key: g.key, label: g.label } : null;
}
function gradesFor(data, match) {
  const it = (data.items || []).find((i) => i.id === match.id || (i.figures || []).some((f) => f.id === match.id));
  if (!it) return null;
  const own = it.id === match.id ? it : it.figures.find((f) => f.id === match.id);
  return own?.market?.grades || (data.categories || []).find((c) => c.id === it.category)?.marketGrades || null;
}
