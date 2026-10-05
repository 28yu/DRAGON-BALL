// 一覧ページと詳細ページで共通して使う処理。
// 商品データは data/items.json だけを原本とし、ここでは読み込みと表示用の整形のみ行う。

const DATA_URL = "data/items.json";

// 所持状況の表示名（items.json の ownership.status の値と対応）
const OWNERSHIP_LABELS = {
  unconfirmed: "未確認",
  not_owned: "未所持",
  ordered: "購入手続き中",
  owned: "所持",
};

// 情報の確度（各情報項目の status の値と対応）
const FACT_STATUS_LABELS = {
  unconfirmed: "未確認",
  reference: "参考情報・要確認",
  confirmed: "確認済み",
};

async function loadCollection() {
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`データの読み込みに失敗しました（HTTP ${res.status}）`);
  return res.json();
}

// HTML に埋め込む文字列は必ずこの関数を通す
function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "1996-02-01" → "1996年2月1日"、"1991-04" → "1991年4月"、"1991" → "1991年"
function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = String(value).split("-");
  let out = `${Number(y)}年`;
  if (m) out += `${Number(m)}月`;
  if (d) out += `${Number(d)}日`;
  return out;
}

function formatYen(value) {
  if (value === null || value === undefined || value === "") return "";
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function ownershipBadge(status) {
  const key = OWNERSHIP_LABELS[status] ? status : "unconfirmed";
  return `<span class="badge badge-${key}">${OWNERSHIP_LABELS[key]}</span>`;
}

// 値が無い・未確認の項目。「未確認」の文字はオーナー指示（2026-10-05）で表示せず、横棒にする
function unconfirmedText(text = "—") {
  return `<span class="unconfirmed-text">${escapeHTML(text)}</span>`;
}

// 画像があれば最初の1枚、なければ「画像未登録」のプレースホルダー
function thumbHTML(item) {
  const img = (item.images || [])[0];
  if (img && img.path) {
    return `<div class="thumb"><img src="${escapeHTML(img.path)}" alt="${escapeHTML(img.caption || item.title)}" loading="lazy">${referenceLabel(img)}</div>`;
  }
  return `<div class="thumb"><span class="thumb-placeholder">画像未登録</span></div>`;
}

// 未所持品の参考画像（オーナーの撮影ではない画像）に付けるラベル
// 「参考画像」ラベルはオーナー指示（2026-10-05）で表示しない（データの kind: "reference" は残す）
function referenceLabel(img) {
  return "";
}

function itemURL(id) {
  return `item.html?id=${encodeURIComponent(id)}`;
}

function showLoadError(container, err) {
  const isFile = location.protocol === "file:";
  container.innerHTML = `
    <div class="notice notice-warn">
      <strong>商品データを読み込めませんでした。</strong><br>
      ${escapeHTML(err.message)}<br>
      ${isFile
        ? "index.html をファイルとして直接開くと、ブラウザの制限でデータを読み込めません。README の「ローカルでの確認方法」に従って簡易サーバーを起動してください。"
        : "data/items.json の書式（カンマや括弧の対応）に誤りがないか確認してください。"}
    </div>`;
}

// 明るい／暗い配色の切り替えボタン。選んだ配色はブラウザに保存する（保存できない環境でも切り替えは動く）。
const THEME_ICONS = {
  // 押すと暗い表示になる（月）
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  // 押すと明るい表示になる（太陽）
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const root = document.documentElement;
  const render = () => {
    const dark = root.dataset.theme === "dark";
    btn.innerHTML = `${dark ? THEME_ICONS.light : THEME_ICONS.dark}<span class="theme-toggle-text">${dark ? "明るい表示" : "暗い表示"}</span>`;
    btn.setAttribute("aria-pressed", String(dark));
  };
  btn.addEventListener("click", () => {
    const dark = root.dataset.theme !== "dark";
    if (dark) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try { localStorage.setItem("db-theme", dark ? "dark" : "light"); } catch (e) {}
    render();
  });
  render();
}

setupThemeToggle();

// 一覧カードに出す名前。ドラゴンボールカプセルはセクション名で分かるので、先頭のシリーズ名を省いてシリーズ名だけにする
// （正式名称 title は変えず、詳細ページではそのまま表示する）
function cardTitle(item) {
  if (item.category !== "capsule") return item.title;
  const short = item.title.replace(/^ドラゴンボールカプセル・?/, "").replace(/^ネオ\s*/, "ネオ ").trim();
  return short || item.title;
}

// ドラゴンボールの絵（星の数 1〜7）。前後移動ボタン（四星球）と、トップページのカテゴリーの目印（2026-10-05 オーナー指示）で使う
const DB_STAR_POSITIONS = {
  1: [[32, 32]],
  2: [[24, 32], [40, 32]],
  3: [[32, 23], [23, 40], [41, 40]],
  4: [[23, 25], [41, 25], [23, 42], [41, 42]],
  5: [[32, 19], [20, 29], [44, 29], [25, 44], [39, 44]],
  6: [[23, 20], [41, 20], [17, 33], [47, 33], [23, 46], [41, 46]],
  7: [[32, 32], [32, 16], [45, 24], [45, 40], [32, 48], [19, 40], [19, 24]],
};
let dbBallCount = 0;
function dragonBallIcon(stars, size = 22, className = "db-icon") {
  const n = Math.min(7, Math.max(1, Number(stars) || 1));
  const scale = n <= 2 ? 0.7 : n <= 4 ? 0.5 : 0.42;
  const gid = `db-grad-${++dbBallCount}`;
  const starShapes = DB_STAR_POSITIONS[n]
    .map(([x, y]) => `<polygon transform="translate(${x} ${y}) scale(${scale})" points="0,-12 3.5,-4 12,-4 5.5,2 8,11 0,6 -8,11 -5.5,2 -12,-4 -3.5,-4"/>`)
    .join("");
  return `<svg class="${className}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <defs><radialGradient id="${gid}" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset=".35" stop-color="#ffb12e"/><stop offset="1" stop-color="#e2620b"/>
    </radialGradient></defs>
    <circle cx="32" cy="32" r="29" fill="url(#${gid})" stroke="#161616" stroke-width="${size < 30 ? 4 : 3}"/>
    <ellipse cx="21" cy="17" rx="9" ry="5" fill="#fff" opacity=".75" transform="rotate(-30 21 17)"/>
    <g fill="#d92d20">${starShapes}</g>
  </svg>`;
}
