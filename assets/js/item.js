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
  } else if (item.category === "capsule") {
    // フィギュア（ドラゴンボールカプセル）：商品内容を表示し、価格はメーカー希望小売価格として出す
    rows.push(row("商品内容", factHTML(item.contents)));
    rows.push(row("JANコード・型番", factHTML(item.modelNumber)));
    rows.push(row("メーカー希望小売価格", factHTML(item.listPrice, formatYen)));
    return `<table class="info-table">${rows.join("")}</table>`;
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

// 版の違い・見分け方（復刻版・前期／後期・非売品・海外版など）
const EDITION_KIND_LABELS = {
  regular: "通常版",
  reprint: "再販・復刻",
  revision: "修正版",
  promo: "非売品",
  overseas: "海外版",
  fake: "偽物に注意",
  other: "その他",
};
function editionsHTML(item) {
  const list = item.editions || [];
  const note = item.editionsNote ? `<p class="empty-box" style="border-style:solid;color:var(--text)">${escapeHTML(item.editionsNote)}</p>` : "";
  if (list.length === 0) return note || `<p class="empty-box">版の違いの情報はまだありません。</p>`;
  const cards = list.map((e) => {
    const status = FACT_STATUS_LABELS[e.status] ? e.status : "reference";
    const kindLabel = EDITION_KIND_LABELS[e.kind] || EDITION_KIND_LABELS.other;
    const rows = [
      e.release ? row("発売・配布", escapeHTML(formatDate(e.release))) : "",
      row("どんな版か", `<span style="white-space:pre-line">${escapeHTML(e.summary || "")}</span>`),
      (e.identify || []).length ? row("見分け方", `<ul class="check-list">${e.identify.map((t) => `<li>${escapeHTML(t)}</li>`).join("")}</ul>`) : "",
      e.price ? row("価格の目安", escapeHTML(e.price)) : "",
      e.note ? row("補足", escapeHTML(e.note)) : "",
      (e.sources || []).length ? row("出典", sourcesHTML(e.sources)) : "",
    ].join("");
    return `
      <h3 class="sub-title">${escapeHTML(e.name)}
        ${String(e.name).startsWith(kindLabel) ? "" : `<span class="tag">${escapeHTML(kindLabel)}</span>`}
        <span class="tag tag-${status}">${FACT_STATUS_LABELS[status]}</span></h3>
      <table class="info-table"><tbody>${rows}</tbody></table>`;
  }).join("");
  return `<p class="notice">欲しい版と違う物を買わないための情報です。資料（ブログ・記事など）をもとにまとめた参考情報で、現物での確認はまだです。</p>${cards}${note}`;
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
// フィギュア（ドラゴンボールカプセル）の公式商品ページ。画像は転載禁止のため、リンクで案内する
function officialPageURL(item) {
  return item.category === "capsule" ? item.contents?.sources?.[0]?.url || "" : "";
}

// シリーズに含まれるフィギュアの一覧（1体ずつのページへのリンク）
function figureName(fig) {
  return fig.name?.value || `No.${fig.no}（名称未確認）`;
}

function figuresHTML(item) {
  const figs = item.figures || [];
  if (figs.length === 0) return "";
  const cards = figs.map((fig) => `
    <li class="item-card">
      <a href="${itemURL(fig.id)}">
        ${thumbHTML({ images: fig.images, title: figureName(fig) })}
        <div class="item-body">
          <span class="item-id">${escapeHTML(fig.id)}</span>
          <h3 class="item-title">${escapeHTML(figureName(fig))}</h3>
          <div class="item-meta">${ownershipBadge(fig.ownership?.status)}${fig.name?.status === "unconfirmed" ? "" : `<span class="tag tag-${escapeHTML(fig.name.status)}">${FACT_STATUS_LABELS[fig.name.status]}</span>`}</div>
        </div>
      </a>
    </li>`).join("");
  return section(`このシリーズのフィギュア（${figs.length}体）`, `<ul class="item-grid">${cards}</ul>`);
}

function galleryHTML(item) {
  const list = (item.images || []).filter((img) => img.path);
  if (list.length === 0) {
    const official = officialPageURL(item);
    return `<p class="empty-box">画像はまだ登録されていません。${official
      ? `<br>メーカーの商品画像は<a href="${escapeHTML(official)}" target="_blank" rel="noopener noreferrer">公式ページ</a>で見られます（メーカーが画像の転載を禁止しているため、このサイトには載せていません）。`
      : ""}</p>`;
  }
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

// メルカリの欄。メルカリは自動取得できない（公開ページに価格が含まれない）ため、
// 売り切れ一覧へのリンクと、marketPrices のうち出典がメルカリの手入力記録を必ず表示する。
function isMercariRecord(m) {
  return /mercari/i.test(m.source?.url || "");
}

function mercariSearchURL(item) {
  // mercariQuery：メルカリ用の検索語（カプセルのシリーズは「… セット」で全種セットを探す）
  const q = item.market?.mercariQuery || item.market?.query || item.title;
  return `https://jp.mercari.com/search?${new URLSearchParams({ keyword: q, status: "sold_out" })}`;
}

function mercariBlockHTML(item) {
  const recs = (item.marketPrices || [])
    .filter(isMercariRecord)
    .sort((a, b) => String(b.surveyedAt).localeCompare(String(a.surveyedAt)));
  const rows = recs.map((m) => {
    const range = m.priceMin != null && m.priceMax != null && m.priceMin !== m.priceMax
      ? `${formatYen(m.priceMin)} 〜 ${formatYen(m.priceMax)}`
      : formatYen(m.priceMin ?? m.priceMax);
    return `<tr><td>${escapeHTML(formatDate(m.surveyedAt))}</td><td>${range ? escapeHTML(range) : "—"}</td>
      <td>${escapeHTML(m.condition || "—")}</td><td>${escapeHTML(m.basis || "—")}</td></tr>`;
  }).join("");
  return `
    <h3 class="sub-title">メルカリ（売り切れ・手入力の記録） <a class="sub-link" href="${escapeHTML(mercariSearchURL(item))}" target="_blank" rel="noopener noreferrer">売り切れ一覧を開く</a></h3>
    ${rows
      ? `<div class="table-scroll"><table class="info-table history-table">
          <thead><tr><th>調査日</th><th>価格</th><th>状態</th><th>根拠</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
      : `<p class="empty-box">メルカリの記録はまだありません。メルカリは自動で取得できないため、売り切れ価格を確認して手で記録します。「売り切れ一覧を開く」から今の売り切れ価格を確認できます。</p>`}`;
}

// 自動取得した相場（data/market-history.json）を表示する
const SOURCE_ORDER = ["yahoo", "surugaya", "bookoff", "rakuten", "mercari"];
async function renderAutoMarket(item) {
  const el = document.getElementById("auto-market");
  let hist;
  try {
    const res = await fetch("data/market-history.json", { cache: "no-cache" });
    if (!res.ok) throw new Error();
    hist = await res.json();
  } catch {
    el.innerHTML = `${mercariBlockHTML(item)}<p class="empty-box">まだ自動取得の記録はありません（1日1回、朝6時ごろに更新）。</p>`;
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
  const setNote = isCapsuleSeries(item)
    ? `<p class="notice">このシリーズの相場は、<strong>全${item.figures.length}種そろったセット</strong>（「全${item.figures.length}種」「コンプ」「${item.figures.length}個セット」など）の出品だけを集計しています。1体ずつの相場は、上の「このシリーズのフィギュア」から各フィギュアのページで見られます。</p>`
    : "";
  const blocks = SOURCE_ORDER.map((key) => {
    const recs = mine.filter((r) => r.source === key).sort((a, b) => b.date.localeCompare(a.date));
    if (recs.length === 0) return "";
    const label = run?.sources[key]?.label || key;
    const cells = (s) => `<td>${s.count}件</td>
      <td>${s.count ? escapeHTML(formatYen(s.min)) : "—"}</td><td>${s.count ? escapeHTML(formatYen(s.median)) : "—"}</td><td>${s.count ? escapeHTML(formatYen(s.max)) : "—"}</td>`;
    // 状態の区分（未開封・箱付き・箱なし など）ごとの集計がある場合は、日付ごとに「全体」と各区分の行を出す
    const graded = recs.some((r) => r.grades?.length);
    const rows = graded
      ? recs.slice(0, 7).map((r) => {
          const subs = r.grades || [];
          const span = subs.length + 1;
          return `<tr><td rowspan="${span}">${escapeHTML(formatDate(r.date))}</td><td><strong>全体</strong></td>${cells(r)}</tr>` +
            subs.map((g) => `<tr><td>${escapeHTML(g.label)}</td>${cells(g)}</tr>`).join("");
        }).join("")
      : recs.slice(0, 14).map((r) => `<tr><td>${escapeHTML(formatDate(r.date))}</td>${cells(r)}</tr>`).join("");
    return `
      <h3 class="sub-title">${escapeHTML(label)} <a class="sub-link" href="${escapeHTML(recs[0].searchUrl)}" target="_blank" rel="noopener noreferrer">検索結果を開く</a></h3>
      ${graded ? `<p class="notice">状態（未開封・箱付きなど）は、出品名に書かれた語から機械的に分けた目安です。どの区分にも当てはまらない出品は「全体」にだけ含めています。</p>` : ""}
      <div class="table-scroll"><table class="info-table history-table">
        <thead><tr><th>取得日</th>${graded ? "<th>状態</th>" : ""}<th>件数</th><th>最安</th><th>中央値</th><th>最高</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }).join("");
  el.innerHTML = `
    ${setNote}
    ${mercariBlockHTML(item)}
    ${blocks || `<p class="empty-box">この商品の自動取得の記録はまだありません。</p>`}
    ${run ? `<div class="notice"><strong>最終取得：${escapeHTML(formatDate(run.date))}</strong><ul class="status-list">${statusLines}</ul>
      件数・価格は、検索結果から条件に合う出品を機械的に集計した目安です（まとめ売り・本体のみ等は除外）。状態や付属品の違いは、ヤフオクで区分を表示している商品以外は区別していません。</div>` : ""}`;
}

// カプセルのシリーズ（フィギュアの一覧を持つ商品）。相場は全種セットのものを表示する
function isCapsuleSeries(item) {
  return item.category === "capsule" && (item.figures || []).length > 0;
}

// 詳細ページの写真の角に付ける所持状況のハンコ風表示（文字は OWNERSHIP_LABELS と同じ）
function ownershipStamp(status) {
  const key = OWNERSHIP_LABELS[status] ? status : "unconfirmed";
  return `<span class="stamp stamp-${key}" aria-hidden="true">${OWNERSHIP_LABELS[key]}</span>`;
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
      <div class="detail-photo">${thumbHTML(item)}${ownershipStamp(item.ownership?.status)}</div>
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
    ${figuresHTML(item)}
    ${section("基本情報", basicInfoHTML(item, category))}
    ${item.editions || item.editionsNote ? section("版の違い・見分け方", editionsHTML(item)) : ""}
    ${section(`画像（${(item.images || []).length}枚）`, galleryHTML(item))}
    ${section("所持状況・商品の状態", ownershipHTML(item))}
    ${section("購入記録", purchasesHTML(item))}
    ${section(isCapsuleSeries(item) ? "中古相場（全種セットの調査記録）" : "中古相場（調査記録）", marketPricesHTML(item))}
    <section><h2 class="section-title">${isCapsuleSeries(item) ? "相場の推移（全種セット・自動取得＋メルカリ）" : "相場の推移（自動取得＋メルカリ）"}</h2><div id="auto-market"><p class="empty-box">読み込み中…</p></div></section>
    ${section("メモ", item.notes ? `<p class="empty-box" style="border-style:solid;color:var(--text);white-space:pre-line">${escapeHTML(item.notes)}</p>` : `<p class="empty-box">メモはありません。</p>`)}
    ${section("参考URL・出典", referencesHTML(item))}
    ${section("変更履歴", historyHTML(item))}
  `;
}

// フィギュア1体のページ（item.html?id=DBC-001-01）
function renderFigure(data, series, fig) {
  const category = data.categories.find((c) => c.id === series.category);
  const name = figureName(fig);
  document.title = `${fig.id} ${name} | ${data.meta?.title || "DRAGON BALL COLLECTION"}`;
  const o = fig.ownership || {};
  document.getElementById("detail").innerHTML = `
    <nav class="breadcrumb" aria-label="パンくずリスト">
      <a href="index.html">トップ</a> ›
      <a href="index.html#cat-${escapeHTML(series.category)}">${escapeHTML(category?.label || series.category)}</a> ›
      <a href="${itemURL(series.id)}">${escapeHTML(series.id)}</a> ›
      ${escapeHTML(fig.id)}
    </nav>
    <div class="detail-head">
      <div class="detail-photo">${thumbHTML({ images: fig.images, title: name })}${ownershipStamp(o.status)}</div>
      <div>
        <span class="item-id">${escapeHTML(fig.id)}</span>
        <h1 class="detail-title">${escapeHTML(name)}</h1>
        <div class="detail-badges">
          ${ownershipBadge(o.status)}
          <span class="tag">${escapeHTML(category?.label || series.category)}</span>
        </div>
        <p class="series-link">シリーズ：<a href="${itemURL(series.id)}">${escapeHTML(series.title)}</a></p>
      </div>
    </div>
    ${section("フィギュアの情報", `<table class="info-table">
      ${row("管理ID", `<span class="item-id">${escapeHTML(fig.id)}</span>`)}
      ${row("名称", factHTML(fig.name))}
      ${row("シリーズ内の番号", `${fig.no} / ${(series.figures || []).length}`)}
      ${row("シリーズ", `<a href="${itemURL(series.id)}">${escapeHTML(series.id)} ${escapeHTML(series.title)}</a>`)}
      ${row("発売日・発売年", factHTML(series.release, formatDate))}
      ${row("メーカー希望小売価格", factHTML(series.listPrice, formatYen))}
      ${fig.notes ? row("メモ", escapeHTML(fig.notes)) : ""}
    </table>`)}
    ${section(`画像（${(fig.images || []).length}枚）`, galleryHTML({ ...series, images: fig.images, title: name }))}
    ${section("所持状況", `<table class="info-table">
      ${row("所持状況", `${ownershipBadge(o.status)}${o.checkedAt ? `<span class="sub-note">確認日：${escapeHTML(formatDate(o.checkedAt))}</span>` : ""}${o.note ? `<span class="sub-note">${escapeHTML(o.note)}</span>` : ""}`)}
    </table>`)}
    ${section("中古相場（調査記録）", marketPricesHTML(fig))}
    <section><h2 class="section-title">相場の推移（自動取得＋メルカリ）</h2>
      <p class="notice">このフィギュア1体だけの出品を集計しています（セット・まとめ売りは除外）。全種セットの相場は<a href="${itemURL(series.id)}">シリーズのページ</a>で見られます。</p>
      <div id="auto-market"><p class="empty-box">読み込み中…</p></div></section>
    ${section("ほかのフィギュア", `<ul class="figure-nav">${(series.figures || [])
      .map((f) => `<li>${f.id === fig.id ? `<strong>${escapeHTML(figureName(f))}</strong>` : `<a href="${itemURL(f.id)}">${escapeHTML(figureName(f))}</a>`}</li>`)
      .join("")}</ul>`)}
  `;
}

function findFigure(data, id) {
  for (const series of data.items) {
    const fig = (series.figures || []).find((f) => f.id === id);
    if (fig) return { series, fig };
  }
  return null;
}

(async () => {
  const el = document.getElementById("detail");
  try {
    const data = await loadCollection();
    const id = new URLSearchParams(location.search).get("id");
    const item = data.items.find((i) => i.id === id);
    const figure = item ? null : findFigure(data, id);
    if (figure) {
      renderFigure(data, figure.series, figure.fig);
      renderAutoMarket({ ...figure.fig, title: figureName(figure.fig) });
      return;
    }
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
