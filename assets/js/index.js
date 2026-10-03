// トップページ：コレクション概要とカテゴリー別一覧を表示する

function countByOwnership(items) {
  const counts = { owned: 0, not_owned: 0, ordered: 0, unconfirmed: 0 };
  for (const item of items) {
    const status = item.ownership?.status;
    counts[status in counts ? status : "unconfirmed"]++;
  }
  return counts;
}

function progressHTML(items) {
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
    <ul class="breakdown">
      <li class="b-owned">所持 ${c.owned}点</li>
      <li class="b-notowned">未所持 ${notOwned}点</li>
      <li class="b-unconfirmed">未確認 ${c.unconfirmed}点</li>
    </ul>`;
}

function summaryCardHTML(label, items) {
  return `
    <div class="summary-card">
      <h3>${escapeHTML(label)}</h3>
      <p class="summary-count">${items.length}<small>点</small></p>
      ${progressHTML(items)}
    </div>`;
}

function renderSummary(data) {
  const el = document.getElementById("summary");
  const all = data.items;
  const cards = [summaryCardHTML("収集対象の総数", all)];
  for (const cat of data.categories) {
    cards.push(summaryCardHTML(cat.label, all.filter((i) => i.category === cat.id)));
  }

  const c = countByOwnership(all);
  const notice = c.unconfirmed > 0
    ? `<p class="notice">所持状況が未確認の対象が ${c.unconfirmed}点あります。収集進捗（所持率）は、全点の所持状況を確認した後に正しい値になります。</p>`
    : `<p class="notice">所持率：${all.length ? Math.round((c.owned / all.length) * 100) : 0}%（${c.owned} / ${all.length}点）</p>`;

  const alertItems = all.filter((i) => (i.alerts || []).length > 0);
  const alertNotice = alertItems.length
    ? `<p class="notice notice-warn">確認が必要な対象があります：${alertItems
        .map((i) => `<a href="${itemURL(i.id)}">${escapeHTML(i.id)}</a>`)
        .join("、")}</p>`
    : "";

  el.innerHTML = `<div class="summary-grid">${cards.join("")}</div>${notice}${alertNotice}`;
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
    renderSummary(data);
    renderCategories(data);
    const updated = document.getElementById("data-updated");
    if (updated && data.meta?.updatedAt) updated.textContent = formatDate(data.meta.updatedAt);
  } catch (err) {
    showLoadError(document.getElementById("summary"), err);
  }
})();
