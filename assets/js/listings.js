// 出品中の一覧（listings.html）：data/listings.json（1日1回、tools/market/listings.mjs が更新）を表示し、絞り込む
// 絞り込みの条件は URL（?cat=famicom&site=yahoo など）に残す。人に送ったり、戻るボタンで戻ったりしても同じ条件で開く。

const LISTINGS_URL = "data/listings.json";
const PAGE_SIZE = 60;

const SITE_LABELS = {
  yahoo: t("ヤフオク", "Yahoo! Auctions"),
  yahoo_flea: t("Yahoo!フリマ", "Yahoo! Flea Market"),
  bookoff: t("ブックオフ", "BOOKOFF"),
  mercari: t("メルカリ", "Mercari"),
};
const FORMAT_LABELS = {
  auction: t("オークション", "Auction"),
  auction_buynow: t("オークション（即決あり）", "Auction + Buy now"),
  fixed: t("即決・定価", "Fixed price"),
};
// 状態：ヤフオクは出品名の語から分けた区分、ブックオフは中古／新品
const CONDITION_LABELS = {
  sealed: t("未開封・新品", "Sealed / new"),
  boxed: t("箱付き", "With box"),
  loose: t("箱なし（ソフトのみ等）", "No box (loose)"),
  other: t("中古・記載なし", "Used / not stated"),
  "bookoff-new": t("新品（ブックオフ）", "New (BOOKOFF)"),
  "bookoff-used": t("中古（ブックオフ）", "Used (BOOKOFF)"),
};
const SORTS = {
  price_asc: t("安い順", "Price: low to high"),
  price_desc: t("高い順", "Price: high to low"),
  ending: t("終了が近い順", "Ending soonest"),
  bids: t("入札が多い順", "Most bids"),
};

const state = {
  q: "",
  cats: new Set(),
  item: "",
  sites: new Set(),
  formats: new Set(),
  conds: new Set(),
  min: "",
  max: "",
  notOwned: true,
  sort: "price_asc",
  shown: PAGE_SIZE,
};

let DATA = null; // items.json
let LIST = null; // listings.json
const products = new Map(); // 管理ID → { name, category, owned, href }

const conditionKey = (l) => (l.site === "bookoff" ? (l.condition === "新品" ? "bookoff-new" : "bookoff-used") : l.grade?.key || "other");
const conditionLabel = (l) => CONDITION_LABELS[conditionKey(l)] || tx(l.grade?.label) || "—";
// 絞り込みに出す状態の一覧（決まった区分のあとに、商品ごとの区分（書籍の「付録カード付き」など）を続ける）
function conditionOptions() {
  const map = new Map();
  for (const k of Object.keys(CONDITION_LABELS)) if (LIST.listings.some((l) => conditionKey(l) === k)) map.set(k, CONDITION_LABELS[k]);
  for (const l of LIST.listings) if (!map.has(conditionKey(l))) map.set(conditionKey(l), conditionLabel(l));
  return [...map];
}

function buildProducts() {
  for (const it of DATA.items) {
    products.set(it.id, { name: cardTitle(it), category: it.category, owned: it.ownership?.status === "owned", href: itemURL(it.id) });
    for (const f of it.figures || []) {
      const name = tx(f.name?.value) || `No.${f.no}`;
      products.set(f.id, {
        name: `${cardTitle(it)} ${f.bonus ? t("ボーナスパーツ：", "Bonus part: ") : ""}${name}`,
        category: it.category,
        owned: f.ownership?.status === "owned",
        href: itemURL(f.id),
      });
    }
  }
}
const matchName = (m) => `${products.get(m.id)?.name || m.id}${m.variantLabel ? t(`（${m.variantLabel}）`, ` (${tx(m.variantLabel)})`) : ""}`;
// どの商品に当てはまる出品か（版ごとの検索に当てはまった出品は、商品そのものとして扱う）
const categoryOf = (l) => products.get(l.matches[0]?.id)?.category;
const allOwned = (l) => l.matches.every((m) => products.get(m.id)?.owned);

// ---------- URL と条件 ----------
function readURL() {
  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || "";
  state.cats = new Set((p.get("cat") || "").split(",").filter(Boolean));
  state.item = p.get("item") || "";
  state.sites = new Set((p.get("site") || "").split(",").filter(Boolean));
  state.formats = new Set((p.get("format") || "").split(",").filter(Boolean));
  state.conds = new Set((p.get("cond") || "").split(",").filter(Boolean));
  state.min = p.get("min") || "";
  state.max = p.get("max") || "";
  state.notOwned = p.get("owned") !== "all";
  state.sort = SORTS[p.get("sort")] ? p.get("sort") : "price_asc";
}
function writeURL() {
  const p = new URLSearchParams();
  const lang = new URLSearchParams(location.search).get("lang");
  if (lang) p.set("lang", lang);
  if (state.q) p.set("q", state.q);
  if (state.cats.size) p.set("cat", [...state.cats].join(","));
  if (state.item) p.set("item", state.item);
  if (state.sites.size) p.set("site", [...state.sites].join(","));
  if (state.formats.size) p.set("format", [...state.formats].join(","));
  if (state.conds.size) p.set("cond", [...state.conds].join(","));
  if (state.min) p.set("min", state.min);
  if (state.max) p.set("max", state.max);
  if (!state.notOwned) p.set("owned", "all");
  if (state.sort !== "price_asc") p.set("sort", state.sort);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  const min = state.min === "" ? null : Number(state.min);
  const max = state.max === "" ? null : Number(state.max);
  const now = Date.now() / 1000;
  const list = LIST.listings.filter((l) => {
    if (state.notOwned && allOwned(l)) return false;
    if (state.cats.size && !state.cats.has(categoryOf(l))) return false;
    if (state.item && !l.matches.some((m) => m.id === state.item || m.id.startsWith(`${state.item}-`))) return false;
    if (state.sites.size && !state.sites.has(l.site)) return false;
    if (state.formats.size && !state.formats.has(l.format)) return false;
    if (state.conds.size && !state.conds.has(conditionKey(l))) return false;
    if (min !== null && l.price < min) return false;
    if (max !== null && l.price > max) return false;
    if (q && !`${l.title} ${l.matches.map(matchName).join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const endKey = (l) => (l.endTime && l.endTime > now ? l.endTime : Infinity);
  const sorters = {
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    ending: (a, b) => endKey(a) - endKey(b) || a.price - b.price,
    bids: (a, b) => (b.bids || 0) - (a.bids || 0) || a.price - b.price,
  };
  return list.sort(sorters[state.sort]);
}

// ---------- メルカリ（オーナーが管理ページから取り込んだ分。Supabase に保存。docs/listings.md） ----------
let MERCARI_INFO = null; // { count, latest } または { error }
async function addMercari() {
  try {
    if (!window.DBAnalytics) throw new Error("no rpc");
    const res = await window.DBAnalytics.rpc("mercari_listings", { p_site: window.DBAnalytics.config.site });
    const targets = marketTargets(DATA);
    let latest = null;
    let count = 0;
    for (const m of res?.listings || []) {
      const matches = matchListing(m.title, m.keyword, targets);
      if (!matches.length) continue;
      count++;
      if (!latest || m.capturedAt > latest) latest = m.capturedAt;
      const grade = gradeOfTitle(m.title, gradesFor(DATA, matches[0]));
      LIST.listings.push({ id: `mercari:${m.id}`, site: "mercari", title: m.title, price: m.price, format: "fixed", url: m.url, grade, matches, capturedAt: m.capturedAt });
    }
    MERCARI_INFO = { count, latest };
  } catch (e) {
    MERCARI_INFO = { error: true };
  }
}
function capturedText(iso) {
  return new Date(iso).toLocaleString(LANG === "en" ? "en-US" : "ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------- 表示 ----------
function remaining(endTime) {
  if (!endTime) return "";
  const sec = endTime - Date.now() / 1000;
  if (sec <= 0) return t("終了済みの可能性", "May have ended");
  const m = Math.floor(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return t(`あと${d}日`, `${d} day${d > 1 ? "s" : ""} left`);
  if (h >= 1) return t(`あと${h}時間`, `${h} hour${h > 1 ? "s" : ""} left`);
  return t(`あと${Math.max(1, m)}分`, `${Math.max(1, m)} min left`);
}
function endDate(endTime) {
  if (!endTime) return "";
  return new Date(endTime * 1000).toLocaleString(LANG === "en" ? "en-US" : "ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function chip(group, value, label, on, extra = "") {
  return `<label class="lst-chip"><input type="checkbox" data-group="${group}" value="${escapeHTML(value)}"${on ? " checked" : ""}><span>${extra}${escapeHTML(label)}</span></label>`;
}

function filtersHTML() {
  const cats = DATA.categories;
  const catBall = (c) => dragonBallIcon(cats.indexOf(c) + 1, 16);
  const count = (fn) => LIST.listings.filter(fn).length;
  const siteKeys = Object.keys(SITE_LABELS).filter((k) => LIST.listings.some((l) => l.site === k));
  const options = cats.map((c) => {
    const items = DATA.items.filter((i) => i.category === c.id);
    return `<optgroup label="${escapeHTML(tx(c.label))}">${items.map((i) => `<option value="${escapeHTML(i.id)}"${state.item === i.id ? " selected" : ""}>${escapeHTML(`${i.id} ${cardTitle(i)}`)}</option>`).join("")}</optgroup>`;
  }).join("");
  return `
    <details class="lst-filters" id="lst-filters" open>
      <summary>${t("絞り込み・並べ替え", "Filter & sort")}</summary>
      <div class="lst-filter-grid">
        <label class="dash-field lst-wide"><span>${t("キーワード（出品名・商品名）", "Keyword (listing or item name)")}</span>
          <input type="search" id="lst-q" value="${escapeHTML(state.q)}" placeholder="${t("例：箱説付", "e.g. 箱説付")}"></label>
        <fieldset class="lst-group lst-wide"><legend>${t("カテゴリー", "Category")}</legend>
          ${cats.map((c) => chip("cats", c.id, `${tx(c.label)} (${count((l) => categoryOf(l) === c.id)})`, state.cats.has(c.id), catBall(c))).join("")}</fieldset>
        <label class="dash-field lst-wide"><span>${t("商品", "Item")}</span>
          <select id="lst-item"><option value="">${t("すべての商品", "All items")}</option>${options}</select></label>
        <fieldset class="lst-group"><legend>${t("サイト", "Site")}</legend>
          ${siteKeys.map((k) => chip("sites", k, `${SITE_LABELS[k]} (${count((l) => l.site === k)})`, state.sites.has(k))).join("")}</fieldset>
        <fieldset class="lst-group"><legend>${t("形式", "Format")}</legend>
          ${Object.entries(FORMAT_LABELS).map(([k, v]) => chip("formats", k, v, state.formats.has(k))).join("")}</fieldset>
        <fieldset class="lst-group lst-wide"><legend>${t("状態（出品名から判定）", "Condition (from the listing title)")}</legend>
          ${conditionOptions().map(([k, label]) => chip("conds", k, `${label} (${count((l) => conditionKey(l) === k)})`, state.conds.has(k))).join("")}</fieldset>
        <fieldset class="lst-group lst-price"><legend>${t("価格（円）", "Price (¥)")}</legend>
          <input type="number" id="lst-min" inputmode="numeric" min="0" step="100" value="${escapeHTML(state.min)}" placeholder="${t("下限", "Min")}" aria-label="${t("価格の下限", "Minimum price")}">
          <span>〜</span>
          <input type="number" id="lst-max" inputmode="numeric" min="0" step="100" value="${escapeHTML(state.max)}" placeholder="${t("上限", "Max")}" aria-label="${t("価格の上限", "Maximum price")}"></fieldset>
        <div class="lst-group lst-opts">
          <label class="lst-check"><input type="checkbox" id="lst-notowned"${state.notOwned ? " checked" : ""}> ${t("持っていない物だけ", "Only items I don't own")}</label>
          <label class="dash-field"><span>${t("並べ替え", "Sort")}</span>
            <select id="lst-sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${state.sort === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <button type="button" class="dash-btn" id="lst-reset">${t("条件をすべて外す", "Clear all filters")}</button>
        </div>
      </div>
    </details>`;
}

function cardHTML(l) {
  const site = SITE_LABELS[l.site] || l.site;
  const rem = remaining(l.endTime);
  const ended = l.endTime && l.endTime <= Date.now() / 1000;
  const ship = l.shipping === 0 ? t("送料無料", "Free shipping") : l.shipping ? t(`＋送料${formatYen(l.shipping)}`, `+ ${formatYen(l.shipping)} shipping`) : "";
  return `
    <li class="lst-card${ended ? " is-ended" : ""}">
      <div class="lst-badges">
        <span class="lst-site lst-site-${escapeHTML(l.site)}">${escapeHTML(site)}</span>
        <span class="tag">${escapeHTML(FORMAT_LABELS[l.format] || "")}</span>
        <span class="tag">${escapeHTML(conditionLabel(l))}</span>
        ${l.store ? `<span class="tag">${t("ストア", "Store")}</span>` : ""}
      </div>
      <a class="lst-name" href="${escapeHTML(l.url)}" target="_blank" rel="noopener noreferrer" lang="ja">${escapeHTML(l.title)}</a>
      <div class="lst-price">
        <strong>${escapeHTML(formatYen(l.price))}</strong>
        ${l.site === "yahoo" && l.format !== "fixed" ? `<span class="lst-sub">${t("現在価格", "Current bid")}</span>` : ""}
        ${l.buyNow && l.buyNow !== l.price ? `<span class="lst-sub">${t("即決", "Buy now")} ${escapeHTML(formatYen(l.buyNow))}</span>` : ""}
        ${ship ? `<span class="lst-sub">${escapeHTML(ship)}</span>` : ""}
      </div>
      <div class="lst-meta">
        ${l.format !== "fixed" ? `<span>${t("入札", "Bids")} ${l.bids || 0}</span>` : ""}
        ${l.capturedAt ? `<span>${t("取り込み：", "Captured: ")}${escapeHTML(capturedText(l.capturedAt))}<small>${t("（その時点の情報）", " (as of then)")}</small></span>` : ""}
        ${rem ? `<span class="${ended ? "lst-ended" : ""}">${escapeHTML(rem)}${l.endTime ? `<small>${t(`（${escapeHTML(endDate(l.endTime))}終了）`, ` (ends ${escapeHTML(endDate(l.endTime))})`)}</small>` : ""}</span>` : ""}
      </div>
      <div class="lst-matches">${l.matches.map((m) => {
        const p = products.get(m.id);
        return `<a class="lst-match${p?.owned ? " is-owned" : ""}" href="${escapeHTML(p?.href || itemURL(m.id))}">${escapeHTML(m.id)} ${escapeHTML(matchName(m))}${p?.owned ? ` <span class="badge badge-owned">${t("所持", "Owned")}</span>` : ""}</a>`;
      }).join("")}</div>
    </li>`;
}

// メルカリ：自動取得の対象外。条件に合う商品ごとに「出品中」の検索を開くリンクを出す
function mercariHTML() {
  const ids = [];
  for (const it of DATA.items) {
    if (state.cats.size && !state.cats.has(it.category)) continue;
    if (state.item && it.id !== state.item) continue;
    if (!it.market?.query) continue;
    if (state.notOwned && it.ownership?.status === "owned") continue;
    ids.push(it);
  }
  if (!ids.length) return "";
  const url = (it) => `https://jp.mercari.com/search?${new URLSearchParams({ keyword: it.market.mercariQuery || it.market.query, status: "on_sale" })}`;
  return `
    <details class="more-box lst-mercari">
      <summary>${t(`メルカリで探す（${ids.length}件の商品）`, `Search on Mercari (${ids.length} items)`)}</summary>
      <p class="sub-note">${t("メルカリは自動では集めず、オーナーがメルカリの画面から取り込んだ分だけを一覧に載せています（取り込んだ時点の情報）。下のリンクから、メルカリの「販売中」の最新の検索結果を開けます。", "Mercari listings are not collected automatically; only those captured by the owner from Mercari's pages are shown (as of the time captured). The links below open Mercari's latest \"on sale\" search results.")}</p>
      <ul class="lst-mercari-list">${ids.map((it) => `<li><a href="${escapeHTML(url(it))}" target="_blank" rel="noopener noreferrer">${escapeHTML(it.id)} ${escapeHTML(cardTitle(it))}</a></li>`).join("")}</ul>
    </details>`;
}

function renderResults() {
  const list = filtered();
  const box = document.getElementById("lst-results");
  const shown = list.slice(0, state.shown);
  box.innerHTML = `
    <p class="lst-count" aria-live="polite"><strong>${list.length.toLocaleString()}</strong>${t("件", list.length === 1 ? " listing" : " listings")}${list.length !== LIST.listings.length ? `<small>${t(`（全${LIST.listings.length}件中）`, ` (of ${LIST.listings.length})`)}</small>` : ""}</p>
    ${list.length ? `<ul class="lst-list">${shown.map(cardHTML).join("")}</ul>` : `<p class="empty-box">${t("条件に合う出品はありません。条件を減らしてみてください。", "No listings match. Try removing some filters.")}</p>`}
    ${list.length > shown.length ? `<button type="button" class="dash-btn lst-more" id="lst-more">${t(`もっと見る（残り${list.length - shown.length}件）`, `Show more (${list.length - shown.length} more)`)}</button>` : ""}
    ${mercariHTML()}`;
  const more = document.getElementById("lst-more");
  if (more) more.addEventListener("click", () => { state.shown += PAGE_SIZE; renderResults(); });
}

function bindFilters() {
  const root = document.getElementById("listings");
  const changed = () => { state.shown = PAGE_SIZE; writeURL(); renderResults(); };
  root.querySelectorAll("input[data-group]").forEach((el) => el.addEventListener("change", () => {
    const set = state[el.dataset.group];
    if (el.checked) set.add(el.value); else set.delete(el.value);
    changed();
  }));
  let timer = null;
  document.getElementById("lst-q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; changed(); }, 200);
  });
  document.getElementById("lst-item").addEventListener("change", (e) => { state.item = e.target.value; changed(); });
  document.getElementById("lst-min").addEventListener("input", (e) => { state.min = e.target.value; changed(); });
  document.getElementById("lst-max").addEventListener("input", (e) => { state.max = e.target.value; changed(); });
  document.getElementById("lst-notowned").addEventListener("change", (e) => { state.notOwned = e.target.checked; changed(); });
  document.getElementById("lst-sort").addEventListener("change", (e) => { state.sort = e.target.value; changed(); });
  document.getElementById("lst-reset").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    readURL();
    render();
  });
  // スマホでは、絞り込みの欄を最初は閉じておく（開け閉めはそのまま使える）
  if (window.matchMedia("(max-width: 640px)").matches && !location.search.replace(/[?&]lang=\w+/, "")) {
    document.getElementById("lst-filters").open = false;
  }
}

function render() {
  const m = LIST.meta || {};
  const updated = m.updatedAt ? new Date(m.updatedAt).toLocaleString(LANG === "en" ? "en-US" : "ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }) : "—";
  const srcLines = Object.entries(m.sources || {}).map(([k, s]) => `${escapeHTML(SITE_LABELS[k] || k)}${s.failed || s.skipped ? t("：一部取得できず", ": partly unavailable") : ""}`).join(t(" ／ ", " / "));
  document.getElementById("listings").innerHTML = `
    <p class="notice lst-about">${t(
      `収集対象の商品のうち、ヤフオク（Yahoo!フリマを含む）・ブックオフ・メルカリでいま出品中の物です。ヤフオク・ブックオフは<strong>1日1回（朝6時ごろ）自動で更新</strong>、メルカリはオーナーが取り込んだときに更新されるので、すでに売れたり終了したりしている出品もあります。状態は出品名の言葉から機械的に分けた目安です。`,
      `Listings currently for sale on Yahoo! Auctions (incl. Yahoo! Flea Market), BOOKOFF and Mercari for the items I collect. Yahoo! Auctions and BOOKOFF are <strong>updated automatically once a day (around 6 a.m. JST)</strong>; Mercari is updated when the owner captures it. Some may already be sold or ended. Conditions are a rough guide sorted automatically from listing titles. Listing titles are shown in Japanese as posted.`)}
      <br><small>${t("最終更新：", "Last updated: ")}${escapeHTML(updated)}${srcLines ? t(`（${srcLines}）`, ` (${srcLines})`) : ""}
      ／ ${t("メルカリ：", "Mercari: ")}${MERCARI_INFO?.error ? t("読み込めませんでした", "could not load") : MERCARI_INFO?.latest ? t(`${MERCARI_INFO.count}件（最後の取り込み ${escapeHTML(capturedText(MERCARI_INFO.latest))}）`, `${MERCARI_INFO.count} (last captured ${escapeHTML(capturedText(MERCARI_INFO.latest))})`) : t("まだ取り込みなし", "none captured yet")}</small></p>
    ${filtersHTML()}
    <div id="lst-results"></div>`;
  bindFilters();
  renderResults();
}

(async () => {
  const el = document.getElementById("listings");
  try {
    const [data, res] = await Promise.all([loadCollection(), fetch(LISTINGS_URL, { cache: "no-cache" })]);
    DATA = data;
    if (!res.ok) {
      el.innerHTML = `<p class="empty-box">${t("出品中の一覧はまだ作られていません（毎朝6時ごろに作られます）。", "The list has not been created yet (it is created every morning around 6 a.m. JST).")}</p>`;
      return;
    }
    LIST = await res.json();
    await addMercari();
    buildProducts();
    readURL();
    render();
  } catch (err) {
    showLoadError(el, err);
  }
})();
