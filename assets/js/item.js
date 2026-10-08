// 詳細ページ：item.html?id=FC-001 のように管理IDで1件を表示する

const CONDITION_LABELS = {
  box: t("箱", "Box"),
  manual: t("説明書", "Manual"),
  obi: t("帯", "Obi (band)"),
  extras: t("付属品・付属カード", "Accessories / cards"),
  overall: t("全体の状態", "Overall condition"),
};

function sourcesHTML(sources) {
  if (!sources || sources.length === 0) return "";
  return `<ul class="source-list">${sources
    .map((s) => `<li><a href="${escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(tx(s.title) || s.url)}</a></li>`)
    .join("")}</ul>`;
}

// 情報項目（value / status / sources / note）を1セル分の HTML にする。
// 値が空、または status が unconfirmed の値は「未確認」と表示する。
function factHTML(fact, format = (v) => v) {
  if (!fact || fact.value === null || fact.value === undefined || fact.value === "" || fact.status === "unconfirmed") {
    const note = fact?.note ? `<span class="sub-note">${escapeHTML(tx(fact.note))}</span>` : "";
    return `${unconfirmedText()}${note}${sourcesHTML(fact?.sources)}`;
  }
  const status = FACT_STATUS_LABELS[fact.status] ? fact.status : "reference";
  return `
    <span class="value-line">${escapeHTML(format(tx(fact.value)))}
      ${statusTag(status)}
    </span>
    ${fact.note ? `<span class="sub-note">${escapeHTML(tx(fact.note))}</span>` : ""}
    ${sourcesHTML(fact.sources)}`;
}

// 確認状況の札（確認済み・参考情報）はオーナー指示（2026-10-05）で表示しない（データの status は残す）
function statusTag(status) {
  return "";
}

function row(label, html) {
  return `<tr><th scope="row">${escapeHTML(label)}</th><td>${html}</td></tr>`;
}

function basicInfoHTML(item, category) {
  const rows = [
    row(t("管理ID", "ID"), `<span class="item-id">${escapeHTML(item.id)}</span>`),
    row(t("正式名称", "Full title"), escapeHTML(tx(item.title))),
    row(t("カテゴリー", "Category"), escapeHTML(tx(category?.label) || item.category)),
    row(t("発売日・発売年", "Release date"), factHTML(item.release, formatDate)),
    row(item.category === "book" ? t("出版社", "Publisher") : t("メーカー", "Maker"), factHTML(item.publisher)),
  ];
  if (item.category === "book") {
    rows.push(row("ISBN", factHTML(item.isbn)));
  } else if (item.category === "capsule") {
    // フィギュア（ドラゴンボールカプセル）：商品内容を表示し、価格はメーカー希望小売価格として出す
    rows.push(row(t("商品内容", "Contents"), factHTML(item.contents)));
    rows.push(row(t("JANコード・型番", "JAN code / model no."), factHTML(item.modelNumber)));
    rows.push(row(t("メーカー希望小売価格", "Suggested retail price"), factHTML(item.listPrice, formatYen)));
    return `<table class="info-table">${rows.join("")}</table>`;
  } else {
    rows.push(row(t("対応機種", "Platform"), factHTML(item.platform)));
    rows.push(row(t("ジャンル", "Genre"), factHTML(item.genre)));
    rows.push(row(t("型番", "Model no."), factHTML(item.modelNumber)));
  }
  rows.push(row(t("発売時の価格", "Original price"), factHTML(item.listPrice, formatYen)));
  return `<table class="info-table">${rows.join("")}</table>`;
}

function ownershipHTML(item) {
  const o = item.ownership || {};
  const cond = item.condition || {};
  const condRows = Object.entries(CONDITION_LABELS).map(([key, label]) =>
    row(label, cond[key] ? escapeHTML(tx(cond[key])) : unconfirmedText())
  );
  return `
    <table class="info-table">
      ${row(t("所持状況", "Ownership"), `${ownershipBadge(o.status)}${o.checkedAt ? `<span class="sub-note">${t("確認日：", "Checked: ")}${escapeHTML(formatDate(o.checkedAt))}</span>` : ""}${o.note ? `<span class="sub-note">${escapeHTML(tx(o.note))}</span>` : ""}`)}
      ${condRows.join("")}
      ${cond.note ? row(t("状態メモ", "Condition notes"), escapeHTML(tx(cond.note))) : ""}
    </table>`;
}

function purchasesHTML(item) {
  const list = item.purchases || [];
  if (list.length === 0) return `<p class="empty-box">${t("購入記録はまだありません。", "No purchase records yet.")}</p>`;
  return list
    .map((p) => `
      <table class="info-table" style="margin-bottom:10px">
        ${row(t("購入日", "Date"), p.date ? escapeHTML(formatDate(p.date)) : unconfirmedText())}
        ${row(t("購入価格", "Price"), p.price != null ? escapeHTML(formatYen(p.price)) : unconfirmedText())}
        ${row(t("送料", "Shipping"), p.shipping != null ? escapeHTML(formatYen(p.shipping)) : unconfirmedText())}
        ${row(t("購入先", "Shop"), p.shop ? escapeHTML(tx(p.shop)) : unconfirmedText())}
        ${p.note ? row(t("メモ", "Notes"), escapeHTML(tx(p.note))) : ""}
      </table>`)
    .join("");
}

// 版の違い・見分け方（復刻版・前期／後期・非売品・海外版など）
const EDITION_KIND_LABELS = {
  regular: t("通常版", "Standard"),
  reprint: t("再販・復刻", "Re-release / reissue"),
  revision: t("修正版", "Revised"),
  promo: t("非売品", "Not for sale"),
  overseas: t("海外版", "Overseas"),
  fake: t("偽物に注意", "Beware of fakes"),
  other: t("その他", "Other"),
};
function editionsHTML(item) {
  const list = item.editions || [];
  const note = item.editionsNote ? `<p class="empty-box" style="border-style:solid;color:var(--text)">${escapeHTML(tx(item.editionsNote))}</p>` : "";
  if (list.length === 0) return note || `<p class="empty-box">${t("版の違いの情報はまだありません。", "No edition information yet.")}</p>`;
  const cards = list.map((e) => {
    const status = FACT_STATUS_LABELS[e.status] ? e.status : "reference";
    const kindLabel = EDITION_KIND_LABELS[e.kind] || EDITION_KIND_LABELS.other;
    const rows = [
      e.release ? row(t("発売・配布", "Released"), escapeHTML(formatDate(e.release))) : "",
      row(t("どんな版か", "About this edition"), `<span style="white-space:pre-line">${escapeHTML(tx(e.summary || ""))}</span>`),
      (e.identify || []).length ? row(t("見分け方", "How to identify"), `<ul class="check-list">${e.identify.map((v) => `<li>${escapeHTML(tx(v))}</li>`).join("")}</ul>`) : "",
      e.price ? row(t("価格の目安", "Price guide"), escapeHTML(tx(e.price))) : "",
      e.note ? row(t("補足", "Notes"), escapeHTML(tx(e.note))) : "",
      (e.sources || []).length ? row(t("出典", "Sources"), sourcesHTML(e.sources)) : "",
    ].join("");
    return `
      <h3 class="sub-title">${escapeHTML(tx(e.name))}
        ${String(tx(e.name)).startsWith(kindLabel) ? "" : `<span class="tag">${escapeHTML(kindLabel)}</span>`}
        ${statusTag(status)}</h3>
      <table class="info-table"><tbody>${rows}</tbody></table>`;
  }).join("");
  return `<p class="notice">${t("欲しい版と違う物を買わないための情報です。資料（ブログ・記事など）をもとにまとめた参考情報で、現物での確認はまだです。", "Notes to avoid buying the wrong edition. Compiled from references (blogs, articles, etc.) and not yet checked against actual items.")}</p>${cards}${note}`;
}

function marketPricesHTML(item) {
  const list = item.marketPrices || [];
  if (list.length === 0) return `<p class="empty-box">${t("相場調査の記録はまだありません。", "No market price surveys yet.")}</p>`;
  const sorted = [...list].sort((a, b) => String(b.surveyedAt).localeCompare(String(a.surveyedAt)));
  const latest = sorted[0].surveyedAt;
  return sorted
    .map((m) => {
      const range = m.priceMin != null && m.priceMax != null && m.priceMin !== m.priceMax
        ? `${formatYen(m.priceMin)}${t(" 〜 ", " – ")}${formatYen(m.priceMax)}`
        : formatYen(m.priceMin ?? m.priceMax);
      return `
        <table class="info-table" style="margin-bottom:10px">
          ${row(t("調査日", "Surveyed"), `${escapeHTML(formatDate(m.surveyedAt))}${m.surveyedAt === latest ? ` <span class="tag">${t("最新", "Latest")}</span>` : ` <span class="tag">${t("過去の記録", "Past record")}</span>`}`)}
          ${row(t("価格", "Price"), range ? escapeHTML(range) : unconfirmedText())}
          ${row(t("対象の状態", "Condition"), m.condition ? escapeHTML(tx(m.condition)) : unconfirmedText())}
          ${row(t("根拠・出典", "Basis / source"), `${escapeHTML(tx(m.basis || ""))}${m.source ? sourcesHTML([m.source]) : ""}`)}
          ${m.note ? row(t("メモ", "Notes"), escapeHTML(tx(m.note))) : ""}
        </table>`;
    })
    .join("");
}

function referencesHTML(item) {
  const list = item.references || [];
  if (list.length === 0) return `<p class="empty-box">${t("項目ごとの出典は「基本情報」の各欄に表示しています。その他の参考URLはまだありません。", "Sources for each field are shown under \"Basic information\". No other reference URLs yet.")}</p>`;
  return `<div class="empty-box" style="border-style:solid">${sourcesHTML(list)}</div>`;
}

function historyHTML(item) {
  const list = item.history || [];
  if (list.length === 0) return `<p class="empty-box">${t("変更履歴はありません。", "No change history.")}</p>`;
  return `<table class="info-table">${list.map((h) => row(formatDate(h.date), escapeHTML(h.change))).join("")}</table>`;
}

// 登録された画像を一覧で表示する（押すと原寸の画像が別タブで開く）
// フィギュア（ドラゴンボールカプセル）の公式商品ページ。画像は転載禁止のため、リンクで案内する
function officialPageURL(item) {
  return item.category === "capsule" ? item.contents?.sources?.[0]?.url || "" : "";
}

// シリーズに含まれるフィギュアの一覧（1体ずつのページへのリンク）
function figureName(fig) {
  const name = tx(fig.name?.value) || t(`No.${fig.no}（名称未確認）`, `No.${fig.no} (name unconfirmed)`);
  // ボーナスパーツは7体の1体と同じ名前のことがある（例：DBC-002 の「孫悟空 VS ピッコロ大魔王」）ため、頭に付けて見分ける
  return fig.bonus ? t(`ボーナスパーツ：${name}`, `Bonus part: ${name}`) : name;
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
          <div class="item-meta">${ownershipBadge(fig.ownership?.status)}${statusTag(fig.name?.status)}</div>
        </div>
      </a>
    </li>`).join("");
  const bonus = figs.length - regularFigures(item).length;
  return section(t(`このシリーズのフィギュア（${regularFigures(item).length}体${bonus ? `＋ボーナスパーツ` : ""}）`, `Figures in this series (${regularFigures(item).length}${bonus ? " + bonus part" : ""})`), `<ul class="item-grid">${cards}</ul>`, "figures");
}

// 写真の説明文から「（参考画像・…）」の部分を除く（オーナー指示 2026-10-05。データの説明文は残す）
// 英語表示では、除いたあとの説明文を英訳に置き換える（対応表のキーは除いたあとの文。tools/i18n.mjs と同じ処理）
function captionText(caption) {
  return tx(String(caption || "")
    .replace(/[・、]参考画像(?=[）)])/g, "")
    .replace(/[（(]参考画像[^）)]*[）)]/g, "")
    .trim());
}

function galleryHTML(item) {
  const list = (item.images || []).filter((img) => img.path);
  if (list.length === 0) {
    const official = officialPageURL(item);
    return `<p class="empty-box">${t("画像はまだ登録されていません。", "No images yet.")}${official
      ? t(`<br>メーカーの商品画像は<a href="${escapeHTML(official)}" target="_blank" rel="noopener noreferrer">公式ページ</a>で見られます（メーカーが画像の転載を禁止しているため、このサイトには載せていません）。`,
        `<br>Product images are available on the <a href="${escapeHTML(official)}" target="_blank" rel="noopener noreferrer">official page</a> (the maker does not allow reposting its images, so they are not shown here).`)
      : ""}</p>`;
  }
  return `<ul class="gallery">${list
    .map((img, i) => `
      <li>
        <a href="${escapeHTML(img.path)}" target="_blank" rel="noopener" data-photo-index="${i}" aria-label="${t("拡大して見る：", "View larger: ")}${escapeHTML(captionText(img.caption) || tx(item.title))}">
          <img src="${escapeHTML(img.path)}" alt="${escapeHTML(captionText(img.caption) || tx(item.title))}" loading="lazy">${referenceLabel(img)}
        </a>
        ${captionText(img.caption) ? `<span class="gallery-caption">${escapeHTML(captionText(img.caption))}</span>` : ""}
      </li>`)
    .join("")}</ul>`;
}

function section(title, body, id = "") {
  return `<section${id ? ` id="${escapeHTML(id)}"` : ""}><h2 class="section-title">${escapeHTML(title)}</h2>${body}</section>`;
}

// ---------- 一番上の写真：左右にスクロールして全部の写真を見る ----------
// 動作確認用：写真が1枚以下のページは、仮の画像を足して3枚にする（オーナー指示 2026-10-05。全部不要になったら false にする）
const DEMO_FILL_SLIDES = true;
const DEMO_SLIDE_COUNT = 3;
// 仮の画像を出さない管理ID。オーナーの指示（購入した商品など）があったら1件ずつ足す（2026-10-05 オーナー指示）
const DEMO_FILL_EXCLUDE = new Set([]);
function photoSliderHTML(images, title, id) {
  const slides = (images || []).filter((img) => img && img.path).map((img, i) => `
    <div class="slide"><div class="thumb"><img src="${escapeHTML(img.path)}" alt="${escapeHTML(captionText(img.caption) || title)}" ${i === 0 ? "" : 'loading="lazy"'}></div></div>`);
  if (slides.length === 0) slides.push(`<div class="slide"><div class="thumb"><span class="thumb-placeholder">${t("画像未登録", "No image yet")}</span></div></div>`);
  if (DEMO_FILL_SLIDES && !DEMO_FILL_EXCLUDE.has(id) && slides.length <= 1) {
    for (let n = slides.length + 1; n <= DEMO_SLIDE_COUNT; n++) {
      slides.push(`<div class="slide"><div class="thumb demo-slide"><span>${t("仮の画像", "Placeholder")} ${n} / ${DEMO_SLIDE_COUNT}<small>${t("動作確認用（あとで削除）", "For testing (to be removed)")}</small></span></div></div>`);
    }
  }
  const n = slides.length;
  return `<div class="photo-slider" data-count="${n}">
    <div class="slider-track" tabindex="0" role="button" aria-label="${n > 1 ? t("写真（左右にスクロールで切り替え、タップで拡大）", "Photos (scroll sideways to switch, tap to enlarge)") : t("写真（タップで拡大）", "Photo (tap to enlarge)")}">${slides.join("")}</div>
    ${n > 1 ? `<button type="button" class="slider-edge prev" aria-label="${t("前の写真", "Previous photo")}"></button>
      <button type="button" class="slider-edge next" aria-label="${t("次の写真", "Next photo")}"></button>
      <span class="slider-count" aria-live="polite">1 / ${n}</span>` : ""}
  </div>`;
}
// 画像の両端をタップすると前後の写真へ（端では反対の端へ戻る）。スクロールに合わせて「何枚目か」を更新
function initPhotoSliders(root = document) {
  root.querySelectorAll(".photo-slider").forEach((box) => {
    const track = box.querySelector(".slider-track");
    const n = Number(box.dataset.count) || 1;
    const counter = box.querySelector(".slider-count");
    if (!track || n < 2) return;
    const current = () => Math.round(track.scrollLeft / track.clientWidth);
    const go = (i) => {
      const left = ((i + n) % n) * track.clientWidth;
      try { track.scrollTo({ left, behavior: "smooth" }); } catch { track.scrollLeft = left; }
    };
    box.querySelector(".slider-edge.prev").addEventListener("click", () => go(current() - 1));
    box.querySelector(".slider-edge.next").addEventListener("click", () => go(current() + 1));
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(current() - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(current() + 1); }
    });
    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { counter.textContent = `${current() + 1} / ${n}`; ticking = false; });
    });
  });
}

// ---------- 拡大表示（ページの上に重ねて表示。拡大中も横スクロール・両端タップで切り替え） ----------
// 一番上の写真の中央をタップ、または下の画像一覧の写真をタップすると開く
function initLightbox(root = document) {
  const top = root.querySelector(".detail-photo .photo-slider");
  if (!top) return;
  const topTrack = top.querySelector(".slider-track");
  const n = Number(top.dataset.count) || 1;
  const box = document.createElement("div");
  box.className = "lightbox";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", t("写真の拡大表示", "Enlarged photo"));
  box.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="${t("閉じる", "Close")}">×</button>
    <p class="lightbox-hint" aria-hidden="true">${t("下にスライドで閉じる／2本指で拡大", "Swipe down to close / pinch to zoom")}</p>
    <p class="lightbox-hint-pc" aria-hidden="true">${t("ホイールで拡大・ドラッグで移動・ダブルクリックで元に戻す", "Wheel to zoom, drag to move, double-click to reset")}</p>
    <div class="photo-slider lightbox-slider" data-count="${n}">
      <div class="slider-track" tabindex="-1">${topTrack.innerHTML}</div>
      ${n > 1 ? `<button type="button" class="slider-edge prev" aria-label="${t("前の写真", "Previous photo")}"></button>
        <button type="button" class="slider-edge next" aria-label="${t("次の写真", "Next photo")}"></button>
        <span class="slider-count" aria-live="polite">1 / ${n}</span>` : ""}
    </div>`;
  document.body.appendChild(box);
  box.querySelectorAll("img").forEach((img) => img.removeAttribute("loading"));
  initPhotoSliders(box);
  const track = box.querySelector(".slider-track");
  const counter = box.querySelector(".slider-count");
  let opener = null;
  const open = (index, from) => {
    opener = from || null;
    resetDrag(false);
    resetZoom();
    box.hidden = false;
    document.documentElement.classList.add("lightbox-open");
    // 開いた瞬間に目的の写真の位置へ（Safari の一部の版は behavior: "instant" を受け付けないため、scrollLeft を直接変える）
    track.scrollLeft = index * track.clientWidth;
    if (counter) counter.textContent = `${index + 1} / ${n}`;
    box.querySelector(".lightbox-close").focus();
  };
  const close = () => {
    resetZoom();
    box.hidden = true;
    document.documentElement.classList.remove("lightbox-open");
    if (opener) opener.focus();
  };
  box.querySelector(".lightbox-close").addEventListener("click", close);

  // ---------- 拡大中の写真のズーム（2026-10-06 オーナー指示） ----------
  // スマホは指2本で広げる・縮める、PCはマウスホイール。拡大中は指1本／ドラッグで写真を動かす。ダブルタップ・ダブルクリックで 2.5 倍と元の大きさを切り替え
  // 拡大中は横スクロール（写真の切り替え）と、下へのスライドで閉じる操作を止める
  const MAX_ZOOM = 5;
  let zoom = 1, tx = 0, ty = 0, zoomEl = null, zoomBox = null;
  const currentSlide = () => track.children[Math.round(track.scrollLeft / track.clientWidth)] || track.children[0];
  const applyZoom = () => {
    if (!zoomEl) return;
    // 写真が枠の外へ離れすぎないように、移動できる範囲を枠の大きさの中に収める
    tx = Math.min(0, Math.max(zoomBox.width * (1 - zoom), tx));
    ty = Math.min(0, Math.max(zoomBox.height * (1 - zoom), ty));
    zoomEl.style.transform = zoom > 1 ? `translate(${tx}px, ${ty}px) scale(${zoom})` : "";
    box.classList.toggle("is-zoomed", zoom > 1);
  };
  function resetZoom() {
    if (zoomEl) zoomEl.style.transform = "";
    zoom = 1; tx = 0; ty = 0; zoomEl = null;
    box.classList.remove("is-zoomed");
  }
  // 画面上の点（clientX, clientY）を中心に、倍率を next に変える
  const zoomAt = (next, clientX, clientY) => {
    const slide = currentSlide();
    if (!slide) return;
    if (!zoomEl) { zoomEl = slide.querySelector(".thumb"); zoomBox = slide.getBoundingClientRect(); }
    if (!zoomEl) return;
    next = Math.min(MAX_ZOOM, Math.max(1, next));
    const fx = clientX - zoomBox.left, fy = clientY - zoomBox.top;
    tx = fx - ((fx - tx) / zoom) * next;
    ty = fy - ((fy - ty) / zoom) * next;
    zoom = next;
    if (zoom <= 1.02) { resetZoom(); return; }
    applyZoom();
  };
  const toggleZoomAt = (x, y) => (zoom > 1 ? resetZoom() : zoomAt(2.5, x, y));
  // 写真を切り替えるときは元の大きさに戻す
  box.querySelectorAll(".slider-edge").forEach((b) => b.addEventListener("click", resetZoom, true));
  // PC：マウスホイールで拡大・縮小（横向きのスクロールは写真の切り替えのまま）
  box.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) return;
    e.preventDefault();
    zoomAt(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  }, { passive: false });
  track.addEventListener("dblclick", (e) => { e.preventDefault(); toggleZoomAt(e.clientX, e.clientY); });
  // iPhone の Safari：指2本の動きでページ全体が拡大されないようにする（写真のズームだけを動かす）
  box.addEventListener("gesturestart", (e) => e.preventDefault());
  // PC：拡大中はマウスでドラッグして写真を動かす
  let mouseDrag = null, suppressClick = false;
  track.addEventListener("mousedown", (e) => {
    if (zoom <= 1 || e.button !== 0) return;
    e.preventDefault();
    mouseDrag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDrag) return;
    const mx = e.clientX - mouseDrag.x, my = e.clientY - mouseDrag.y;
    if (Math.abs(mx) + Math.abs(my) > 3) mouseDrag.moved = true;
    tx = mouseDrag.tx + mx; ty = mouseDrag.ty + my;
    applyZoom();
  });
  window.addEventListener("mouseup", () => {
    if (mouseDrag?.moved) suppressClick = true;
    mouseDrag = null;
  });

  // スマホ：画面を押したまま下へ大きく動かすと閉じる（横の動きは写真の切り替え）。少しだけなら元に戻る
  const panel = box.querySelector(".lightbox-slider");
  let startX = 0, startY = 0, dy = 0, mode = null; // mode: null（未判定）/ "down"（下へ）/ "side"（横へ）/ "pinch"（指2本）/ "pan"（拡大中の移動）
  let pinch = null, pan = null, lastTap = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const startPan = (t) => { mode = "pan"; pan = { x: t.clientX, y: t.clientY, tx, ty, moved: false }; };
  function resetDrag(animate) {
    panel.style.transition = animate ? "transform 0.2s ease" : "";
    box.style.transition = animate ? "background-color 0.2s ease" : "";
    panel.style.transform = "";
    box.style.backgroundColor = "";
  }
  box.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      // 指2本：ズームの開始（下へのスライドの途中なら元に戻す）
      if (mode === "down") resetDrag(false);
      mode = "pinch";
      const m = mid(e.touches);
      pinch = { d: dist(e.touches), zoom, x: m.x, y: m.y };
      return;
    }
    if (e.touches.length !== 1) { mode = "side"; return; }
    if (zoom > 1) { startPan(e.touches[0]); return; }
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; dy = 0; mode = null;
    panel.style.transition = ""; box.style.transition = "";
  }, { passive: true });
  box.addEventListener("touchmove", (e) => {
    if (mode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const m = mid(e.touches);
      // 指の真ん中を中心に倍率を変え、指の真ん中が動いた分だけ写真も動かす
      zoomAt(pinch.zoom * (dist(e.touches) / pinch.d), pinch.x, pinch.y);
      if (zoom > 1) { tx += m.x - pinch.x; ty += m.y - pinch.y; applyZoom(); }
      pinch.x = m.x; pinch.y = m.y; pinch.zoom = zoom; pinch.d = dist(e.touches);
      return;
    }
    if (mode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      const mx = e.touches[0].clientX - pan.x, my = e.touches[0].clientY - pan.y;
      if (Math.abs(mx) + Math.abs(my) > 6) pan.moved = true;
      tx = pan.tx + mx; ty = pan.ty + my;
      applyZoom();
      return;
    }
    if (mode === "side" || mode === "pinch" || mode === "pan" || e.touches.length !== 1) return;
    const mx = e.touches[0].clientX - startX, my = e.touches[0].clientY - startY;
    if (mode === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      mode = my > 0 && Math.abs(my) > Math.abs(mx) ? "down" : "side";
      if (mode !== "down") return;
    }
    e.preventDefault();
    dy = Math.max(0, my);
    panel.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy / 2000, 0.1)})`;
    box.style.backgroundColor = `rgba(12, 12, 12, ${1 - Math.min(dy / 400, 0.75)})`;
  }, { passive: false });
  const endDrag = (e) => {
    const remaining = e?.touches?.length || 0;
    if (mode === "pinch" || mode === "pan") {
      if (mode === "pan" && pan.moved) suppressClick = true;
      // 指2本のうち1本だけ離したときは、残りの指で写真を動かせるようにする
      if (remaining === 1 && zoom > 1) { startPan(e.touches[0]); pan.moved = true; return; }
      if (remaining === 0) {
        const tapped = mode === "pan" && !pan.moved;
        mode = null; pinch = null;
        if (tapped) checkDoubleTap(e); else lastTap = null;
      }
      return;
    }
    if (mode === null && remaining === 0) checkDoubleTap(e);
    if (mode !== "down") { mode = null; return; }
    mode = null;
    if (dy > Math.min(140, window.innerHeight * 0.18)) {
      // 下へ大きく動かした：画面の外へ流して閉じる
      panel.style.transition = "transform 0.2s ease";
      box.style.transition = "background-color 0.2s ease";
      panel.style.transform = `translateY(${window.innerHeight}px)`;
      box.style.backgroundColor = "rgba(12, 12, 12, 0)";
      setTimeout(() => { close(); resetDrag(false); }, 200);
    } else {
      resetDrag(true); // 少しだけ：元の位置へ戻す
    }
  };
  // スマホ：ダブルタップで 2.5 倍と元の大きさを切り替え（指を動かさずに素早く2回タップしたとき）
  function checkDoubleTap(e) {
    const t = e?.changedTouches?.[0];
    if (!t) return;
    const now = Date.now();
    if (lastTap && now - lastTap.time < 300 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
      lastTap = null;
      toggleZoomAt(t.clientX, t.clientY);
      suppressClick = true;
      if (e.cancelable) e.preventDefault();
    } else {
      lastTap = { time: now, x: t.clientX, y: t.clientY };
    }
  }
  box.addEventListener("touchend", endDrag);
  box.addEventListener("touchcancel", endDrag);
  // 写真の外側（暗い部分）をタップすると閉じる。写真は枠いっぱいの入れ物に縦横比を保って描かれるので、実際に描かれた範囲で判定する
  const onPicture = (e) => {
    if (e.target.closest(".demo-slide span")) return true;
    const img = e.target.closest("img");
    if (!img || !img.naturalWidth) return false;
    const r = img.getBoundingClientRect();
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
    return e.clientX >= left && e.clientX <= left + w && e.clientY >= top && e.clientY <= top + h;
  };
  track.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (zoom > 1) return; // 拡大中のタップでは閉じない
    if (!onPicture(e)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "0") resetZoom();
    if (e.key === "ArrowLeft") box.querySelector(".slider-edge.prev")?.click();
    if (e.key === "ArrowRight") box.querySelector(".slider-edge.next")?.click();
  });
  // 一番上の写真：中央をタップすると、今見ている写真から拡大
  topTrack.addEventListener("click", () => open(Math.round(topTrack.scrollLeft / topTrack.clientWidth), topTrack));
  topTrack.addEventListener("keydown", (e) => { if (e.key === "Enter") open(Math.round(topTrack.scrollLeft / topTrack.clientWidth), topTrack); });
  // 下の画像一覧：タップした写真から拡大（一番上の写真と同じ順番）
  root.querySelectorAll(".gallery a[data-photo-index]").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); open(Number(a.dataset.photoIndex), a); });
  });
}

// ---------- 前後の商品へ移動する矢印（四星球のボタン） ----------
// 同じグループ（カテゴリー、またはフィギュアは同じシリーズ）の中だけを移動し、端では反対側の端に戻る
function dragonBallSVG() {
  return dragonBallIcon(4, 52, "db-ball");
}
// 矢印に出す名前：先頭の「ドラゴンボール」は省いて短くする（例：ドラゴンボールZ外伝 サイヤ人絶滅計画 → Z外伝 サイヤ人絶滅計画）
function pagerName(name) {
  const short = String(name).replace(/^(DRAGON BALL|Dragon Ball|ドラゴンボール)\s*:?\s*/, "").trim();
  return short || name;
}
// 矢印の真ん中に出すグループの短い名前
const PAGER_GROUP_LABELS = { book: t("書籍", "Books"), famicom: t("ファミコン", "Famicom"), sfc: t("スーファミ", "Super Famicom"), capsule: t("カプセル", "Capsules") };
function pagerHTML(list, index, groupLabel, nameOf) {
  if (list.length < 2) return "";
  const prev = list[(index - 1 + list.length) % list.length];
  const next = list[(index + 1) % list.length];
  const link = (it, dir) => `
    <a class="pager-link ${dir}" href="${itemURL(it.id)}" aria-label="${dir === "prev" ? t("前へ", "Previous") : t("次へ", "Next")}: ${escapeHTML(it.id)} ${escapeHTML(nameOf(it))}">
      ${dir === "prev" ? dragonBallSVG() : ""}
      <span class="pager-text"><span class="pager-dir">${dir === "prev" ? t("前へ", "Prev") : t("次へ", "Next")}</span><span class="pager-name">${escapeHTML(pagerName(nameOf(it)))}</span></span>
      ${dir === "next" ? dragonBallSVG() : ""}
    </a>`;
  return `<nav class="item-pager" aria-label="${escapeHTML(t(`${groupLabel}の前後の商品`, `Previous and next in ${groupLabel}`))}">
    ${link(prev, "prev")}
    <span class="pager-pos">${escapeHTML(groupLabel)}<br><strong>${index + 1} / ${list.length}</strong></span>
    ${link(next, "next")}
  </nav>`;
}

// ---------- C：ページ内の目次（スマホでは画面上部に固定） ----------
function tocHTML(entries) {
  const list = entries.filter(Boolean);
  if (list.length < 2) return "";
  return `<nav class="page-toc" aria-label="${t("このページの目次", "On this page")}"><ul>${list
    .map(([id, label]) => `<li><a href="#${escapeHTML(id)}">${escapeHTML(label)}</a></li>`)
    .join("")}</ul></nav>`;
}

// ---------- A：ひと目でわかる要約 ----------
function summaryTile(label, html, extra = "") {
  return `<div class="summary-tile"><span class="summary-label">${escapeHTML(label)}</span><div class="summary-value">${html}</div>${extra}</div>`;
}
// 注意する版：再販・修正版・非売品の名前（かっこ書きは省く）。無ければ偽物の注意だけ
function editionAlertHTML(item) {
  const eds = item.editions || [];
  const names = eds.filter((e) => ["reprint", "revision", "promo"].includes(e.kind)).map((e) => String(tx(e.name)).replace(/（.*?）|\s*\(.*?\)/g, "").trim());
  if (names.length) return `<a href="#editions">${escapeHTML(t(`${[...new Set(names)].join("・")}あり`, [...new Set(names)].join(", ")))}</a>`;
  if (eds.some((e) => e.kind === "fake")) return `<a href="#editions">${t("偽物（リプロ品）に注意", "Beware of fakes (reproductions)")}</a>`;
  return "";
}
function summaryHTML(item, opts = {}) {
  const o = item.ownership || {};
  const tiles = [];
  tiles.push(summaryTile(t("所持状況", "Ownership"), `${ownershipBadge(o.status)}${o.note ? `<span class="summary-sub">${escapeHTML(tx(o.note))}</span>` : ""}`));
  const p = (item.purchases || [])[0];
  if (p && p.price != null) {
    tiles.push(summaryTile(t("購入価格", "Paid"), `${escapeHTML(formatYen(p.price))}${p.shipping ? `<span class="summary-sub">${t("＋送料", "+ shipping ")}${escapeHTML(formatYen(p.shipping))}</span>` : ""}${p.date ? `<span class="summary-sub">${escapeHTML(formatDate(p.date))}</span>` : ""}`));
  }
  tiles.push(summaryTile(opts.marketLabel || t("相場の目安", "Market price guide"), `<span id="summary-market">${t("読み込み中…", "Loading…")}</span>`));
  const ed = editionAlertHTML(item);
  if (ed) tiles.push(summaryTile(t("注意する版", "Editions to watch"), ed));
  return `<div class="summary-panel">${tiles.join("")}</div>`;
}
// 相場の目安（ヤフオク落札の最新の中央値。状態の区分があれば区分ごと、版ごとの集計があれば版も）
function summaryMarketHTML(mine) {
  const latest = (list) => list.sort((a, b) => b.date.localeCompare(a.date))[0];
  const parts = [];
  const base = latest(mine.filter((r) => !r.variant && r.source === "yahoo"));
  if (base && base.count) {
    const gs = (base.grades || []).filter((g) => g.count > 0 && g.key !== "sealed");
    if (gs.length) gs.forEach((g) => parts.push(`${escapeHTML(tx(g.label).replace(/（.*?）|\s*\(.*?\)/g, ""))} <strong>${escapeHTML(formatYen(g.median))}</strong>`));
    else parts.push(`<strong>${escapeHTML(formatYen(base.median))}</strong>`);
  }
  const vkeys = [...new Set(mine.filter((r) => r.variant).map((r) => r.variant))];
  for (const k of vkeys) {
    const v = latest(mine.filter((r) => r.variant === k && r.source === "yahoo"));
    if (v && v.count) parts.push(`${escapeHTML(String(tx(v.variantLabel) || k).replace(/（.*?）|\s*\(.*?\)/g, ""))} <strong>${escapeHTML(formatYen(v.median))}</strong>`);
  }
  if (parts.length) return `${parts.join("<br>")}<span class="summary-sub">${t("ヤフオク落札の中央値", "Median sold price on Yahoo! Auctions")}${t("（", " (")}${escapeHTML(formatDate(base?.date || ""))}${t("）", ")")}</span>`;
  // ヤフオクに無ければ、ほかの取得元の最新
  const other = latest(mine.filter((r) => !r.variant && r.count > 0));
  if (other) return `<strong>${escapeHTML(formatYen(other.median))}</strong><span class="summary-sub">${t("中央値", "Median")}${t("（", " (")}${escapeHTML(formatDate(other.date))}${t("）", ")")}</span>`;
  return `<span class="summary-sub">${t("まだ記録がありません", "No records yet")}</span>`;
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
      ? `${formatYen(m.priceMin)}${t(" 〜 ", " – ")}${formatYen(m.priceMax)}`
      : formatYen(m.priceMin ?? m.priceMax);
    return `<tr><td>${escapeHTML(formatDate(m.surveyedAt))}</td><td>${range ? escapeHTML(range) : "—"}</td>
      <td>${escapeHTML(tx(m.condition) || "—")}</td><td>${escapeHTML(tx(m.basis) || "—")}</td></tr>`;
  }).join("");
  return `
    <h3 class="sub-title">${t("メルカリ（売り切れ・手入力の記録）", "Mercari (sold items, entered by hand)")} <a class="sub-link" href="${escapeHTML(mercariSearchURL(item))}" target="_blank" rel="noopener noreferrer">${t("売り切れ一覧を開く", "Open sold listings")}</a></h3>
    ${rows
      ? `<div class="table-scroll"><table class="info-table history-table">
          <thead><tr><th>${t("調査日", "Surveyed")}</th><th>${t("価格", "Price")}</th><th>${t("状態", "Condition")}</th><th>${t("根拠", "Basis")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
      : `<p class="empty-box">${t("メルカリの記録はまだありません。メルカリは自動で取得できないため、売り切れ価格を確認して手で記録します。「売り切れ一覧を開く」から今の売り切れ価格を確認できます。", "No Mercari records yet. Mercari prices cannot be collected automatically, so sold prices are checked and entered by hand. Use \"Open sold listings\" to see current sold prices.")}</p>`}`;
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
    el.innerHTML = `${mercariBlockHTML(item)}<p class="empty-box">${t("まだ自動取得の記録はありません（1日1回、朝6時ごろに更新）。", "No automatically collected records yet (updated once a day around 6 a.m. JST).")}</p>`;
    const sm = document.getElementById("summary-market");
    if (sm) sm.innerHTML = `<span class="summary-sub">${t("まだ記録がありません", "No records yet")}</span>`;
    return;
  }
  const run = hist.meta?.lastRun;
  const statusLines = run
    ? SOURCE_ORDER.filter((k) => run.sources[k]).map((k) => {
        const s = run.sources[k];
        const state = s.ok + s.empty > 0 ? t(`取得 ${s.ok + s.empty}件`, `${s.ok + s.empty} searched`) : t("取得なし", "not collected");
        const why = s.ok + s.empty === 0 && s.messages.length ? t(`（${s.messages[0]}）`, ` (${tx(s.messages[0])})`) : "";
        return `<li>${escapeHTML(tx(s.label))}${t("：", ": ")}${escapeHTML(state + why)}</li>`;
      }).join("")
    : "";
  const mine = (hist.records || []).filter((r) => r.id === item.id);
  const setNote = isCapsuleSeries(item)
    ? `<p class="notice">${t(`このシリーズの相場は、<strong>全${regularFigures(item).length}種そろったセット</strong>（「全${regularFigures(item).length}種」「コンプ」「${regularFigures(item).length}個セット」など）の出品だけを集計しています。1体ずつの相場は、上の「このシリーズのフィギュア」から各フィギュアのページで見られます。`, `Market prices for this series count only <strong>complete sets of all ${regularFigures(item).length}</strong>. Prices for single figures are on each figure's page (see "Figures in this series" above).`)}</p>`
    : "";
  // 版ごとの相場（記録の variant。例：完全復刻版）がある商品は、通常版と版ごとに表を分ける
  const variants = [...new Map(mine.filter((r) => r.variant).map((r) => [r.variant, r.variantLabel || r.variant])).entries()];
  const blocksFor = (list, groupLabel) => SOURCE_ORDER.map((key) => {
    const recs = list.filter((r) => r.source === key).sort((a, b) => b.date.localeCompare(a.date));
    if (recs.length === 0) return "";
    const label = (tx(run?.sources[key]?.label) || key) + (groupLabel ? ` / ${groupLabel}` : "");
    const cells = (s) => `<td>${s.count}${t("件", "")}</td>
      <td>${s.count ? escapeHTML(formatYen(s.min)) : "—"}</td><td>${s.count ? escapeHTML(formatYen(s.median)) : "—"}</td><td>${s.count ? escapeHTML(formatYen(s.max)) : "—"}</td>`;
    // 状態の区分（未開封・箱付き・箱なし など）ごとの集計がある場合は、日付ごとに「全体」と各区分の行を出す
    const graded = recs.some((r) => r.grades?.length);
    const rows = graded
      ? recs.slice(0, 7).map((r) => {
          const subs = r.grades || [];
          const span = subs.length + 1;
          return `<tr><td rowspan="${span}">${escapeHTML(formatDate(r.date))}</td><td><strong>${t("全体", "All")}</strong></td>${cells(r)}</tr>` +
            subs.map((g) => `<tr><td>${escapeHTML(tx(g.label))}</td>${cells(g)}</tr>`).join("");
        }).join("")
      : recs.slice(0, 14).map((r) => `<tr><td>${escapeHTML(formatDate(r.date))}</td>${cells(r)}</tr>`).join("");
    return `
      <h3 class="sub-title">${escapeHTML(label)} <a class="sub-link" href="${escapeHTML(recs[0].searchUrl)}" target="_blank" rel="noopener noreferrer">${t("検索結果を開く", "Open search results")}</a></h3>
      ${graded ? `<p class="notice">${t("状態（未開封・箱付きなど）は、出品名に書かれた語から機械的に分けた目安です。どの区分にも当てはまらない出品は「全体」にだけ含めています。", "Conditions (sealed, with box, etc.) are a rough guide sorted automatically from words in listing titles. Listings that fit no group are counted only in \"All\".")}</p>` : ""}
      <div class="table-scroll"><table class="info-table history-table">
        <thead><tr><th>${t("取得日", "Date")}</th>${graded ? `<th>${t("状態", "Condition")}</th>` : ""}<th>${t("件数", "Count")}</th><th>${t("最安", "Low")}</th><th>${t("中央値", "Median")}</th><th>${t("最高", "High")}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }).join("");
  const blocks = variants.length
    ? `<p class="notice">${t(`この商品は版によって相場が大きく違うため、<strong>通常版</strong>と${variants.map(([, l]) => `<strong>${escapeHTML(l)}</strong>`).join("・")}を分けて集計しています。版の見分け方は上の「版の違い・見分け方」を見てください。出品名に版が書かれていない出品は通常版として数えています。`, `Prices differ greatly by edition, so the <strong>standard edition</strong> and ${variants.map(([, l]) => `<strong>${escapeHTML(tx(l))}</strong>`).join(", ")} are counted separately. See "Editions and how to tell them apart" above. Listings that do not name an edition are counted as standard.`)}</p>` +
      blocksFor(mine.filter((r) => !r.variant), t("通常版", "Standard")) +
      variants.map(([k, l]) => blocksFor(mine.filter((r) => r.variant === k), tx(l))).join("")
    : blocksFor(mine);
  // 最新の値だけの一覧（取得元ごとに1行。状態の区分は小さい行で続ける）
  const yen = (v) => escapeHTML(formatYen(v));
  const rangeText = (o) => (o.count && o.min !== o.max ? `${yen(o.min)}${t("〜", "–")}${yen(o.max)}` : "");
  const latestRows = (list, hideEmpty) => SOURCE_ORDER.map((key) => {
    const r = list.filter((x) => x.source === key).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!r || (hideEmpty && !r.count)) return "";
    const label = tx(run?.sources[key]?.label) || key;
    const subs = (r.grades || []).filter((g) => g.count > 0).map((g) => `<tr class="sub-row"><td>${escapeHTML(tx(g.label))}</td>
      <td>${yen(g.median)}${rangeText(g) ? `<span class="summary-sub">${rangeText(g)}</span>` : ""}</td><td>${g.count}${t("件", "")}</td></tr>`).join("");
    return `<tr><td>${escapeHTML(label)} <a class="sub-link" href="${escapeHTML(r.searchUrl)}" target="_blank" rel="noopener noreferrer">${t("検索結果", "Results")}</a><span class="summary-sub">${escapeHTML(formatDate(r.date))}</span></td>
      <td><strong>${r.count ? yen(r.median) : "—"}</strong>${rangeText(r) ? `<span class="summary-sub">${rangeText(r)}</span>` : ""}</td><td>${r.count}${t("件", "")}</td></tr>${subs}`;
  }).join("");
  const mercariRecs = (item.marketPrices || []).filter(isMercariRecord).sort((a, b) => String(b.surveyedAt).localeCompare(String(a.surveyedAt)));
  const m0 = mercariRecs[0];
  const mRange = m0 && m0.priceMin != null && m0.priceMax != null && m0.priceMin !== m0.priceMax ? `${yen(m0.priceMin)}${t("〜", "–")}${yen(m0.priceMax)}` : "";
  const mercariRow = `<tr><td>${t("メルカリ（売り切れ・手入力）", "Mercari (sold, by hand)")} <a class="sub-link" href="${escapeHTML(mercariSearchURL(item))}" target="_blank" rel="noopener noreferrer">${t("売り切れ一覧", "Sold listings")}</a>${m0 ? `<span class="summary-sub">${escapeHTML(formatDate(m0.surveyedAt))}</span>` : ""}</td>
    <td><strong>${m0 ? yen(m0.priceMin ?? m0.priceMax) : "—"}</strong>${mRange ? `<span class="summary-sub">${mRange}</span>` : ""}</td><td>${m0 ? t("手入力", "Manual") : t("記録なし", "None")}</td></tr>`;
  const groups = variants.length
    ? [[t("通常版", "Standard"), mine.filter((r) => !r.variant)], ...variants.map(([k, l]) => [tx(l), mine.filter((r) => r.variant === k)])]
    : [["", mine]];
  const body = groups.map(([g, list], i) => `${g ? `<tr class="group-row"><th colspan="3">${escapeHTML(g)}</th></tr>` : ""}${i === 0 ? mercariRow : ""}${latestRows(list, i > 0)}`).join("");
  const hasGrades = mine.some((r) => r.grades?.length);
  const latestTable = `
    <div class="table-scroll"><table class="info-table history-table market-latest">
      <thead><tr><th>${t("取得元", "Source")}</th><th>${t("中央値（価格の幅）", "Median (range)")}</th><th>${t("件数", "Count")}</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="sub-note">${t("ヤフオクは落札済み、ブックオフ・楽天は出品中の価格です。", "Yahoo! Auctions shows sold prices; BOOKOFF and Rakuten show current listing prices. ")}${hasGrades ? t("小さい行は、出品名から機械的に分けた状態ごとの目安です。", "Smaller rows are a rough guide by condition, sorted automatically from listing titles. ") : ""}${variants.length ? t("出品名に版が書かれていない出品は通常版として数えています。", "Listings that do not name an edition are counted as standard. ") : ""}${run ? t(`最終取得：${escapeHTML(formatDate(run.date))}（毎朝6時ごろ更新）`, `Last collected: ${escapeHTML(formatDate(run.date))} (updated daily around 6 a.m. JST)`) : ""}</p>`;
  el.innerHTML = `
    ${setNote}
    ${mine.length ? latestTable : `${latestTable}<p class="empty-box">${t("この商品の自動取得の記録はまだありません。", "No automatically collected records for this item yet.")}</p>`}
    <details class="more-box"><summary>${t("過去の記録を見る", "Show past records")}</summary>
      ${variants.length ? `<p class="notice">${t(`この商品は版によって相場が大きく違うため、<strong>通常版</strong>と${variants.map(([, l]) => `<strong>${escapeHTML(l)}</strong>`).join("・")}を分けて集計しています。`, `Prices differ greatly by edition, so the <strong>standard edition</strong> and ${variants.map(([, l]) => `<strong>${escapeHTML(tx(l))}</strong>`).join(", ")} are counted separately.`)}</p>` : ""}
      ${mercariBlockHTML(item)}
      ${blocks}
      ${run ? `<div class="notice"><strong>${t("最終取得：", "Last collected: ")}${escapeHTML(formatDate(run.date))}</strong><ul class="status-list">${statusLines}</ul>
        ${t("件数・価格は、検索結果から条件に合う出品を機械的に集計した目安です（まとめ売り・本体のみ等は除外）。状態や付属品の違いは、ヤフオクで区分を表示している商品以外は区別していません。", "Counts and prices are a rough guide automatically compiled from matching search results (bundles, loose items, etc. are excluded). Condition and accessories are not distinguished except where groups are shown for Yahoo! Auctions.")}</div>` : ""}
    </details>`;
  const sm = document.getElementById("summary-market");
  if (sm) sm.innerHTML = summaryMarketHTML(mine);
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
  document.title = `${item.id} ${tx(item.title)} | ${data.meta?.title || "DRAGON BALL COLLECTION"}`;

  // 要確認事項（alerts）の注意書きはオーナー指示（2026-10-05）で表示しない（データは残す）
  const alerts = "";

  document.getElementById("detail").innerHTML = `
    <nav class="breadcrumb" aria-label="${t("パンくずリスト", "Breadcrumb")}">
      <a href="index.html">${t("トップ", "Home")}</a> ›
      <a href="index.html#cat-${escapeHTML(item.category)}">${escapeHTML(tx(category?.label) || item.category)}</a> ›
      ${escapeHTML(item.id)}
    </nav>
    <div class="detail-head">
      <div class="detail-photo-col">
        <div class="detail-photo">${photoSliderHTML(item.images, tx(item.title), item.id)}${ownershipStamp(item.ownership?.status)}</div>
        ${(() => {
          const group = data.items.filter((i) => i.category === item.category);
          return pagerHTML(group, group.indexOf(item), PAGER_GROUP_LABELS[item.category] || tx(category?.label) || item.category, cardTitle);
        })()}
      </div>
      <div>
        <span class="item-id">${escapeHTML(item.id)}</span>
        <h1 class="detail-title">${escapeHTML(tx(item.title))}</h1>
        <div class="detail-badges">
          ${ownershipBadge(item.ownership?.status)}
          <span class="tag">${escapeHTML(tx(category?.label) || item.category)}</span>
        </div>
        ${alerts}
        ${summaryHTML(item, { marketLabel: isCapsuleSeries(item) ? t("全種セットの相場", "Complete set price") : t("相場の目安", "Market price guide") })}
      </div>
    </div>
    ${tocHTML([
      isCapsuleSeries(item) && ["figures", t("フィギュア", "Figures")],
      ["basic", t("基本情報", "Info")],
      (item.editions || item.editionsNote) && ["editions", t("版の違い", "Editions")],
      ["gallery", t("画像", "Photos")],
      ["ownership", t("所持・購入", "Ownership")],
      ["market", t("相場", "Prices")],
      ["memo", t("メモ・出典", "Notes")],
    ])}
    ${figuresHTML(item)}
    ${section(t("基本情報", "Basic information"), basicInfoHTML(item, category), "basic")}
    ${item.editions || item.editionsNote ? section(t("版の違い・見分け方", "Editions and how to tell them apart"), editionsHTML(item), "editions") : ""}
    ${section(t(`画像（${(item.images || []).length}枚）`, `Photos (${(item.images || []).length})`), galleryHTML(item), "gallery")}
    ${section(t("所持状況・商品の状態", "Ownership and condition"), ownershipHTML(item), "ownership")}
    ${section(t("購入記録", "Purchase records"), purchasesHTML(item))}
    <section id="market"><h2 class="section-title">${isCapsuleSeries(item) ? t("相場（全種セット・自動取得＋メルカリ）", "Market prices (complete set, auto-collected + Mercari)") : t("相場（自動取得＋メルカリ）", "Market prices (auto-collected + Mercari)")}</h2><div id="auto-market"><p class="empty-box">${t("読み込み中…", "Loading…")}</p></div></section>
    ${section(isCapsuleSeries(item) ? t("中古相場（全種セットの調査記録）", "Used market prices (complete set surveys)") : t("中古相場（調査記録）", "Used market prices (surveys)"), marketPricesHTML(item))}
    ${section(t("メモ", "Notes"), item.notes ? `<p class="empty-box" style="border-style:solid;color:var(--text);white-space:pre-line">${escapeHTML(tx(item.notes))}</p>` : `<p class="empty-box">${t("メモはありません。", "No notes.")}</p>`, "memo")}
    ${section(t("参考URL・出典", "References and sources"), referencesHTML(item))}
    ${/* 変更履歴はオーナー指示（2026-10-05）で表示しない（データの history は残す） */ ""}
  `;
}

// フィギュア1体のページ（item.html?id=DBC-001-01）
function renderFigure(data, series, fig) {
  const category = data.categories.find((c) => c.id === series.category);
  const name = figureName(fig);
  document.title = `${fig.id} ${name} | ${data.meta?.title || "DRAGON BALL COLLECTION"}`;
  const o = fig.ownership || {};
  document.getElementById("detail").innerHTML = `
    <nav class="breadcrumb" aria-label="${t("パンくずリスト", "Breadcrumb")}">
      <a href="index.html">${t("トップ", "Home")}</a> ›
      <a href="index.html#cat-${escapeHTML(series.category)}">${escapeHTML(tx(category?.label) || series.category)}</a> ›
      <a href="${itemURL(series.id)}">${escapeHTML(series.id)}</a> ›
      ${escapeHTML(fig.id)}
    </nav>
    <div class="detail-head">
      <div class="detail-photo-col">
        <div class="detail-photo">${photoSliderHTML(fig.images, name, fig.id)}${ownershipStamp(o.status)}</div>
        ${pagerHTML(series.figures || [], (series.figures || []).indexOf(fig), series.id, figureName)}
      </div>
      <div>
        <span class="item-id">${escapeHTML(fig.id)}</span>
        <h1 class="detail-title">${escapeHTML(name)}</h1>
        <div class="detail-badges">
          ${ownershipBadge(o.status)}
          <span class="tag">${escapeHTML(tx(category?.label) || series.category)}</span>
          ${fig.bonus ? `<span class="tag">${t("ボーナスパーツ", "Bonus part")}</span>` : ""}
        </div>
        <p class="series-link">${t("シリーズ：", "Series: ")}<a href="${itemURL(series.id)}">${escapeHTML(tx(series.title))}</a></p>
        ${summaryHTML({ ownership: o }, { marketLabel: t("1体の相場", "Single figure price") })}
      </div>
    </div>
    ${tocHTML([["basic", t("情報", "Info")], ["gallery", t("画像", "Photos")], ["market", t("相場", "Prices")], ["others", t("ほかのフィギュア", "Other figures")]])}
    ${section(t("フィギュアの情報", "Figure information"), `<table class="info-table">
      ${row(t("管理ID", "ID"), `<span class="item-id">${escapeHTML(fig.id)}</span>`)}
      ${row(t("名称", "Name"), factHTML(fig.name))}
      ${row(t("シリーズ内の番号", "Number in series"), fig.bonus ? t("ボーナスパーツ", "Bonus part") : `${fig.no} / ${regularFigures(series).length}`)}
      ${row(t("シリーズ", "Series"), `<a href="${itemURL(series.id)}">${escapeHTML(series.id)} ${escapeHTML(tx(series.title))}</a>`)}
      ${row(t("発売日・発売年", "Release date"), factHTML(series.release, formatDate))}
      ${row(t("メーカー希望小売価格", "Suggested retail price"), factHTML(series.listPrice, formatYen))}
      ${fig.notes ? row(t("メモ", "Notes"), escapeHTML(tx(fig.notes))) : ""}
    </table>`, "basic")}
    ${section(t(`画像（${(fig.images || []).length}枚）`, `Photos (${(fig.images || []).length})`), galleryHTML({ ...series, images: fig.images, title: name }), "gallery")}
    ${section(t("所持状況", "Ownership"), `<table class="info-table">
      ${row(t("所持状況", "Ownership"), `${ownershipBadge(o.status)}${o.checkedAt ? `<span class="sub-note">${t("確認日：", "Checked: ")}${escapeHTML(formatDate(o.checkedAt))}</span>` : ""}${o.note ? `<span class="sub-note">${escapeHTML(tx(o.note))}</span>` : ""}`)}
    </table>`)}
    <section id="market"><h2 class="section-title">${t("相場（自動取得＋メルカリ）", "Market prices (auto-collected + Mercari)")}</h2>
      <p class="sub-note">${t(`このフィギュア1体だけの出品を集計しています（セット・まとめ売りは除外）。全種セットの相場は<a href="${itemURL(series.id)}">シリーズのページ</a>で見られます。`, `Counts only listings of this single figure (sets and bundles excluded). Complete set prices are on the <a href="${itemURL(series.id)}">series page</a>.`)}</p>
      <div id="auto-market"><p class="empty-box">${t("読み込み中…", "Loading…")}</p></div></section>
    ${section(t("中古相場（調査記録）", "Used market prices (surveys)"), marketPricesHTML(fig))}
    ${section(t("ほかのフィギュア", "Other figures"), `<ul class="figure-nav">${(series.figures || [])
      .map((f) => `<li>${f.id === fig.id ? `<strong>${escapeHTML(figureName(f))}</strong>` : `<a href="${itemURL(f.id)}">${escapeHTML(figureName(f))}</a>`}</li>`)
      .join("")}</ul>`, "others")}
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
      initPhotoSliders(el);
      initLightbox(el);
      renderAutoMarket({ ...figure.fig, title: figureName(figure.fig) });
      return;
    }
    if (!item) {
      el.innerHTML = `
        <div class="notice notice-warn">${t(`管理ID「${escapeHTML(id || "（指定なし）")}」の商品は見つかりませんでした。`, `No item found for ID "${escapeHTML(id || "(none)")}".`)}</div>
        <p><a href="index.html">${t("トップページへ戻る", "Back to the top page")}</a></p>`;
      return;
    }
    renderItem(data, item);
    initPhotoSliders(el);
    initLightbox(el);
    renderAutoMarket(item);
  } catch (err) {
    showLoadError(el, err);
  }
})();
