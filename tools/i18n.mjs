// 英語表示用の対応表（data/translations/en.json）の確認・更新の道具（依存パッケージなし）
//
// 画面に出る日本語の文（data/items.json と data/market-history.json の表示項目）を集め、
// 対応表に英訳がない文を一覧にする。
//
// 使い方:
//   node tools/i18n.mjs            英訳がない文の数と、その一部を表示する
//   node tools/i18n.mjs --missing  英訳がない文を data/translations/missing.json に書き出す（英訳作業用。リポジトリには入れない）
//   node tools/i18n.mjs --prune    使われなくなった英訳（元の日本語が消えたもの）を対応表から消す
//
// tools/validate.mjs からも collectStrings() を使い、英訳がない文があれば警告を出す。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DICT_PATH = join(root, "data/translations/en.json");
const JP = /[぀-ヿ㐀-鿿！-｠]/;

// 写真の説明文から「（参考画像・…）」を除く（assets/js/item.js の captionText と同じ処理）
export function captionText(caption) {
  return String(caption || "")
    .replace(/[・、]参考画像(?=[）)])/g, "")
    .replace(/[（(]参考画像[^）)]*[）)]/g, "")
    .trim();
}

export function collectStrings() {
  const items = JSON.parse(readFileSync(join(root, "data/items.json"), "utf-8"));
  const out = new Map(); // 日本語の文 → どこで使われているか（最初の1か所）
  const add = (s, where) => {
    if (typeof s !== "string") return;
    const v = s.trim();
    if (v && JP.test(v) && !out.has(v)) out.set(v, where);
  };
  const sources = (list, where) => (list || []).forEach((s) => add(s?.title, `${where}.sources`));
  const fact = (f, where) => {
    if (!f || typeof f !== "object") return;
    add(f.value, where);
    add(f.note, `${where}.note`);
    sources(f.sources, where);
  };
  const FACTS = ["release", "publisher", "isbn", "modelNumber", "platform", "genre", "listPrice", "contents", "name"];
  const product = (it, where) => {
    add(it.title, `${where}.title`);
    FACTS.forEach((k) => fact(it[k], `${where}.${k}`));
    const c = it.condition || {};
    ["box", "manual", "obi", "extras", "overall", "note"].forEach((k) => add(c[k], `${where}.condition.${k}`));
    add(it.ownership?.note, `${where}.ownership.note`);
    (it.purchases || []).forEach((p) => { add(p.shop, `${where}.purchases.shop`); add(p.note, `${where}.purchases.note`); });
    (it.editions || []).forEach((e) => {
      add(e.name, `${where}.editions.name`);
      add(e.summary, `${where}.editions.summary`);
      (e.identify || []).forEach((t) => add(t, `${where}.editions.identify`));
      add(e.price, `${where}.editions.price`);
      add(e.note, `${where}.editions.note`);
      sources(e.sources, `${where}.editions`);
    });
    add(it.editionsNote, `${where}.editionsNote`);
    (it.marketPrices || []).forEach((m) => {
      add(m.condition, `${where}.marketPrices.condition`);
      add(m.basis, `${where}.marketPrices.basis`);
      add(m.note, `${where}.marketPrices.note`);
      add(m.source?.title, `${where}.marketPrices.source`);
    });
    add(it.notes, `${where}.notes`);
    (it.images || []).forEach((img) => add(captionText(img.caption), `${where}.images.caption`));
    sources(it.references, `${where}.references`);
  };
  add(items.meta?.title, "meta.title");
  (items.categories || []).forEach((c) => { add(c.label, `categories.${c.id}.label`); add(c.description, `categories.${c.id}.description`); });
  for (const it of items.items || []) {
    product(it, it.id);
    for (const f of it.figures || []) product(f, f.id);
  }
  const histPath = join(root, "data/market-history.json");
  if (existsSync(histPath)) {
    const hist = JSON.parse(readFileSync(histPath, "utf-8"));
    for (const s of Object.values(hist.meta?.lastRun?.sources || {})) {
      add(s.label, "market.sources.label");
      (s.messages || []).forEach((m) => add(m, "market.sources.messages"));
    }
    for (const r of hist.records || []) {
      add(r.variantLabel, "market.variantLabel");
      (r.grades || []).forEach((g) => add(g.label, "market.grades.label"));
    }
  }
  return out;
}

export function loadDict() {
  return existsSync(DICT_PATH) ? JSON.parse(readFileSync(DICT_PATH, "utf-8")) : {};
}

function sortedDict(dict) {
  return Object.fromEntries(Object.entries(dict).sort(([a], [b]) => a.localeCompare(b, "ja")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const strings = collectStrings();
  const dict = loadDict();
  const missing = [...strings.keys()].filter((s) => !dict[s]);
  const unused = Object.keys(dict).filter((s) => !strings.has(s));
  console.log(`表示する日本語の文：${strings.size}件（英訳あり ${strings.size - missing.length}件／なし ${missing.length}件）`);
  console.log(`対応表の中で使われていない英訳：${unused.length}件`);
  if (process.argv.includes("--missing")) {
    const path = join(root, "data/translations/missing.json");
    writeFileSync(path, JSON.stringify(Object.fromEntries(missing.map((s) => [s, ""])), null, 2) + "\n");
    console.log(`→ ${path} に書き出しました`);
  } else if (process.argv.includes("--prune")) {
    unused.forEach((s) => delete dict[s]);
    writeFileSync(DICT_PATH, JSON.stringify(sortedDict(dict), null, 2) + "\n");
    console.log(`→ 使われていない英訳 ${unused.length}件を消しました`);
  } else {
    missing.slice(0, 10).forEach((s) => console.log(`  - ${s.slice(0, 60)}（${strings.get(s)}）`));
  }
}
