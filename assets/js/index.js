// トップページ：コレクション概要とカテゴリー別一覧を表示する

function countByOwnership(items) {
  const counts = { owned: 0, not_owned: 0, ordered: 0, unconfirmed: 0 };
  for (const item of items) {
    const status = item.ownership?.status;
    counts[status in counts ? status : "unconfirmed"]++;
  }
  return counts;
}

function progressHTML(items, withBreakdown = true) {
  const total = items.length;
  const c = countByOwnership(items);
  const notOwned = c.not_owned + c.ordered;
  const pct = (n) => (total ? (n / total) * 100 : 0);
  return `
    <div class="progress" role="img" aria-label="${t(`所持 ${c.owned}点、未所持 ${notOwned}点、未確認 ${c.unconfirmed}点`, `Owned ${c.owned}, not owned ${notOwned}, unconfirmed ${c.unconfirmed}`)}">
      ${c.owned ? `<span class="p-owned" style="width:${pct(c.owned)}%"></span>` : ""}
      ${notOwned ? `<span class="p-notowned" style="width:${pct(notOwned)}%"></span>` : ""}
      ${c.unconfirmed ? `<span class="p-unconfirmed" style="width:${pct(c.unconfirmed)}%"></span>` : ""}
    </div>
    ${withBreakdown ? `<ul class="breakdown">
      <li class="b-owned">${t(`所持 ${c.owned}点`, `Owned ${c.owned}`)}</li>
      <li class="b-notowned">${t(`未所持 ${notOwned}点`, `Not owned ${notOwned}`)}</li>
      <li class="b-unconfirmed">${t(`未確認 ${c.unconfirmed}点`, `Unconfirmed ${c.unconfirmed}`)}</li>
    </ul>` : ""}`;
}

// カテゴリーの目印のボール：カテゴリーの並び順で星の数を変える（1番目＝一星球、2番目＝二星球…。2026-10-05 オーナー指示）
let categoryOrder = [];
function categoryBall(cat, size) {
  return dragonBallIcon(categoryOrder.indexOf(cat.id) + 1, size);
}

// カテゴリーごとの小さなカード（所持数 / 総数）
function categoryCardHTML(cat, items) {
  const owned = countByOwnership(items).owned;
  return `
    <a class="cat-card" href="#cat-${escapeHTML(cat.id)}">
      <span class="cat-card-label">${categoryBall(cat, 16)}${escapeHTML(tx(cat.label))}</span>
      <span class="cat-card-count">${owned}<small> / ${items.length}</small></span>
      ${progressHTML(items, false)}
    </a>`;
}

// 集計外のカテゴリー（ドラゴンボールカプセル）のカード。収集を始めるときのための準備（2026-10-06 オーナー指示）
// 上の数字は「全種そろったシリーズの数」。その下にシリーズごとのフィギュアの所持数のメーターを並べる
function meterHTML(owned, total) {
  return `<div class="progress" role="img" aria-label="${owned} / ${total}">${owned && total ? `<span class="p-owned" style="width:${(owned / total) * 100}%"></span>` : ""}</div>`;
}
function seriesCardHTML(cat, seriesList) {
  let complete = 0;
  // ボーナスパーツの数（2026-10-07 オーナー指示で追加）。「★コンプ」は今まで通り7体だけで判定する
  let bonusOwned = 0;
  let bonusTotal = 0;
  // フィギュアの総数（ボーナスパーツを除く。2026-10-07 オーナー指示で追加）
  let figOwned = 0;
  let figTotal = 0;
  const isOwned = (f) => f.ownership?.status === "owned";
  const rows = seriesList.map((s) => {
    const figs = regularFigures(s);
    const owned = figs.filter(isOwned).length;
    figOwned += owned;
    figTotal += figs.length;
    const done = figs.length > 0 && owned === figs.length;
    if (done) complete++;
    const bonus = (s.figures || []).filter((f) => f.bonus);
    const bOwned = bonus.filter(isOwned).length;
    bonusOwned += bOwned;
    bonusTotal += bonus.length;
    return `
      <li${done ? ' class="sm-done"' : ""}><a href="${itemURL(s.id)}">
        <span class="sm-name">${escapeHTML(cardTitle(s))}</span>
        <span class="sm-count">${owned}<small> / ${figs.length}${t("体", "")}</small>${bonus.length ? `<small class="sm-bonus">${t("＋ボーナス", "+ Bonus")} ${bOwned} / ${bonus.length}</small>` : ""}</span>
        ${meterHTML(owned, figs.length)}
      </a></li>`;
  }).join("");
  return `
    <div class="cat-card series-card">
      <a class="series-card-head" href="#cat-${escapeHTML(cat.id)}">
        <span class="cat-card-label">${categoryBall(cat, 16)}${escapeHTML(tx(cat.label))} <span class="badge badge-info">${t("集計外", "Not counted")}</span></span>
        <span class="cat-card-count">${complete}<small> / ${seriesList.length}</small><span class="series-unit">${t("シリーズ", "series")}</span></span>
      </a>
      ${meterHTML(complete, seriesList.length)}
      <p class="series-bonus-total">
        <span>${t("フィギュア", "Figures")} <strong>${figOwned}</strong><small> / ${figTotal}${t("体", "")}</small></span>
        ${bonusTotal ? `<span>${t("ボーナスパーツ", "Bonus parts")} <strong>${bonusOwned}</strong><small> / ${bonusTotal}</small></span>` : ""}
      </p>
      <details class="series-details" id="series-details-${escapeHTML(cat.id)}"${seriesOpen() ? " open" : ""}>
        <summary>${t(`シリーズごとの内訳（${seriesList.length}シリーズ）`, `Breakdown by series (${seriesList.length} series)`)}</summary>
        <ul class="series-meters">${rows}</ul>
      </details>
    </div>`;
}
// シリーズごとの内訳は折りたためる。初期表示は閉じた状態で、開け閉めを覚える（2026-10-06 オーナー指示）
function seriesOpen() {
  try { return localStorage.getItem("db-series-open") === "1"; } catch (e) { return false; }
}
function setupSeriesToggle() {
  document.querySelectorAll(".series-details").forEach((d) => {
    d.addEventListener("toggle", () => {
      try { localStorage.setItem("db-series-open", d.open ? "1" : "0"); } catch (e) {}
    });
  });
}

// コレクション概要の集計に含めるカテゴリーか（"inSummary": false のカテゴリーは情報のみ掲載で、集計しない）
function inSummary(cat) {
  return cat?.inSummary !== false;
}

function renderSummary(data) {
  const el = document.getElementById("summary");
  const summaryCats = data.categories.filter(inSummary);
  const all = data.items.filter((i) => summaryCats.some((cat) => cat.id === i.category));
  const c = countByOwnership(all);
  const rate = all.length ? Math.round((c.owned / all.length) * 100) : 0;

  const hero = `
    <div class="hero-card">
      <button type="button" class="rate-circle${rateStyle() === "plain" ? "" : " radar"}" id="rate-circle" aria-label="${t("所持率の表示を切り替える", "Switch the ownership rate display")}">
        <span class="rate-num">${rate}<small>%</small></span>
        <span class="rate-label">${c.unconfirmed > 0 ? t("所持率（暫定）", "Owned (provisional)") : t("所持率", "Owned")}</span>
      </button>
      <div class="hero-body">
        <p class="hero-label">${t("所持 / 収集対象", "Owned / Target items")}</p>
        <p class="hero-count">${c.owned}<small> / ${all.length}${t("点", "")}</small></p>
      </div>
      <div class="hero-progress">${progressHTML(all)}</div>
    </div>`;

  const cats = summaryCats
    .map((cat) => categoryCardHTML(cat, all.filter((i) => i.category === cat.id)))
    .join("") + data.categories
    .filter((cat) => !inSummary(cat))
    .map((cat) => seriesCardHTML(cat, data.items.filter((i) => i.category === cat.id)))
    .join("");

  // 所持状況が未確認の対象があるときだけ注意書きを出す（所持率は上の丸い表示で示す）
  const notice = c.unconfirmed > 0
    ? `<p class="notice">${t(`所持状況が未確認の対象が ${c.unconfirmed}点あります。収集進捗（所持率）は、全点の所持状況を確認した後に正しい値になります。`, `${c.unconfirmed} item(s) have an unconfirmed ownership status. The ownership rate becomes accurate once every item has been checked.`)}</p>`
    : "";

  // 「確認が必要な対象があります」のお知らせはオーナー指示（2026-10-05）で表示しない
  const alertItems = [];
  const alertNotice = alertItems.length
    ? `<p class="notice notice-warn">${t("確認が必要な対象があります：", "Items to check: ")}${alertItems
        .map((i) => `<a href="${itemURL(i.id)}">${escapeHTML(i.id)}</a>`)
        .join("、")}</p>`
    : "";

  el.innerHTML = `${hero}<div class="cat-grid">${cats}</div>${notice}${alertNotice}`;
  setupRateToggle();
  setupSeriesToggle();
}

// 所持率の丸：初期表示はドラゴンレーダー風。タップで今までの黄色い丸と切り替え、選んだ方を覚える（2026-10-05 オーナー指示）
function rateStyle() {
  try { return localStorage.getItem("db-rate-style") === "plain" ? "plain" : "radar"; } catch (e) { return "radar"; }
}
function setupRateToggle() {
  const btn = document.getElementById("rate-circle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const radar = btn.classList.toggle("radar");
    try { localStorage.setItem("db-rate-style", radar ? "radar" : "plain"); } catch (e) {}
  });
}

// ページ上部のカテゴリーメニュー（各カテゴリーの見出しへ移動するリンク）
function renderCategoryNav(data) {
  const el = document.getElementById("cat-nav");
  if (!el) return;
  el.innerHTML = `<li><a href="#summary-title">${t("概要", "Overview")}</a></li><li><a href="#search-title">${t("🔍 さがす", "🔍 Search")}</a></li>${data.categories
    .map((cat) => `<li><a href="#cat-${escapeHTML(cat.id)}">${categoryBall(cat, 18)}${escapeHTML(tx(cat.label))}</a></li>`)
    .join("")}<li class="nav-listings"><a href="listings.html">${t("🛒 出品中の一覧", "🛒 For sale now")}</a></li>`;
}

function itemCardHTML(item, cat) {
  const release = item.release?.value
    ? `<span>${escapeHTML(formatDate(item.release.value))}</span>`
    : "";
  // 「要確認」の札はオーナー指示（2026-10-05）で表示しない
  const alert = "";
  return `
    <li class="item-card" data-id="${escapeHTML(item.id)}">
      <a href="${itemURL(item.id)}">
        ${thumbHTML(item)}
        <div class="item-body">
          <span class="item-id">${escapeHTML(item.id)}</span>
          <h3 class="item-title">${escapeHTML(cardTitle(item))}</h3>
          <div class="item-meta">${inSummary(cat) ? ownershipBadge(item.ownership?.status) : `<span class="badge badge-info">${t("情報のみ", "Info only")}</span>`}${alert}${release}</div>
        </div>
      </a>
      <p class="fig-hits" hidden></p>
    </li>`;
}

function renderCategories(data) {
  const el = document.getElementById("categories");
  el.innerHTML = data.categories
    .map((cat) => {
      const items = data.items.filter((i) => i.category === cat.id);
      return `
        <section id="cat-${escapeHTML(cat.id)}" aria-labelledby="cat-${escapeHTML(cat.id)}-title">
          <div class="ball-title">${categoryBall(cat, 34)}<h2 class="section-title" id="cat-${escapeHTML(cat.id)}-title">${escapeHTML(tx(cat.label))}${t(`（${items.length}点）`, ` (${items.length})`)}</h2></div>
          ${inSummary(cat) ? "" : `<p class="info-only-note"><span class="badge badge-info">${t("情報のみ", "Info only")}</span> ${t("収集予定のシリーズです。コレクション概要の集計には含めていません。", "Series I plan to collect. Not counted in the collection overview.")}</p>`}
          <p class="section-desc">${escapeHTML(tx(cat.description || ""))}</p>
          <ul class="item-grid">${items.map((item) => itemCardHTML(item, cat)).join("")}</ul>
        </section>`;
    })
    .join("");
}

// ---------- 検索・絞り込み（2026-10-14 オーナー指示で追加） ----------
// 下のカテゴリー別一覧のカードを、条件に合うものだけ残して表示する。
// 条件は URL（?q=…&own=…&cat=…）に残すので、商品ページから戻っても同じ条件のまま。

// 比べやすい形にそろえる（全角・半角、大文字・小文字、カタカナ・ひらがな、空白と「・」の違いを無くす）
function normalizeSearch(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･]/g, "");
}

const OWN_FILTERS = [
  ["all", t("すべて", "All")],
  ["owned", t("所持", "Owned")],
  ["not_owned", t("未所持", "Not owned")],
  ["unconfirmed", t("未確認", "Unconfirmed")],
];
// 所持状況の絞り込み。「未所持」には購入手続き中も含める（概要の「未所持」と同じ数え方）
function matchOwn(status, own) {
  if (own === "all") return true;
  if (own === "not_owned") return status === "not_owned" || status === "ordered";
  if (own === "unconfirmed") return !OWNERSHIP_LABELS[status] || status === "unconfirmed";
  return status === own;
}

function searchChips(name, list, current) {
  return list
    .map(([value, label]) => `<label class="lst-chip"><input type="radio" name="${name}" value="${escapeHTML(value)}"${value === current ? " checked" : ""}><span>${label}</span></label>`)
    .join("");
}

function renderSearch(data) {
  const el = document.getElementById("search");
  if (!el) return;
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get("q") || "",
    own: OWN_FILTERS.some(([v]) => v === params.get("own")) ? params.get("own") : "all",
    cat: data.categories.some((c) => c.id === params.get("cat")) ? params.get("cat") : "all",
  };
  // 商品ごとに、探す対象の文字（管理ID・名前・英語名・フィギュアの名前）をまとめておく
  const index = data.items.map((item) => ({
    item,
    text: normalizeSearch([item.id, item.title, tx(item.title), cardTitle(item)].join(" ")),
    figures: (item.figures || []).map((f) => ({
      fig: f,
      text: normalizeSearch([f.id, f.name?.value, tx(f.name?.value)].join(" ")),
    })),
  }));

  el.innerHTML = `
    <div class="search-box">
      <label class="dash-field search-field">
        <span>${t("名前・管理ID・フィギュアの名前で探す", "Search by name, ID or figure name")}</span>
        <input type="search" id="search-q" value="${escapeHTML(state.q)}" placeholder="${t("例：フリーザ、FC-005、ピッコロ", "e.g. Freeza, FC-005, Piccolo")}" autocomplete="off" enterkeyhint="search">
      </label>
      <fieldset class="lst-group">
        <legend>${t("所持状況", "Ownership")}</legend>
        ${searchChips("own", OWN_FILTERS, state.own)}
      </fieldset>
      <fieldset class="lst-group">
        <legend>${t("カテゴリー", "Category")}</legend>
        ${searchChips("cat", [["all", t("すべて", "All")], ...data.categories.map((c) => [c.id, escapeHTML(tx(c.label))])], state.cat)}
      </fieldset>
      <p class="search-result" aria-live="polite"><span id="search-count"></span> <button type="button" class="text-button" id="search-reset" hidden>${t("条件を元に戻す", "Clear")}</button></p>
    </div>`;

  const input = el.querySelector("#search-q");
  const count = el.querySelector("#search-count");
  const reset = el.querySelector("#search-reset");
  const empty = document.createElement("p");
  empty.className = "empty-box search-empty";
  empty.textContent = t("条件に合う商品はありません。", "No items match.");
  empty.hidden = true;
  document.getElementById("categories").prepend(empty);

  const apply = () => {
    const words = state.q.split(/[\s　]+/).map(normalizeSearch).filter(Boolean);
    const active = words.length > 0 || state.own !== "all" || state.cat !== "all";
    let shown = 0;
    for (const { item, text, figures } of index) {
      const card = document.querySelector(`.item-card[data-id="${CSS.escape(item.id)}"]`);
      if (!card) continue;
      // 言葉は全部含むものだけ（スペースで区切ると「かつ」）。商品名で合わなくても、フィギュアの名前で合えば残す
      const hitFigs = words.length && !words.every((w) => text.includes(w))
        ? figures.filter((f) => words.every((w) => text.includes(w) || f.text.includes(w)))
        : [];
      const textOK = !words.length || words.every((w) => text.includes(w)) || hitFigs.length > 0;
      const ok = textOK && matchOwn(item.ownership?.status, state.own) && (state.cat === "all" || item.category === state.cat);
      card.hidden = !ok;
      if (ok) shown++;
      const hits = card.querySelector(".fig-hits");
      if (ok && hitFigs.length) {
        hits.innerHTML = `${t("一致したフィギュア：", "Matching figures: ")}${hitFigs
          .map(({ fig }) => `<a href="${itemURL(fig.id)}">${escapeHTML(tx(fig.name?.value) || fig.id)}</a>`)
          .join(t("、", ", "))}`;
        hits.hidden = false;
      } else {
        hits.hidden = true;
      }
    }
    // 1件も残らないカテゴリーは見出しごと隠す
    document.querySelectorAll("#categories > section").forEach((sec) => {
      sec.hidden = active && !sec.querySelector(".item-card:not([hidden])");
    });
    empty.hidden = shown > 0;
    count.innerHTML = active
      ? t(`<strong>${shown}</strong>点が見つかりました`, `<strong>${shown}</strong> found`)
      : t(`全<strong>${shown}</strong>点`, `<strong>${shown}</strong> items`);
    reset.hidden = !active;
    // 条件を URL に残す（履歴は増やさない）
    const p = new URLSearchParams(location.search);
    for (const [k, v, def] of [["q", state.q.trim(), ""], ["own", state.own, "all"], ["cat", state.cat, "all"]]) {
      if (v && v !== def) p.set(k, v); else p.delete(k);
    }
    const qs = p.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  };

  input.addEventListener("input", () => { state.q = input.value; apply(); });
  // 検索ボタン（スマホのキーボードの「検索」）を押したら、結果の一覧へ移る
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    input.blur();
    const first = document.querySelector("#categories > section:not([hidden])") || empty;
    first.scrollIntoView({ block: "start" });
  });
  el.addEventListener("change", (e) => {
    if (e.target.name === "own") state.own = e.target.value;
    if (e.target.name === "cat") state.cat = e.target.value;
    apply();
  });
  reset.addEventListener("click", () => {
    state.q = "";
    state.own = "all";
    state.cat = "all";
    input.value = "";
    el.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = r.value === "all"; });
    apply();
  });
  apply();
}

(async () => {
  try {
    const data = await loadCollection();
    categoryOrder = data.categories.map((cat) => cat.id);
    renderCategoryNav(data);
    renderSummary(data);
    renderCategories(data);
    renderSearch(data);
    const updated = document.getElementById("data-updated");
    if (updated && data.meta?.updatedAt) updated.textContent = formatDate(data.meta.updatedAt);
  } catch (err) {
    showLoadError(document.getElementById("summary"), err);
  }
})();
