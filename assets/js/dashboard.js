// アクセス解析のダッシュボード（dashboard.html）
// パスワードは Supabase 側で確かめ、合っていたときだけ集計結果が返ってくる（このファイルにパスワードは書かない）。
// ?demo=1 を付けて開くと、見本データ（でたらめな数字）で画面の見た目を確かめられる。

const DASH_TZ = "Asia/Tokyo";
const TOKEN_KEY = "db-dash-token";
const BUCKET_KEY = "db-dash-bucket";
const BUCKETS = {
  day: { label: "日ごと", span: "30日間" },
  week: { label: "週ごと", span: "12週間" },
  month: { label: "月ごと", span: "12か月" },
  year: { label: "年ごと", span: "5年間" },
};
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

const dash = {
  el: document.getElementById("dashboard"),
  tooltip: document.getElementById("dash-tooltip"),
  demo: new URLSearchParams(location.search).get("demo") === "1",
  token: null,
  bucket: "day",
  offset: 0, // 0＝最新の期間、1＝ひとつ前の期間…
  data: null,
  names: null, // 管理ID → 商品名、カテゴリーID → カテゴリー名
};

function sessionGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
function sessionSet(key, v) { try { sessionStorage.setItem(key, v); } catch (e) {} }
function sessionRemove(key) { try { sessionStorage.removeItem(key); } catch (e) {} }
function localGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function localSet(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

// ---------- 日付（日本時間の「日付」で計算する） ----------
function todayJST() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: DASH_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const addMonths = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
function parseYMD(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// 表示する期間（from 以上 to 未満）
function currentRange(bucket = dash.bucket, offset = dash.offset) {
  const t = todayJST();
  let from, to;
  if (bucket === "day") {
    to = addDays(t, 1 - offset * 30);
    from = addDays(to, -30);
  } else if (bucket === "week") {
    const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
    to = addDays(monday, 7 - offset * 84);
    from = addDays(to, -84);
  } else if (bucket === "month") {
    to = addMonths(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)), 1 - offset * 12);
    from = addMonths(to, -12);
  } else {
    to = new Date(Date.UTC(t.getUTCFullYear() + 1 - offset * 5, 0, 1));
    from = new Date(Date.UTC(to.getUTCFullYear() - 5, 0, 1));
  }
  return { from, to };
}

function jpDate(d, withYear = true) {
  return `${withYear ? `${d.getUTCFullYear()}年` : ""}${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
function rangeLabel({ from, to }, bucket) {
  const last = addDays(to, -1);
  if (bucket === "year") return `${from.getUTCFullYear()}年〜${last.getUTCFullYear()}年`;
  if (bucket === "month") return `${from.getUTCFullYear()}年${from.getUTCMonth() + 1}月〜${last.getUTCFullYear()}年${last.getUTCMonth() + 1}月`;
  const sameYear = from.getUTCFullYear() === last.getUTCFullYear();
  return `${jpDate(from)}〜${jpDate(last, !sameYear)}`;
}
// グラフの横軸の目盛り
function tickLabel(t, bucket) {
  const d = parseYMD(t);
  if (bucket === "year") return `${d.getUTCFullYear()}年`;
  if (bucket === "month") return d.getUTCMonth() === 0 ? `${d.getUTCFullYear()}年1月` : `${d.getUTCMonth() + 1}月`;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
function bucketTitle(t, bucket) {
  const d = parseYMD(t);
  if (bucket === "year") return `${d.getUTCFullYear()}年`;
  if (bucket === "month") return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
  if (bucket === "week") return `${jpDate(d)}からの1週間`;
  return `${jpDate(d)}（${WEEKDAYS[(d.getUTCDay() + 6) % 7]}）`;
}

// ---------- 表示用の整形 ----------
const num = (n) => Number(n || 0).toLocaleString("ja-JP");
function duration(sec) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}分${s % 60 ? `${s % 60}秒` : ""}` : `${Math.floor(m / 60)}時間${m % 60}分`;
}
function delta(cur, prev) {
  if (prev === null || prev === undefined) return "";
  if (!prev) return cur ? `<span class="dash-delta up">新しく記録</span>` : "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  const cls = pct > 0 ? "up" : pct < 0 ? "down" : "";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "±";
  return `<span class="dash-delta ${cls}">${arrow}${Math.abs(pct)}%</span>`;
}

let regionNames = null;
let languageNames = null;
try { regionNames = new Intl.DisplayNames(["ja"], { type: "region" }); } catch (e) {}
try { languageNames = new Intl.DisplayNames(["ja"], { type: "language" }); } catch (e) {}
function flag(code) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
function countryName(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) return "不明";
  try { return regionNames ? regionNames.of(code) : code; } catch (e) { return code; }
}
function langName(code) {
  if (!code || code === "unknown") return "不明";
  try { return languageNames ? languageNames.of(code) : code; } catch (e) { return code; }
}
const DEVICE_NAMES = { mobile: "スマホ", tablet: "タブレット", desktop: "パソコン", unknown: "不明" };
const SITE_NAMES = {
  "(direct)": "直接（ブックマークなど）",
  "www.google.com": "Google 検索", "www.google.co.jp": "Google 検索", "search.yahoo.co.jp": "Yahoo! 検索",
  "www.bing.com": "Bing 検索", "duckduckgo.com": "DuckDuckGo", "t.co": "X（旧Twitter）", "x.com": "X（旧Twitter）",
  "twitter.com": "X（旧Twitter）", "www.instagram.com": "Instagram", "l.instagram.com": "Instagram",
  "www.facebook.com": "Facebook", "m.facebook.com": "Facebook", "lm.facebook.com": "Facebook",
  "auctions.yahoo.co.jp": "ヤフオク", "page.auctions.yahoo.co.jp": "ヤフオク", "jp.mercari.com": "メルカリ",
  "shopping.bookoff.co.jp": "ブックオフ", "search.rakuten.co.jp": "楽天市場", "item.rakuten.co.jp": "楽天市場",
  "www.suruga-ya.jp": "駿河屋", "order.mandarake.co.jp": "まんだらけ", "www.mandarake.co.jp": "まんだらけ",
  "paypayfleamarket.yahoo.co.jp": "Yahoo!フリマ", "www.megahouse.co.jp": "メガハウス", "ja.wikipedia.org": "Wikipedia",
  "github.com": "GitHub",
};
const siteName = (host) => SITE_NAMES[host] ? `${SITE_NAMES[host]}${host.startsWith("(") ? "" : `<small>${escapeHTML(host)}</small>`}` : escapeHTML(host || "不明");

function pageName(p) {
  if (p.page_type === "top") return { name: "トップページ", href: "index.html" };
  if (p.page_type === "item" && p.item_id) {
    const title = dash.names?.items.get(p.item_id);
    return { name: `${p.item_id} ${title || ""}`.trim(), href: itemURL(p.item_id) };
  }
  return { name: p.title || "その他のページ", href: null };
}

// ---------- 商品名の読み込み（ページ名の表示用） ----------
async function loadNames() {
  const items = new Map();
  const categories = new Map();
  try {
    const data = await loadCollection();
    for (const c of data.categories || []) categories.set(c.id, c.label);
    for (const it of data.items || []) {
      items.set(it.id, cardTitle(it));
      for (const f of it.figures || []) {
        const name = f.name?.value || `No.${f.no}`;
        items.set(f.id, `${cardTitle(it)} ${f.bonus ? "ボーナスパーツ：" : ""}${name}`);
      }
    }
  } catch (e) {}
  return { items, categories };
}

// ---------- 通信 ----------
async function fetchData() {
  const range = currentRange();
  if (dash.demo) return demoData(range, dash.bucket);
  return window.DBAnalytics.rpc("dashboard_data", {
    p_token: dash.token, p_from: ymd(range.from), p_to: ymd(range.to), p_bucket: dash.bucket, p_tz: DASH_TZ,
  });
}

// ---------- この端末を記録しない設定（パスワードなしで切り替えられる。端末のブラウザに保存するだけ） ----------
function optoutHTML() {
  const off = window.DBAnalytics.isOptedOut();
  return `<div class="dash-optout" id="dash-optout-box">
    <h3 class="sub-title">この端末のアクセス</h3>
    <p class="dash-optout-status ${off ? "is-off" : ""}" aria-live="polite">いまの設定：<strong>${off ? "記録しない" : "記録する"}</strong></p>
    <button type="button" class="dash-btn ${off ? "" : "dash-btn-primary"}" id="dash-optout">${off ? "記録する設定に戻す" : "記録しない設定にする"}</button>
    <p class="dash-note">ボタンを押すとすぐに切り替わります（パスワードの入力や保存は不要）。自分のアクセスを数えないための設定で、スマホ・PCなど端末ごとに1回ずつ押してください。</p>
  </div>`;
}
function bindOptout() {
  const btn = document.getElementById("dash-optout");
  if (!btn) return;
  btn.addEventListener("click", () => {
    window.DBAnalytics.setOptOut(!window.DBAnalytics.isOptedOut());
    const box = document.getElementById("dash-optout-box");
    box.outerHTML = optoutHTML();
    bindOptout();
    document.getElementById("dash-optout").focus();
  });
}

// ---------- ログイン画面 ----------
function renderLogin(message = "") {
  dash.el.innerHTML = `
    <form class="dash-login" id="dash-login">
      <p class="dash-login-lead">集計を見るには、パスワードを入れてください。</p>
      <label class="dash-field">
        <span>パスワード</span>
        <input type="password" id="dash-password" autocomplete="current-password" required>
      </label>
      <button type="submit" class="dash-btn dash-btn-primary">入る</button>
      ${message ? `<p class="notice notice-warn" role="alert">${message}</p>` : ""}
      <p class="dash-login-demo"><a href="dashboard.html?demo=1">見本データで画面を見る</a>（数字はでたらめです）</p>
    </form>
    <div class="dash-login dash-login-sub">${optoutHTML()}</div>`;
  bindOptout();
  const form = document.getElementById("dash-login");
  const input = document.getElementById("dash-password");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    btn.textContent = "確認中…";
    try {
      const res = await window.DBAnalytics.rpc("dashboard_login", { p_site: window.DBAnalytics.config.site, p_password: input.value });
      if (res && res.ok) {
        dash.token = res.token;
        sessionSet(TOKEN_KEY, res.token);
        await showDashboard();
        return;
      }
      renderLogin(res && res.locked
        ? "パスワードの間違いが続いたため、しばらく（15分ほど）受け付けを止めています。時間をおいて試してください。"
        : "パスワードが違います。");
    } catch (err) {
      renderLogin(`集計のサーバーにつながりませんでした（${escapeHTML(err.message)}）。通信状態を確かめて、もう一度試してください。`);
    }
  });
}

// ---------- ダッシュボード本体 ----------
async function showDashboard() {
  dash.el.innerHTML = `<p class="notice">集計を読み込み中…</p>`;
  if (!dash.names) dash.names = await loadNames();
  await reload();
}

async function reload() {
  try {
    const data = await fetchData();
    if (!data || data.ok === false) {
      if (data && data.error === "unauthorized") {
        sessionRemove(TOKEN_KEY);
        dash.token = null;
        renderLogin("ログインの有効期限（12時間）が切れました。もう一度パスワードを入れてください。");
        return;
      }
      throw new Error(data?.error || "集計を受け取れませんでした");
    }
    dash.data = data;
    render();
  } catch (err) {
    dash.el.innerHTML = `<p class="notice notice-warn">集計を読み込めませんでした（${escapeHTML(err.message)}）。<button type="button" class="dash-btn" id="dash-retry">もう一度読み込む</button></p>`;
    document.getElementById("dash-retry").addEventListener("click", reload);
  }
}

function render() {
  const d = dash.data;
  const range = currentRange();
  const s = d.summary || {};
  const p = d.prev || {};
  const firstView = d.first_view ? new Date(d.first_view) : null;

  dash.el.innerHTML = `
    ${dash.demo ? `<p class="notice dash-demo-note"><strong>見本データを表示中です。</strong>数字はでたらめです。本当の集計は<a href="dashboard.html">パスワードを入れて</a>見られます。</p>` : ""}

    <div class="dash-controls" role="group" aria-label="集計の期間">
      <div class="dash-tabs" role="tablist" aria-label="グラフの単位">
        ${Object.entries(BUCKETS).map(([k, b]) => `<button type="button" role="tab" class="dash-tab" data-bucket="${k}" aria-selected="${k === dash.bucket}">${b.label.replace("ごと", "")}</button>`).join("")}
      </div>
      <div class="dash-period">
        <button type="button" class="dash-btn dash-nav" id="dash-prev" aria-label="前の期間">‹</button>
        <span class="dash-period-label"><strong>${escapeHTML(rangeLabel(range, dash.bucket))}</strong><small>${BUCKETS[dash.bucket].label}・${BUCKETS[dash.bucket].span}</small></span>
        <button type="button" class="dash-btn dash-nav" id="dash-next" aria-label="次の期間" ${dash.offset === 0 ? "disabled" : ""}>›</button>
      </div>
    </div>

    <div class="dash-stats">
      ${statTile("表示回数", num(s.views), delta(s.views, p.views), "ページが開かれた回数（PV）")}
      ${statTile("訪問者", num(s.visitors), delta(s.visitors, p.visitors), "端末の数（同じ人でもスマホとPCは別）")}
      ${statTile("訪問", num(s.sessions), delta(s.sessions, p.sessions), "30分以上あくと別の訪問")}
      ${statTile("平均滞在", duration(s.avg_duration), delta(s.avg_duration, p.avg_duration), "1ページを見ていた時間")}
      ${statTile("初めての訪問者", num(s.new_visitors), "", "初めてサイトを開いた端末")}
      ${statTile("1ページで帰った割合", s.bounce_rate === null || s.bounce_rate === undefined ? "—" : `${s.bounce_rate}%`, "", "直帰率。低いほど他のページも見られている")}
    </div>
    <p class="dash-note">▲▼は、すぐ前の同じ長さの期間との比較です。</p>

    ${dashSection("trend", "アクセスの推移", `
      <div class="dash-legend" aria-hidden="true"><span class="lg-bar"></span>表示回数<span class="lg-line"></span>訪問者</div>
      <div class="dash-chart" id="chart-trend"></div>
      ${tableDetails(["期間", "表示回数", "訪問者"], (d.series || []).map((r) => [bucketTitle(r.t, d.bucket), num(r.views), num(r.visitors)]))}
    `)}

    <div class="dash-grid">
      ${dashSection("hours", "時間帯（日本時間）", `
        <div class="dash-chart" id="chart-hours"></div>
        ${tableDetails(["時間帯", "表示回数"], (d.hours || []).map((r) => [`${r.h}時台`, num(r.views)]))}
      `)}
      ${dashSection("heat", "曜日 × 時間帯", `
        <div class="dash-chart" id="chart-heat"></div>
        <p class="dash-note">色が濃いほどアクセスが多い時間です。</p>
      `)}
    </div>

    <div class="dash-grid">
      ${dashSection("countries", "国・地域", barList((d.countries || []).map((r) => ({
        label: `<span class="dash-flag">${flag(r.country)}</span>${escapeHTML(countryName(r.country))}`, value: r.views, sub: `${num(r.visitors)}人`,
      }))) + `<p class="dash-note">国は通信経路、または端末の時刻設定（タイムゾーン）から判定しています。旅行中や設定によってはずれることがあります。</p>`)}
      ${dashSection("referrers", "どこから来たか", barList((d.referrers || []).map((r) => ({ label: siteName(r.host), value: r.views }))) +
        `<p class="dash-note">訪問の最初のページで数えています。「直接」は、ブックマーク・URLの入力・LINEなどのアプリから開いた場合です。</p>`)}
    </div>

    ${dashSection("pages", "よく見られたページ", pagesTable(d.pages || []))}

    <div class="dash-grid">
      ${dashSection("categories", "カテゴリー別（商品ページ）", barList((d.categories || []).map((r) => ({
        label: escapeHTML(dash.names?.categories.get(r.category) || r.category), value: r.views,
      }))))}
      ${dashSection("events", "押された外部リンク・操作", barList((d.events || []).map((r) => ({
        label: r.name === "photo_open" ? "写真の拡大" : r.name === "outbound" ? siteName(r.target) : escapeHTML(`${r.name} ${r.target || ""}`), value: r.count,
      }))) + `<p class="dash-note">相場の検索結果・公式ページなど、ほかのサイトへのリンクが押された回数です。</p>`)}
    </div>

    <div class="dash-grid dash-grid-3">
      ${dashSection("devices", "端末", barList((d.devices || []).map((r) => ({ label: escapeHTML(DEVICE_NAMES[r.name] || r.name), value: r.views }))))}
      ${dashSection("browsers", "ブラウザ・OS", `<h3 class="sub-title">ブラウザ</h3>${barList((d.browsers || []).map((r) => ({ label: escapeHTML(r.name), value: r.views })))}
        <h3 class="sub-title">OS</h3>${barList((d.os || []).map((r) => ({ label: escapeHTML(r.name), value: r.views })))}`)}
      ${dashSection("langs", "端末の言語", barList((d.langs || []).map((r) => ({ label: escapeHTML(langName(r.name)), value: r.views }))))}
    </div>

    ${dashSection("settings", "設定", `
      <div class="dash-settings">
        <div class="dash-setting">${optoutHTML()}</div>
        <div class="dash-setting">
          <h3 class="sub-title">パスワード</h3>
          <details class="dash-pass-box">
            <summary>パスワードを変更する（必要なときだけ）</summary>
            <form id="dash-passform" class="dash-passform">
              <label class="dash-field"><span>新しいパスワード（4文字以上）</span><input type="password" id="dash-new1" autocomplete="new-password" minlength="4" required></label>
              <label class="dash-field"><span>もう一度</span><input type="password" id="dash-new2" autocomplete="new-password" minlength="4" required></label>
              <button type="submit" class="dash-btn">パスワードを変更する</button>
              <p class="dash-note" id="dash-pass-msg" aria-live="polite"></p>
            </form>
          </details>
        </div>
        <div class="dash-setting">
          <h3 class="sub-title">記録について</h3>
          <p class="dash-note">記録の開始：${firstView ? escapeHTML(firstView.toLocaleString("ja-JP", { timeZone: DASH_TZ, dateStyle: "long", timeStyle: "short" })) : "まだ記録がありません"}<br>
          IPアドレス・名前などの個人情報は保存していません。端末・訪問の番号はランダムな値です。</p>
          <button type="button" class="dash-btn" id="dash-logout">ログアウト</button>
        </div>
      </div>
    `)}
  `;

  bindControls();
  drawCharts();
}

function statTile(label, value, deltaHTML, help) {
  return `<div class="dash-stat"><span class="dash-stat-label">${escapeHTML(label)}</span><span class="dash-stat-value">${value}</span>${deltaHTML}<span class="dash-stat-help">${escapeHTML(help)}</span></div>`;
}
function dashSection(id, title, body) {
  return `<section class="dash-section" id="dash-${id}" aria-labelledby="dash-${id}-title"><h2 class="dash-section-title" id="dash-${id}-title">${escapeHTML(title)}</h2>${body}</section>`;
}
function emptyBox() {
  return `<p class="dash-empty">この期間の記録はまだありません。</p>`;
}
// 横棒の一覧（ラベル・棒・数）
function barList(rows) {
  if (!rows.length) return emptyBox();
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<ol class="dash-bars">${rows.map((r) => `
    <li><span class="dash-bar-label">${r.label}</span>
      <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${Math.max(2, (r.value / max) * 100)}%"></span></span>
      <span class="dash-bar-value">${num(r.value)}${r.sub ? `<small>${escapeHTML(r.sub)}</small>` : ""}</span></li>`).join("")}</ol>`;
}
function tableDetails(head, rows) {
  if (!rows.length) return "";
  return `<details class="more-box dash-table-box"><summary>表で見る</summary><div class="table-scroll"><table class="info-table history-table dash-table">
    <thead><tr>${head.map((h) => `<th scope="col">${escapeHTML(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHTML(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}
function pagesTable(pages) {
  if (!pages.length) return emptyBox();
  return `<div class="table-scroll"><table class="info-table history-table dash-table dash-pages">
    <thead><tr><th scope="col">ページ</th><th scope="col">表示回数</th><th scope="col">訪問者</th><th scope="col">平均滞在</th><th scope="col">読んだ位置</th></tr></thead>
    <tbody>${pages.map((p) => {
      const pg = pageName(p);
      return `<tr><td class="dash-page-name">${pg.href ? `<a href="${escapeHTML(pg.href)}">${escapeHTML(pg.name)}</a>` : escapeHTML(pg.name)}</td>
        <td>${num(p.views)}</td><td>${num(p.visitors)}</td><td>${duration(p.avg_duration)}</td><td>${p.avg_scroll === null || p.avg_scroll === undefined ? "—" : `${p.avg_scroll}%`}</td></tr>`;
    }).join("")}</tbody></table></div>
    <p class="dash-note">「読んだ位置」は、ページのどこまで下に進んだかの平均（100%＝最後まで）。</p>`;
}

function bindControls() {
  dash.el.querySelectorAll(".dash-tab").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.bucket === dash.bucket) return;
    dash.bucket = b.dataset.bucket;
    dash.offset = 0;
    localSet(BUCKET_KEY, dash.bucket);
    reload();
  }));
  document.getElementById("dash-prev").addEventListener("click", () => { dash.offset++; reload(); });
  document.getElementById("dash-next").addEventListener("click", () => { if (dash.offset > 0) { dash.offset--; reload(); } });

  bindOptout();

  document.getElementById("dash-passform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("dash-pass-msg");
    const a = document.getElementById("dash-new1").value;
    const b = document.getElementById("dash-new2").value;
    if (a !== b) { msg.textContent = "2つの入力が一致しません。"; return; }
    if (dash.demo) { msg.textContent = "見本データの表示中は変更できません。"; return; }
    try {
      const res = await window.DBAnalytics.rpc("dashboard_change_password", { p_token: dash.token, p_new: a });
      msg.textContent = res && res.ok ? "パスワードを変更しました。次からは新しいパスワードで入ってください。"
        : res && res.error === "too_short" ? "4文字以上にしてください。" : "変更できませんでした。もう一度ログインしてから試してください。";
      if (res && res.ok) e.target.reset();
    } catch (err) {
      msg.textContent = `変更できませんでした（${err.message}）。`;
    }
  });

  document.getElementById("dash-logout").addEventListener("click", async () => {
    if (!dash.demo && dash.token) {
      try { await window.DBAnalytics.rpc("dashboard_logout", { p_token: dash.token }); } catch (e) {}
    }
    sessionRemove(TOKEN_KEY);
    dash.token = null;
    if (dash.demo) location.href = "dashboard.html";
    else renderLogin("ログアウトしました。");
  });
}

// ---------- グラフ（SVG を手で描く。色はサイトの変数を使う） ----------
const SVG_NS = "http://www.w3.org/2000/svg";
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function drawCharts() {
  const d = dash.data;
  drawColumns(document.getElementById("chart-trend"), (d.series || []).map((r) => ({
    label: tickLabel(r.t, d.bucket), title: bucketTitle(r.t, d.bucket), value: r.views, line: r.visitors,
  })), { height: 240, lineName: "訪問者" });
  drawColumns(document.getElementById("chart-hours"), (d.hours || []).map((r) => ({
    label: `${r.h}`, title: `${r.h}時台（${r.h}:00〜${r.h}:59）`, value: r.views,
  })), { height: 200, xEvery: 3, xSuffix: "時" });
  drawHeatmap(document.getElementById("chart-heat"), d.weekday_hour || []);
}

// 縦棒（表示回数）＋折れ線（訪問者）。横軸は1本、縦軸も1本（同じ「回数・人数」の単位）
function drawColumns(box, rows, opts) {
  if (!box) return;
  box.innerHTML = "";
  if (!rows.length) { box.innerHTML = emptyBox(); return; }
  const W = Math.max(280, box.clientWidth);
  const H = opts.height;
  const m = { top: 12, right: 8, bottom: 26, left: 36 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const maxV = niceMax(Math.max(...rows.map((r) => Math.max(r.value, r.line || 0)), 1));
  const step = iw / rows.length;
  const barW = Math.max(2, Math.min(28, step - 2));
  const y = (v) => m.top + ih - (v / maxV) * ih;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("class", "dash-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `グラフ。最大 ${num(Math.max(...rows.map((r) => r.value)))}。数値は「表で見る」で確認できます。`);

  let html = "";
  // 目盛りの横線（控えめ）
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i;
    const yy = y(v);
    html += `<line class="dash-grid-line${i === 0 ? " base" : ""}" x1="${m.left}" x2="${W - m.right}" y1="${yy}" y2="${yy}"/>`;
    html += `<text class="dash-axis" x="${m.left - 6}" y="${yy + 4}" text-anchor="end">${num(Math.round(v))}</text>`;
  }
  // 横軸のラベル（重ならないように間引く）
  const every = opts.xEvery || Math.max(1, Math.ceil(rows.length / Math.floor(iw / 46)));
  rows.forEach((r, i) => {
    const cx = m.left + step * i + step / 2;
    if (i % every === 0) html += `<text class="dash-axis" x="${cx}" y="${H - 8}" text-anchor="middle">${escapeHTML(r.label)}${opts.xSuffix && i === 0 ? escapeHTML(opts.xSuffix) : ""}</text>`;
    if (r.value > 0) {
      const top = y(r.value);
      const h = m.top + ih - top;
      const rad = Math.min(3, barW / 2, h);
      html += `<path class="dash-col" data-i="${i}" d="M${cx - barW / 2},${m.top + ih} V${top + rad} Q${cx - barW / 2},${top} ${cx - barW / 2 + rad},${top} H${cx + barW / 2 - rad} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + rad} V${m.top + ih} Z"/>`;
    }
  });
  // 折れ線（訪問者）
  if (rows.some((r) => r.line !== undefined)) {
    const pts = rows.map((r, i) => `${m.left + step * i + step / 2},${y(r.line || 0)}`);
    html += `<polyline class="dash-line" points="${pts.join(" ")}"/>`;
    if (rows.length <= 31) {
      rows.forEach((r, i) => { html += `<circle class="dash-dot" cx="${m.left + step * i + step / 2}" cy="${y(r.line || 0)}" r="3.5"/>`; });
    }
  }
  html += `<line class="dash-cursor" id="${box.id}-cursor" x1="0" x2="0" y1="${m.top}" y2="${m.top + ih}" visibility="hidden"/>`;
  // マウス・指で触れる範囲（棒より広い）
  rows.forEach((r, i) => {
    html += `<rect class="dash-hit" data-i="${i}" x="${m.left + step * i}" y="${m.top}" width="${step}" height="${ih}"/>`;
  });
  svg.innerHTML = html;
  box.appendChild(svg);

  const cursor = svg.querySelector(".dash-cursor");
  const show = (e, i) => {
    const r = rows[i];
    const cx = m.left + step * i + step / 2;
    cursor.setAttribute("x1", cx);
    cursor.setAttribute("x2", cx);
    cursor.setAttribute("visibility", "visible");
    svg.querySelectorAll(".dash-col").forEach((c) => c.classList.toggle("is-active", c.dataset.i === String(i)));
    showTooltip(e, `<strong>${escapeHTML(r.title)}</strong><span><i class="tt-bar"></i>表示回数 ${num(r.value)}</span>${r.line !== undefined ? `<span><i class="tt-line"></i>${escapeHTML(opts.lineName)} ${num(r.line)}</span>` : ""}`);
  };
  svg.querySelectorAll(".dash-hit").forEach((hit) => {
    const i = Number(hit.dataset.i);
    hit.addEventListener("pointermove", (e) => show(e, i));
    hit.addEventListener("pointerdown", (e) => show(e, i));
  });
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return; // 指で触れたときは、離しても吹き出しを残す（画面を動かすと消える）
    cursor.setAttribute("visibility", "hidden");
    svg.querySelectorAll(".dash-col.is-active").forEach((c) => c.classList.remove("is-active"));
    hideTooltip();
  });
}

// 曜日 × 時間帯のマス目（色の濃さ＝アクセスの多さ。1つの色の濃淡だけで表す）
function drawHeatmap(box, cells) {
  if (!box) return;
  box.innerHTML = "";
  const map = new Map(cells.map((c) => [`${c.d}-${c.h}`, c.views]));
  const max = Math.max(0, ...cells.map((c) => c.views));
  if (!max) { box.innerHTML = emptyBox(); return; }
  const W = Math.max(280, box.clientWidth);
  const left = 22;
  const top = 4;
  const gap = 2;
  const cw = (W - left - 2) / 24;
  const ch = Math.min(22, Math.max(14, cw));
  const H = top + ch * 7 + 22;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("class", "dash-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "曜日と時間帯ごとのアクセスの多さ");
  let html = "";
  for (let d = 1; d <= 7; d++) {
    const yy = top + ch * (d - 1);
    html += `<text class="dash-axis" x="${left - 6}" y="${yy + ch / 2 + 4}" text-anchor="end">${WEEKDAYS[d - 1]}</text>`;
    for (let h = 0; h < 24; h++) {
      const v = map.get(`${d}-${h}`) || 0;
      // 5段階の濃さ（0件は紙の色）
      const level = v ? Math.min(5, Math.ceil((v / max) * 5)) : 0;
      html += `<rect class="dash-cell lv${level}" data-d="${d}" data-h="${h}" data-v="${v}" x="${left + cw * h + gap / 2}" y="${yy + gap / 2}" width="${cw - gap}" height="${ch - gap}" rx="2"/>`;
    }
  }
  for (let h = 0; h < 24; h += 6) html += `<text class="dash-axis" x="${left + cw * h + cw / 2}" y="${H - 6}" text-anchor="middle">${h}時</text>`;
  svg.innerHTML = html;
  box.appendChild(svg);
  const show = (e) => {
    const c = e.target.closest(".dash-cell");
    if (!c) return;
    svg.querySelectorAll(".dash-cell.is-active").forEach((x) => x.classList.remove("is-active"));
    c.classList.add("is-active");
    showTooltip(e, `<strong>${WEEKDAYS[c.dataset.d - 1]}曜日 ${c.dataset.h}時台</strong><span>表示回数 ${num(c.dataset.v)}</span>`);
  };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    svg.querySelectorAll(".dash-cell.is-active").forEach((x) => x.classList.remove("is-active"));
    hideTooltip();
  });
}

function showTooltip(e, html) {
  const tt = dash.tooltip;
  tt.innerHTML = html;
  tt.hidden = false;
  const pad = 12;
  const r = tt.getBoundingClientRect();
  let x = e.clientX + pad;
  let yy = e.clientY - r.height - pad;
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (x < 8) x = 8;
  if (yy < 8) yy = e.clientY + pad;
  tt.style.left = `${x}px`;
  tt.style.top = `${yy}px`;
}
function hideTooltip() { dash.tooltip.hidden = true; }

let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (!dash.data || window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawCharts, 150);
});
window.addEventListener("scroll", hideTooltip, { passive: true });

// ---------- 見本データ（?demo=1） ----------
function demoData(range, bucket) {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const series = [];
  let cur = range.from;
  while (cur < range.to) {
    const scale = bucket === "day" ? 1 : bucket === "week" ? 7 : bucket === "month" ? 30 : 365;
    const growth = 1 + series.length * 0.04;
    const views = Math.round((18 + rand() * 30) * scale * growth);
    series.push({ t: ymd(cur), views, visitors: Math.round(views * (0.35 + rand() * 0.15)) });
    cur = bucket === "day" ? addDays(cur, 1) : bucket === "week" ? addDays(cur, 7) : bucket === "month" ? addMonths(cur, 1) : new Date(Date.UTC(cur.getUTCFullYear() + 1, 0, 1));
  }
  const total = series.reduce((a, r) => a + r.views, 0);
  const shape = [2, 1, 1, 0.5, 0.4, 0.5, 1, 2, 3, 3, 3, 4, 6, 5, 4, 4, 5, 6, 7, 8, 10, 11, 9, 5];
  const shapeSum = shape.reduce((a, b) => a + b, 0);
  const hours = shape.map((v, h) => ({ h, views: Math.round((total * v) / shapeSum) }));
  const weekday_hour = [];
  for (let d = 1; d <= 7; d++) for (let h = 0; h < 24; h++) weekday_hour.push({ d, h, views: Math.round(shape[h] * (d >= 6 ? 1.6 : 1) * (2 + rand() * 3)) });
  const ids = [...(dash.names?.items.keys() || [])].slice(0, 12);
  const pages = [{ page_type: "top", item_id: null, views: Math.round(total * 0.4), visitors: Math.round(total * 0.2), avg_duration: 48, avg_scroll: 62 }]
    .concat(ids.map((id, i) => ({ page_type: "item", item_id: id, views: Math.round((total * 0.3) / (i + 2)), visitors: Math.round((total * 0.15) / (i + 2)), avg_duration: 30 + Math.round(rand() * 90), avg_scroll: 40 + Math.round(rand() * 55) })));
  const share = (list) => list.map(([name, r]) => ({ name, views: Math.round(total * r) }));
  return {
    ok: true, bucket, first_view: new Date(Date.UTC(2026, 9, 8)).toISOString(),
    summary: { views: total, visitors: Math.round(total * 0.4), sessions: Math.round(total * 0.55), new_visitors: Math.round(total * 0.3), avg_duration: 52, bounce_rate: 46 },
    prev: { views: Math.round(total * 0.82), visitors: Math.round(total * 0.36), sessions: Math.round(total * 0.5), avg_duration: 47 },
    series, hours, weekday_hour, pages,
    countries: [["JP", 0.86], ["US", 0.05], ["TW", 0.03], ["FR", 0.02], ["KR", 0.015], ["??", 0.01]].map(([country, r]) => ({ country, views: Math.round(total * r), visitors: Math.round(total * r * 0.4) })),
    categories: [["famicom", 0.3], ["capsule", 0.25], ["book", 0.12], ["sfc", 0.1]].map(([category, r]) => ({ category, views: Math.round(total * r) })),
    referrers: [["(direct)", 0.3], ["www.google.com", 0.12], ["t.co", 0.05], ["search.yahoo.co.jp", 0.03], ["www.instagram.com", 0.02]].map(([host, r]) => ({ host, views: Math.round(total * r) })),
    devices: share([["mobile", 0.68], ["desktop", 0.27], ["tablet", 0.05]]),
    browsers: share([["Safari", 0.5], ["Chrome", 0.4], ["Edge", 0.06]]),
    os: share([["iOS", 0.52], ["Windows", 0.22], ["Android", 0.18], ["macOS", 0.08]]),
    langs: share([["ja", 0.9], ["en", 0.07], ["zh", 0.03]]),
    events: [{ name: "outbound", target: "auctions.yahoo.co.jp", count: Math.round(total * 0.05) }, { name: "photo_open", target: null, count: Math.round(total * 0.08) },
      { name: "outbound", target: "jp.mercari.com", count: Math.round(total * 0.03) }, { name: "outbound", target: "shopping.bookoff.co.jp", count: Math.round(total * 0.01) }],
  };
}

// ---------- 開始 ----------
(async function start() {
  const saved = localGet(BUCKET_KEY);
  if (BUCKETS[saved]) dash.bucket = saved;
  dash.token = sessionGet(TOKEN_KEY);
  if (dash.demo || dash.token) await showDashboard();
  else renderLogin();
})();
