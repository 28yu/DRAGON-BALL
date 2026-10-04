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
    <div class="progress" role="img" aria-label="所持 ${c.owned}点、未所持 ${notOwned}点、未確認 ${c.unconfirmed}点">
      ${c.owned ? `<span class="p-owned" style="width:${pct(c.owned)}%"></span>` : ""}
      ${notOwned ? `<span class="p-notowned" style="width:${pct(notOwned)}%"></span>` : ""}
      ${c.unconfirmed ? `<span class="p-unconfirmed" style="width:${pct(c.unconfirmed)}%"></span>` : ""}
    </div>
    ${withBreakdown ? `<ul class="breakdown">
      <li class="b-owned">所持 ${c.owned}点</li>
      <li class="b-notowned">未所持 ${notOwned}点</li>
      <li class="b-unconfirmed">未確認 ${c.unconfirmed}点</li>
    </ul>` : ""}`;
}

// カテゴリーごとの小さなカード（所持数 / 総数）
function categoryCardHTML(cat, items) {
  const owned = countByOwnership(items).owned;
  return `
    <a class="cat-card" href="#cat-${escapeHTML(cat.id)}">
      <span class="cat-card-label">${escapeHTML(cat.label)}</span>
      <span class="cat-card-count">${owned}<small> / ${items.length}</small></span>
      ${progressHTML(items, false)}
    </a>`;
}

function renderSummary(data) {
  const el = document.getElementById("summary");
  const all = data.items;
  const c = countByOwnership(all);
  const rate = all.length ? Math.round((c.owned / all.length) * 100) : 0;

  const hero = `
    <div class="hero-card">
      <div class="rate-circle">
        <span class="rate-num">${rate}<small>%</small></span>
        <span class="rate-label">${c.unconfirmed > 0 ? "所持率（暫定）" : "所持率"}</span>
      </div>
      <div class="hero-body">
        <p class="hero-label">所持 / 収集対象</p>
        <p class="hero-count">${c.owned}<small> / ${all.length}点</small></p>
      </div>
      <div class="hero-progress">${progressHTML(all)}</div>
    </div>`;

  const cats = data.categories
    .map((cat) => categoryCardHTML(cat, all.filter((i) => i.category === cat.id)))
    .join("");

  const notice = c.unconfirmed > 0
    ? `<p class="notice">所持状況が未確認の対象が ${c.unconfirmed}点あります。収集進捗（所持率）は、全点の所持状況を確認した後に正しい値になります。</p>`
    : `<p class="notice">所持率：${rate}%（${c.owned} / ${all.length}点）</p>`;

  const alertItems = all.filter((i) => (i.alerts || []).length > 0);
  const alertNotice = alertItems.length
    ? `<p class="notice notice-warn">確認が必要な対象があります：${alertItems
        .map((i) => `<a href="${itemURL(i.id)}">${escapeHTML(i.id)}</a>`)
        .join("、")}</p>`
    : "";

  el.innerHTML = `${hero}<div class="cat-grid">${cats}</div>${notice}${alertNotice}`;
}

// ページ上部のカテゴリーメニュー（各カテゴリーの見出しへ移動するリンク）
function renderCategoryNav(data) {
  const el = document.getElementById("cat-nav");
  if (!el) return;
  el.innerHTML = `<li><a href="#summary-title">概要</a></li>${data.categories
    .map((cat) => `<li><a href="#cat-${escapeHTML(cat.id)}">${escapeHTML(cat.label)}</a></li>`)
    .join("")}`;
}

function itemCardHTML(item) {
  const release = item.release?.value
    ? `<span>${escapeHTML(formatDate(item.release.value))}${item.release.status !== "confirmed" ? "（要確認）" : ""}</span>`
    : "";
  const alert = (item.alerts || []).length ? `<span class="badge badge-warn">要確認</span>` : "";
  return `
    <li class="item-card">
      <a href="${itemURL(item.id)}">
        ${thumbHTML(item)}
        <div class="item-body">
          <span class="item-id">${escapeHTML(item.id)}</span>
          <h3 class="item-title">${escapeHTML(item.title)}</h3>
          <div class="item-meta">${ownershipBadge(item.ownership?.status)}${alert}${release}</div>
        </div>
      </a>
    </li>`;
}

function renderCategories(data) {
  const el = document.getElementById("categories");
  el.innerHTML = data.categories
    .map((cat) => {
      const items = data.items.filter((i) => i.category === cat.id);
      return `
        <section id="cat-${escapeHTML(cat.id)}" aria-labelledby="cat-${escapeHTML(cat.id)}-title">
          <h2 class="section-title" id="cat-${escapeHTML(cat.id)}-title">${escapeHTML(cat.label)}（${items.length}点）</h2>
          <p class="section-desc">${escapeHTML(cat.description || "")}</p>
          <ul class="item-grid">${items.map(itemCardHTML).join("")}</ul>
        </section>`;
    })
    .join("");
}

(async () => {
  try {
    const data = await loadCollection();
    renderCategoryNav(data);
    renderSummary(data);
    renderCategories(data);
    const updated = document.getElementById("data-updated");
    if (updated && data.meta?.updatedAt) updated.textContent = formatDate(data.meta.updatedAt);
  } catch (err) {
    showLoadError(document.getElementById("summary"), err);
  }
})();
