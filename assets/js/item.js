// 詳細ページ：item.html?id=FC-001 のように管理IDで1件を表示する

const CONDITION_LABELS = {
  box: "箱",
  manual: "説明書",
  obi: "帯",
  extras: "付属品・付属カード",
  overall: "全体の状態",
};

function sourcesHTML(sources) {
  if (!sources || sources.length === 0) return "";
  return `<ul class="source-list">${sources
    .map((s) => `<li><a href="${escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.title || s.url)}</a></li>`)
    .join("")}</ul>`;
}

// 情報項目（value / status / sources / note）を1セル分の HTML にする。
// 値が空、または status が unconfirmed の値は「未確認」と表示する。
function factHTML(fact, format = (v) => v) {
  if (!fact || fact.value === null || fact.value === undefined || fact.value === "" || fact.status === "unconfirmed") {
    const note = fact?.note ? `<span class="sub-note">${escapeHTML(fact.note)}</span>` : "";
    return `${unconfirmedText()}${note}${sourcesHTML(fact?.sources)}`;
  }
  const status = FACT_STATUS_LABELS[fact.status] ? fact.status : "reference";
  return `
    <span class="value-line">${escapeHTML(format(fact.value))}
      <span class="tag tag-${status}">${FACT_STATUS_LABELS[status]}</span>
    </span>
    ${fact.note ? `<span class="sub-note">${escapeHTML(fact.note)}</span>` : ""}
    ${sourcesHTML(fact.sources)}`;
}

function row(label, html) {
  return `<tr><th scope="row">${escapeHTML(label)}</th><td>${html}</td></tr>`;
}

function basicInfoHTML(item, category) {
  const rows = [
    row("管理ID", `<span class="item-id">${escapeHTML(item.id)}</span>`),
    row("正式名称", escapeHTML(item.title)),
    row("カテゴリー", escapeHTML(category?.label || item.category)),
    row("発売日・発売年", factHTML(item.release, formatDate)),
    row(item.category === "book" ? "出版社" : "メーカー", factHTML(item.publisher)),
  ];
  if (item.category === "book") {
    rows.push(row("ISBN", factHTML(item.isbn)));
  } else {
    rows.push(row("対応機種", factHTML(item.platform)));
    rows.push(row("ジャンル", factHTML(item.genre)));
    rows.push(row("型番", factHTML(item.modelNumber)));
  }
  rows.push(row("発売時の価格", factHTML(item.listPrice, formatYen)));
  return `<table class="info-table">${rows.join("")}</table>`;
}

function ownershipHTML(item) {
  const o = item.ownership || {};
  const cond = item.condition || {};
  const condRows = Object.entries(CONDITION_LABELS).map(([key, label]) =>
    row(label, cond[key] ? escapeHTML(cond[key]) : unconfirmedText())
  );
  return `
    <table class="info-table">
      ${row("所持状況", `${ownershipBadge(o.status)}${o.checkedAt ? `<span class="sub-note">確認日：${escapeHTML(formatDate(o.checkedAt))}</span>` : ""}${o.note ? `<span class="sub-note">${escapeHTML(o.note)}</span>` : ""}`)}
      ${condRows.join("")}
      ${cond.note ? row("状態メモ", escapeHTML(cond.note)) : ""}
    </table>`;
}

function purchasesHTML(item) {
  const list = item.purchases || [];
  if (list.length === 0) return `<p class="empty-box">購入記録はまだありません。</p>`;
  return list
    .map((p) => `
      <table class="info-table" style="margin-bottom:10px">
        ${row("購入日", p.date ? escapeHTML(formatDate(p.date)) : unconfirmedText())}
        ${row("購入価格", p.price != null ? escapeHTML(formatYen(p.price)) : unconfirmedText())}
        ${row("送料", p.shipping != null ? escapeHTML(formatYen(p.shipping)) : unconfirmedText())}
        ${row("購入先", p.shop ? escapeHTML(p.shop) : unconfirmedText())}
        ${p.note ? row("メモ", escapeHTML(p.note)) : ""}
      </table>`)
    .join("");
}

function marketPricesHTML(item) {
  const list = item.marketPrices || [];
  if (list.length === 0) return `<p class="empty-box">相場調査の記録はまだありません。</p>`;
  const sorted = [...list].sort((a, b) => String(b.surveyedAt).localeCompare(String(a.surveyedAt)));
  const latest = sorted[0].surveyedAt;
  return sorted
    .map((m) => {
      const range = m.priceMin != null && m.priceMax != null && m.priceMin !== m.priceMax
        ? `${formatYen(m.priceMin)} 〜 ${formatYen(m.priceMax)}`
        : formatYen(m.priceMin ?? m.priceMax);
      return `
        <table class="info-table" style="margin-bottom:10px">
          ${row("調査日", `${escapeHTML(formatDate(m.surveyedAt))}${m.surveyedAt === latest ? ' <span class="tag">最新</span>' : ' <span class="tag">過去の記録</span>'}`)}
          ${row("価格", range ? escapeHTML(range) : unconfirmedText())}
          ${row("対象の状態", m.condition ? escapeHTML(m.condition) : unconfirmedText())}
          ${row("根拠・出典", `${escapeHTML(m.basis || "")}${m.source ? sourcesHTML([m.source]) : ""}`)}
          ${m.note ? row("メモ", escapeHTML(m.note)) : ""}
        </table>`;
    })
    .join("");
}

function referencesHTML(item) {
  const list = item.references || [];
  if (list.length === 0) return `<p class="empty-box">項目ごとの出典は「基本情報」の各欄に表示しています。その他の参考URLはまだありません。</p>`;
  return `<div class="empty-box" style="border-style:solid">${sourcesHTML(list)}</div>`;
}

function historyHTML(item) {
  const list = item.history || [];
  if (list.length === 0) return `<p class="empty-box">変更履歴はありません。</p>`;
  return `<table class="info-table">${list.map((h) => row(formatDate(h.date), escapeHTML(h.change))).join("")}</table>`;
}

// 登録された画像を一覧で表示する（押すと原寸の画像が別タブで開く）
function galleryHTML(item) {
  const list = (item.images || []).filter((img) => img.path);
  if (list.length === 0) return `<p class="empty-box">画像はまだ登録されていません。</p>`;
  return `<ul class="gallery">${list
    .map((img) => `
      <li>
        <a href="${escapeHTML(img.path)}" target="_blank" rel="noopener">
          <img src="${escapeHTML(img.path)}" alt="${escapeHTML(img.caption || item.title)}" loading="lazy">${referenceLabel(img)}
        </a>
        ${img.caption ? `<span class="gallery-caption">${escapeHTML(img.caption)}</span>` : ""}
      </li>`)
    .join("")}</ul>`;
}

function section(title, body) {
  return `<section><h2 class="section-title">${escapeHTML(title)}</h2>${body}</section>`;
}

// 自動取得した相場（data/market-history.json）を表示する
const SOURCE_ORDER = ["yahoo", "surugaya", "rakuten", "mercari"];
async function renderAutoMarket(item) {
  const el = document.getElementById("auto-market");
  let hist;
  try {
    const res = await fetch("data/market-history.json", { cache: "no-cache" });
    if (!res.ok) throw new Error();
    hist = await res.json();
  } catch {
    el.innerHTML = `<p class="empty-box">まだ自動取得の記録はありません（1日1回、朝6時ごろに更新）。</p>`;
    return;
  }
  const run = hist.meta?.lastRun;
  const statusLines = run
    ? SOURCE_ORDER.filter((k) => run.sources[k]).map((k) => {
        const s = run.sources[k];
        const state = s.ok + s.empty > 0 ? `取得 ${s.ok + s.empty}件` : "取得なし";
        const why = s.ok + s.empty === 0 && s.messages.length ? `（${s.messages[0]}）` : "";
        return `<li>${escapeHTML(s.label)}：${escapeHTML(state + why)}</li>`;
      }).join("")
    : "";
  const mine = (hist.records || []).filter((r) => r.id === item.id);
  const blocks = SOURCE_ORDER.map((key) => {
    const recs = mine.filter((r) => r.source === key).sort((a, b) => b.date.localeCompare(a.date));
    if (recs.length === 0) return "";
    const label = run?.sources[key]?.label || key;
    const rows = recs.slice(0, 14).map((r) => `
      <tr><td>${escapeHTML(formatDate(r.date))}</td><td>${r.count}件</td>
      <td>${r.count ? escapeHTML(formatYen(r.min)) : "—"}</td><td>${r.count ? escapeHTML(formatYen(r.median)) : "—"}</td><td>${r.count ? escapeHTML(formatYen(r.max)) : "—"}</td></tr>`).join("");
    return `
      <h3 class="sub-title">${escapeHTML(label)} <a class="sub-link" href="${escapeHTML(recs[0].searchUrl)}" target="_blank" rel="noopener noreferrer">検索結果を開く</a></h3>
      <div class="table-scroll"><table class="info-table history-table">
        <thead><tr><th>取得日</th><th>件数</th><th>最安</th><th>中央値</th><th>最高</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }).join("");
  el.innerHTML = `
    ${blocks || `<p class="empty-box">この商品の自動取得の記録はまだありません。</p>`}
    ${run ? `<div class="notice"><strong>最終取得：${escapeHTML(formatDate(run.date))}</strong><ul class="status-list">${statusLines}</ul>
      件数・価格は、検索結果から条件に合う出品を機械的に集計した目安です（まとめ売り・本体のみ等は除外）。状態や付属品の違いは区別していません。</div>` : ""}`;
}

function renderItem(data, item) {
  const category = data.categories.find((c) => c.id === item.category);
  document.title = `${item.id} ${item.title} | ${data.meta?.title || "DRAGON BALL COLLECTION"}`;

  const alerts = (item.alerts || [])
    .map((a) => `<p class="notice notice-warn"><strong>要確認：</strong>${escapeHTML(a)}</p>`)
    .join("");

  document.getElementById("detail").innerHTML = `
    <nav class="breadcrumb" aria-label="パンくずリスト">
      <a href="index.html">トップ</a> ›
      <a href="index.html#cat-${escapeHTML(item.category)}">${escapeHTML(category?.label || item.category)}</a> ›
      ${escapeHTML(item.id)}
    </nav>
    <div class="detail-head">
      ${thumbHTML(item)}
      <div>
        <span class="item-id">${escapeHTML(item.id)}</span>
        <h1 class="detail-title">${escapeHTML(item.title)}</h1>
        <div class="detail-badges">
          ${ownershipBadge(item.ownership?.status)}
          <span class="tag">${escapeHTML(category?.label || item.category)}</span>
        </div>
        ${alerts}
      </div>
    </div>
    <div class="legend">
      <span><span class="tag tag-confirmed">確認済み</span> 現物・公式情報で確認</span>
      <span><span class="tag tag-reference">参考情報・要確認</span> 二次資料による情報</span>
      <span>${unconfirmedText()} まだ調べていない／確認できない</span>
    </div>
    ${section("基本情報", basicInfoHTML(item, category))}
    ${section(`画像（${(item.images || []).length}枚）`, galleryHTML(item))}
    ${section("所持状況・商品の状態", ownershipHTML(item))}
    ${section("購入記録", purchasesHTML(item))}
    ${section("中古相場（調査記録）", marketPricesHTML(item))}
    <section><h2 class="section-title">相場の推移（自動取得）</h2><div id="auto-market"><p class="empty-box">読み込み中…</p></div></section>
    ${section("メモ", item.notes ? `<p class="empty-box" style="border-style:solid;color:var(--text);white-space:pre-line">${escapeHTML(item.notes)}</p>` : `<p class="empty-box">メモはありません。</p>`)}
    ${section("参考URL・出典", referencesHTML(item))}
    ${section("変更履歴", historyHTML(item))}
  `;
}

(async () => {
  const el = document.getElementById("detail");
  try {
    const data = await loadCollection();
    const id = new URLSearchParams(location.search).get("id");
    const item = data.items.find((i) => i.id === id);
    if (!item) {
      el.innerHTML = `
        <div class="notice notice-warn">管理ID「${escapeHTML(id || "（指定なし）")}」の商品は見つかりませんでした。</div>
        <p><a href="index.html">トップページへ戻る</a></p>`;
      return;
    }
    renderItem(data, item);
    renderAutoMarket(item);
  } catch (err) {
    showLoadError(el, err);
  }
})();
