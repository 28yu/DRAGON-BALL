// 日本語／英語の切り替え（2026-10-08 オーナー指示）
// - 最初に開いたときは端末の言語に合わせる（日本語の端末は日本語、それ以外は英語）。切り替えボタンで選んだ言語はその端末で覚える（localStorage の db-lang）。
// - 画面の決まった文言は、各処理の中で t("日本語", "English") と並べて書く。
// - 商品データの文章は data/items.json のまま（原本は日本語）。英語表示のときは対応表 data/translations/en.json で置き換える（tx）。
//   対応表にない文は日本語のまま表示する。英訳がない文は node tools/i18n.mjs で確かめられる。
// - <head> で読み込み、ページを描く前に言語を決める。

const LANG_KEY = "db-lang";
const LANG = (() => {
  // 管理用のページ（dashboard.html）は日本語だけ
  if (document.documentElement.dataset.langFixed) return document.documentElement.dataset.langFixed;
  // URL に ?lang=en / ?lang=ja が付いていればそちらを使って覚える（英語のページを人に紹介するとき用）
  const param = new URLSearchParams(location.search).get("lang");
  if (param === "ja" || param === "en") {
    try { localStorage.setItem(LANG_KEY, param); } catch (e) {}
    return param;
  }
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch (e) {}
  const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ja"];
  return /^ja\b/i.test(prefs[0] || "") ? "ja" : "en";
})();
document.documentElement.lang = LANG;

function t(ja, en) {
  return LANG === "en" ? en : ja;
}

// 商品データの文章の英訳（英語表示のときだけ対応表を使う）
let EN_DICT = null;
async function loadTranslations() {
  if (LANG !== "en" || EN_DICT) return;
  try {
    const res = await fetch("data/translations/en.json", { cache: "no-cache" });
    EN_DICT = res.ok ? await res.json() : {};
  } catch (e) {
    EN_DICT = {};
  }
}
function tx(value) {
  if (LANG !== "en" || value === null || value === undefined) return value;
  const key = String(value).trim();
  return (EN_DICT && EN_DICT[key]) || value;
}

// HTML に直接書いた文言：英語のときは data-en の文に差し替える（data-en-attr="属性名" なら属性を差し替え）
function applyStaticTranslations(root = document) {
  if (LANG !== "en") return;
  root.querySelectorAll("[data-en]").forEach((el) => {
    const attr = el.dataset.enAttr;
    if (attr) el.setAttribute(attr, el.dataset.en);
    else el.textContent = el.dataset.en;
  });
  const title = document.querySelector("meta[name='title-en']");
  if (title) document.title = title.content;
}

// 言語の切り替えボタン（押すと言語を覚えてページを読み込み直す）
function setupLangToggle() {
  const btn = document.getElementById("lang-toggle");
  if (!btn) return;
  const next = LANG === "en" ? "ja" : "en";
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><span class="lang-toggle-text">${next === "en" ? "English" : "日本語"}</span><span class="lang-short" aria-hidden="true">${next === "en" ? "EN" : "日本"}</span>`;
  btn.setAttribute("lang", next);
  btn.setAttribute("aria-label", next === "en" ? "Switch to English" : "日本語に切り替える");
  btn.addEventListener("click", () => {
    try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
    // 保存できない環境でも切り替わるよう、URL の lang も付け替えて開き直す
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    location.replace(url.toString());
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyStaticTranslations();
  setupLangToggle();
});
