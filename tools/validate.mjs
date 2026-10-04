// data/items.json の整合性チェック（依存パッケージなし）
// 使い方: node tools/validate.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

let data;
try {
  data = JSON.parse(readFileSync(join(root, "data/items.json"), "utf-8"));
} catch (e) {
  console.error(`✗ data/items.json を読み込めません: ${e.message}`);
  process.exit(1);
}

const OWNERSHIP = ["unconfirmed", "not_owned", "ordered", "owned"];
const FACT_STATUS = ["unconfirmed", "reference", "confirmed"];
const FACT_KEYS = ["release", "publisher", "isbn", "modelNumber", "platform", "genre", "listPrice"];
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const categories = new Map((data.categories || []).map((c) => [c.id, c]));
for (const c of data.categories || []) {
  if (c.inSummary !== undefined && typeof c.inSummary !== "boolean") errors.push(`カテゴリー ${c.id}: inSummary は true / false で書いてください`);
}
const seen = new Set();

for (const item of data.items || []) {
  const where = item.id || "(IDなし)";
  if (!item.id) errors.push(`${where}: id がありません`);
  if (seen.has(item.id)) errors.push(`${where}: 管理IDが重複しています`);
  seen.add(item.id);

  if (!item.title) errors.push(`${where}: title がありません`);

  const cat = categories.get(item.category);
  if (!cat) errors.push(`${where}: 未定義のカテゴリー "${item.category}"`);
  else if (!new RegExp(`^${cat.idPrefix}-\\d{3}$`).test(item.id)) {
    errors.push(`${where}: 管理IDは ${cat.idPrefix}-000 の形式にしてください`);
  }

  if (!OWNERSHIP.includes(item.ownership?.status)) {
    errors.push(`${where}: ownership.status は ${OWNERSHIP.join(" / ")} のいずれか`);
  }

  for (const key of FACT_KEYS) {
    const f = item[key];
    if (!f) { errors.push(`${where}: ${key} がありません`); continue; }
    if (!FACT_STATUS.includes(f.status)) errors.push(`${where}: ${key}.status が不正です`);
    if (f.status !== "unconfirmed" && (f.value === null || f.value === "")) {
      errors.push(`${where}: ${key} は値が空なのに status が ${f.status} です`);
    }
    if (f.status === "confirmed" && (!f.sources || f.sources.length === 0)) {
      warnings.push(`${where}: ${key} は確認済みですが出典がありません（現物確認ならメモに記載を）`);
    }
  }
  // 商品内容（フィギュア等の任意項目）も情報項目と同じ形式
  if (item.contents) {
    const f = item.contents;
    if (!FACT_STATUS.includes(f.status)) errors.push(`${where}: contents.status が不正です`);
    if (f.status !== "unconfirmed" && (f.value === null || f.value === "")) {
      errors.push(`${where}: contents は値が空なのに status が ${f.status} です`);
    }
  }
  if (item.listPrice?.value != null && !Number.isInteger(item.listPrice.value)) {
    errors.push(`${where}: listPrice.value は円の整数で書いてください`);
  }
  if (item.release?.value && !DATE_RE.test(item.release.value)) {
    errors.push(`${where}: release.value は YYYY / YYYY-MM / YYYY-MM-DD 形式`);
  }

  // シリーズ内のフィギュア（ドラゴンボールカプセル等）。管理IDは「シリーズID-2桁の番号」
  for (const fig of item.figures || []) {
    const fw = fig.id || `${where} のフィギュア(IDなし)`;
    if (!new RegExp(`^${item.id}-\\d{2}$`).test(fig.id || "")) errors.push(`${fw}: フィギュアの管理IDは ${item.id}-01 の形式にしてください`);
    if (seen.has(fig.id)) errors.push(`${fw}: 管理IDが重複しています`);
    seen.add(fig.id);
    if (!OWNERSHIP.includes(fig.ownership?.status)) errors.push(`${fw}: ownership.status は ${OWNERSHIP.join(" / ")} のいずれか`);
    if (!fig.name || !FACT_STATUS.includes(fig.name.status)) errors.push(`${fw}: name の形式が不正です`);
    else if (fig.name.status !== "unconfirmed" && !fig.name.value) errors.push(`${fw}: name は値が空なのに status が ${fig.name.status} です`);
    for (const img of fig.images || []) {
      if (!img.path || !existsSync(join(root, img.path))) errors.push(`${fw}: 画像ファイルが見つかりません (${img.path})`);
    }
  }

  for (const p of item.purchases || []) {
    if (p.date && !DATE_RE.test(p.date)) errors.push(`${where}: 購入日の形式が不正です (${p.date})`);
  }
  for (const m of item.marketPrices || []) {
    if (!m.surveyedAt || !DATE_RE.test(m.surveyedAt)) errors.push(`${where}: 相場情報には調査日 surveyedAt が必須です`);
    if (!m.source?.url && !m.basis) errors.push(`${where}: 相場情報には出典（source）か根拠（basis）が必須です`);
  }
  for (const img of item.images || []) {
    if (!img.path) errors.push(`${where}: images に path がありません`);
    else if (!img.path.startsWith(`assets/images/items/${item.id}/`)) errors.push(`${where}: 画像は assets/images/items/${item.id}/ に置いてください (${img.path})`);
    else if (!existsSync(join(root, img.path))) errors.push(`${where}: 画像ファイルが見つかりません (${img.path})`);
  }
  if (item.id && !existsSync(join(root, "assets/images/items", item.id))) {
    warnings.push(`${where}: 画像フォルダ assets/images/items/${item.id}/ がありません`);
  }
  if (item.ownership?.status === "owned" && !item.ownership.checkedAt) {
    warnings.push(`${where}: 所持になっていますが確認日 checkedAt が空です`);
  }
}

const total = (data.items || []).length;
console.log(`商品数: ${total}`);
for (const [id, c] of categories) {
  console.log(`  ${c.label}: ${(data.items || []).filter((i) => i.category === id).length}`);
}
warnings.forEach((w) => console.log(`⚠ ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`✗ ${e}`));
  console.error(`\nエラー ${errors.length} 件`);
  process.exit(1);
}
console.log("✓ データに問題はありません");
