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
      ${statusTag(status)}
    </span>
    ${fact.note ? `<span class="sub-note">${escapeHTML(fact.note)}</span>` : ""}
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
        ${statusTag(status)}</h3>
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
          <div class="item-meta">${ownershipBadge(fig.ownership?.status)}${statusTag(fig.name?.status)}</div>
        </div>
      </a>
    </li>`).join("");
  return section(`このシリーズのフィギュア（${figs.length}体）`, `<ul class="item-grid">${cards}</ul>`, "figures");
}

// 写真の説明文から「（参考画像・…）」の部分を除く（オーナー指示 2026-10-05。データの説明文は残す）
function captionText(caption) {
  return String(caption || "")
    .replace(/[・、]参考画像(?=[）)])/g, "")
    .replace(/[（(]参考画像[^）)]*[）)]/g, "")
    .trim();
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
    .map((img, i) => `
      <li>
        <a href="${escapeHTML(img.path)}" target="_blank" rel="noopener" data-photo-index="${i}" aria-label="拡大して見る：${escapeHTML(captionText(img.caption) || item.title)}">
          <img src="${escapeHTML(img.path)}" alt="${escapeHTML(img.caption || item.title)}" loading="lazy">${referenceLabel(img)}
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
    <div class="slide"><div class="thumb"><img src="${escapeHTML(img.path)}" alt="${escapeHTML(img.caption || title)}" ${i === 0 ? "" : 'loading="lazy"'}></div></div>`);
  if (slides.length === 0) slides.push(`<div class="slide"><div class="thumb"><span class="thumb-placeholder">画像未登録</span></div></div>`);
  if (DEMO_FILL_SLIDES && !DEMO_FILL_EXCLUDE.has(id) && slides.length <= 1) {
    for (let n = slides.length + 1; n <= DEMO_SLIDE_COUNT; n++) {
      slides.push(`<div class="slide"><div class="thumb demo-slide"><span>仮の画像 ${n} / ${DEMO_SLIDE_COUNT}<small>動作確認用（あとで削除）</small></span></div></div>`);
    }
  }
  const n = slides.length;
  return `<div class="photo-slider" data-count="${n}">
    <div class="slider-track" tabindex="0" role="button" aria-label="写真${n > 1 ? "（左右にスクロールで切り替え、タップで拡大）" : "（タップで拡大）"}">${slides.join("")}</div>
    ${n > 1 ? `<button type="button" class="slider-edge prev" aria-label="前の写真"></button>
      <button type="button" class="slider-edge next" aria-label="次の写真"></button>
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
  box.setAttribute("aria-label", "写真の拡大表示");
  box.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="閉じる">×</button>
    <p class="lightbox-hint" aria-hidden="true">下にスライドで閉じる</p>
    <div class="photo-slider lightbox-slider" data-count="${n}">
      <div class="slider-track" tabindex="-1">${topTrack.innerHTML}</div>
      ${n > 1 ? `<button type="button" class="slider-edge prev" aria-label="前の写真"></button>
        <button type="button" class="slider-edge next" aria-label="次の写真"></button>
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
    box.hidden = false;
    document.documentElement.classList.add("lightbox-open");
    // 開いた瞬間に目的の写真の位置へ（Safari の一部の版は behavior: "instant" を受け付けないため、scrollLeft を直接変える）
    track.scrollLeft = index * track.clientWidth;
    if (counter) counter.textContent = `${index + 1} / ${n}`;
    box.querySelector(".lightbox-close").focus();
  };
  const close = () => {
    box.hidden = true;
    document.documentElement.classList.remove("lightbox-open");
    if (opener) opener.focus();
  };
  box.querySelector(".lightbox-close").addEventListener("click", close);

  // スマホ：画面を押したまま下へ大きく動かすと閉じる（横の動きは写真の切り替え）。少しだけなら元に戻る
  const panel = box.querySelector(".lightbox-slider");
  let startX = 0, startY = 0, dy = 0, mode = null; // mode: null（未判定）/ "down"（下へ）/ "side"（横へ）
  function resetDrag(animate) {
    panel.style.transition = animate ? "transform 0.2s ease" : "";
    box.style.transition = animate ? "background-color 0.2s ease" : "";
    panel.style.transform = "";
    box.style.backgroundColor = "";
  }
  box.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { mode = "side"; return; }
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; dy = 0; mode = null;
    panel.style.transition = ""; box.style.transition = "";
  }, { passive: true });
  box.addEventListener("touchmove", (e) => {
    if (mode === "side" || e.touches.length !== 1) return;
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
  const endDrag = () => {
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
  track.addEventListener("click", (e) => { if (!onPicture(e)) close(); });
  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close();
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
function dragonBallSVG(key) {
  const star = (x, y) => `<polygon transform="translate(${x} ${y}) scale(.5)" points="0,-12 3.5,-4 12,-4 5.5,2 8,11 0,6 -8,11 -5.5,2 -12,-4 -3.5,-4"/>`;
  return `<svg class="db-ball" viewBox="0 0 64 64" width="52" height="52" aria-hidden="true" focusable="false">
    <defs><radialGradient id="db-grad-${key}" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset=".35" stop-color="#ffb12e"/><stop offset="1" stop-color="#e2620b"/>
    </radialGradient></defs>
    <circle cx="32" cy="32" r="29" fill="url(#db-grad-${key})" stroke="#161616" stroke-width="3"/>
    <ellipse cx="21" cy="17" rx="9" ry="5" fill="#fff" opacity=".75" transform="rotate(-30 21 17)"/>
    <g fill="#d92d20">${star(23, 25)}${star(41, 25)}${star(23, 42)}${star(41, 42)}</g>
  </svg>`;
}
// 矢印に出す名前：先頭の「ドラゴンボール」は省いて短くする（例：ドラゴンボールZ外伝 サイヤ人絶滅計画 → Z外伝 サイヤ人絶滅計画）
function pagerName(name) {
  const short = String(name).replace(/^(DRAGON BALL|ドラゴンボール)\s*/, "").trim();
  return short || name;
}
// 矢印の真ん中に出すグループの短い名前
const PAGER_GROUP_LABELS = { book: "書籍", famicom: "ファミコン", sfc: "スーファミ", capsule: "カプセル" };
function pagerHTML(list, index, groupLabel, nameOf) {
  if (list.length < 2) return "";
  const prev = list[(index - 1 + list.length) % list.length];
  const next = list[(index + 1) % list.length];
  const link = (it, dir) => `
    <a class="pager-link ${dir}" href="${itemURL(it.id)}" aria-label="${dir === "prev" ? "前へ" : "次へ"}：${escapeHTML(it.id)} ${escapeHTML(nameOf(it))}">
      ${dir === "prev" ? dragonBallSVG(dir) : ""}
      <span class="pager-text"><span class="pager-dir">${dir === "prev" ? "前へ" : "次へ"}</span><span class="pager-name">${escapeHTML(pagerName(nameOf(it)))}</span></span>
      ${dir === "next" ? dragonBallSVG(dir) : ""}
    </a>`;
  return `<nav class="item-pager" aria-label="${escapeHTML(groupLabel)}の前後の商品">
    ${link(prev, "prev")}
    <span class="pager-pos">${escapeHTML(groupLabel)}<br><strong>${index + 1} / ${list.length}</strong></span>
    ${link(next, "next")}
  </nav>`;
}

// ---------- C：ページ内の目次（スマホでは画面上部に固定） ----------
function tocHTML(entries) {
  const list = entries.filter(Boolean);
  if (list.length < 2) return "";
  return `<nav class="page-toc" aria-label="このページの目次"><ul>${list
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
  const names = eds.filter((e) => ["reprint", "revision", "promo"].includes(e.kind)).map((e) => String(e.name).replace(/（.*?）/g, "").trim());
  if (names.length) return `<a href="#editions">${escapeHTML([...new Set(names)].join("・"))}あり</a>`;
  if (eds.some((e) => e.kind === "fake")) return `<a href="#editions">偽物（リプロ品）に注意</a>`;
  return "";
}
function summaryHTML(item, opts = {}) {
  const o = item.ownership || {};
  const tiles = [];
  tiles.push(summaryTile("所持状況", `${ownershipBadge(o.status)}${o.note ? `<span class="summary-sub">${escapeHTML(o.note)}</span>` : ""}`));
  const p = (item.purchases || [])[0];
  if (p && p.price != null) {
    tiles.push(summaryTile("購入価格", `${escapeHTML(formatYen(p.price))}${p.shipping ? `<span class="summary-sub">＋送料${escapeHTML(formatYen(p.shipping))}</span>` : ""}${p.date ? `<span class="summary-sub">${escapeHTML(formatDate(p.date))}</span>` : ""}`));
  }
  tiles.push(summaryTile(opts.marketLabel || "相場の目安", `<span id="summary-market">読み込み中…</span>`));
  const ed = editionAlertHTML(item);
  if (ed) tiles.push(summaryTile("注意する版", ed));
  return `<div class="summary-panel">${tiles.join("")}</div>`;
}
// 相場の目安（ヤフオク落札の最新の中央値。状態の区分があれば区分ごと、版ごとの集計があれば版も）
function summaryMarketHTML(mine) {
  const latest = (list) => list.sort((a, b) => b.date.localeCompare(a.date))[0];
  const parts = [];
  const base = latest(mine.filter((r) => !r.variant && r.source === "yahoo"));
  if (base && base.count) {
    const gs = (base.grades || []).filter((g) => g.count > 0 && g.key !== "sealed");
    if (gs.length) gs.forEach((g) => parts.push(`${escapeHTML(g.label.replace(/（.*?）/g, ""))} <strong>${escapeHTML(formatYen(g.median))}</strong>`));
    else parts.push(`<strong>${escapeHTML(formatYen(base.median))}</strong>`);
  }
  const vkeys = [...new Set(mine.filter((r) => r.variant).map((r) => r.variant))];
  for (const k of vkeys) {
    const v = latest(mine.filter((r) => r.variant === k && r.source === "yahoo"));
    if (v && v.count) parts.push(`${escapeHTML(String(v.variantLabel || k).replace(/（.*?）/g, ""))} <strong>${escapeHTML(formatYen(v.median))}</strong>`);
  }
  if (parts.length) return `${parts.join("<br>")}<span class="summary-sub">ヤフオク落札の中央値（${escapeHTML(formatDate(base?.date || ""))}）</span>`;
  // ヤフオクに無ければ、ほかの取得元の最新
  const other = latest(mine.filter((r) => !r.variant && r.count > 0));
  if (other) return `<strong>${escapeHTML(formatYen(other.median))}</strong><span class="summary-sub">中央値（${escapeHTML(formatDate(other.date))}）</span>`;
  return `<span class="summary-sub">まだ記録がありません</span>`;
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
    const sm = document.getElementById("summary-market");
    if (sm) sm.innerHTML = `<span class="summary-sub">まだ記録がありません</span>`;
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
  // 版ごとの相場（記録の variant。例：完全復刻版）がある商品は、通常版と版ごとに表を分ける
  const variants = [...new Map(mine.filter((r) => r.variant).map((r) => [r.variant, r.variantLabel || r.variant])).entries()];
  const blocksFor = (list, groupLabel) => SOURCE_ORDER.map((key) => {
    const recs = list.filter((r) => r.source === key).sort((a, b) => b.date.localeCompare(a.date));
    if (recs.length === 0) return "";
    const label = (run?.sources[key]?.label || key) + (groupLabel ? `／${groupLabel}` : "");
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
  const blocks = variants.length
    ? `<p class="notice">この商品は版によって相場が大きく違うため、<strong>通常版</strong>と${variants.map(([, l]) => `<strong>${escapeHTML(l)}</strong>`).join("・")}を分けて集計しています。版の見分け方は上の「版の違い・見分け方」を見てください。出品名に版が書かれていない出品は通常版として数えています。</p>` +
      blocksFor(mine.filter((r) => !r.variant), "通常版") +
      variants.map(([k, l]) => blocksFor(mine.filter((r) => r.variant === k), l)).join("")
    : blocksFor(mine);
  // 最新の値だけの一覧（取得元ごとに1行。状態の区分は小さい行で続ける）
  const yen = (v) => escapeHTML(formatYen(v));
  const rangeText = (o) => (o.count && o.min !== o.max ? `${yen(o.min)}〜${yen(o.max)}` : "");
  const latestRows = (list, hideEmpty) => SOURCE_ORDER.map((key) => {
    const r = list.filter((x) => x.source === key).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!r || (hideEmpty && !r.count)) return "";
    const label = run?.sources[key]?.label || key;
    const subs = (r.grades || []).filter((g) => g.count > 0).map((g) => `<tr class="sub-row"><td>${escapeHTML(g.label)}</td>
      <td>${yen(g.median)}${rangeText(g) ? `<span class="summary-sub">${rangeText(g)}</span>` : ""}</td><td>${g.count}件</td></tr>`).join("");
    return `<tr><td>${escapeHTML(label)} <a class="sub-link" href="${escapeHTML(r.searchUrl)}" target="_blank" rel="noopener noreferrer">検索結果</a><span class="summary-sub">${escapeHTML(formatDate(r.date))}</span></td>
      <td><strong>${r.count ? yen(r.median) : "—"}</strong>${rangeText(r) ? `<span class="summary-sub">${rangeText(r)}</span>` : ""}</td><td>${r.count}件</td></tr>${subs}`;
  }).join("");
  const mercariRecs = (item.marketPrices || []).filter(isMercariRecord).sort((a, b) => String(b.surveyedAt).localeCompare(String(a.surveyedAt)));
  const m0 = mercariRecs[0];
  const mRange = m0 && m0.priceMin != null && m0.priceMax != null && m0.priceMin !== m0.priceMax ? `${yen(m0.priceMin)}〜${yen(m0.priceMax)}` : "";
  const mercariRow = `<tr><td>メルカリ（売り切れ・手入力） <a class="sub-link" href="${escapeHTML(mercariSearchURL(item))}" target="_blank" rel="noopener noreferrer">売り切れ一覧</a>${m0 ? `<span class="summary-sub">${escapeHTML(formatDate(m0.surveyedAt))}</span>` : ""}</td>
    <td><strong>${m0 ? yen(m0.priceMin ?? m0.priceMax) : "—"}</strong>${mRange ? `<span class="summary-sub">${mRange}</span>` : ""}</td><td>${m0 ? "手入力" : "記録なし"}</td></tr>`;
  const groups = variants.length
    ? [["通常版", mine.filter((r) => !r.variant)], ...variants.map(([k, l]) => [l, mine.filter((r) => r.variant === k)])]
    : [["", mine]];
  const body = groups.map(([g, list], i) => `${g ? `<tr class="group-row"><th colspan="3">${escapeHTML(g)}</th></tr>` : ""}${i === 0 ? mercariRow : ""}${latestRows(list, i > 0)}`).join("");
  const hasGrades = mine.some((r) => r.grades?.length);
  const latestTable = `
    <div class="table-scroll"><table class="info-table history-table market-latest">
      <thead><tr><th>取得元</th><th>中央値（価格の幅）</th><th>件数</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="sub-note">ヤフオクは落札済み、ブックオフ・楽天は出品中の価格です。${hasGrades ? "小さい行は、出品名から機械的に分けた状態ごとの目安です。" : ""}${variants.length ? "出品名に版が書かれていない出品は通常版として数えています。" : ""}${run ? `最終取得：${escapeHTML(formatDate(run.date))}（毎朝6時ごろ更新）` : ""}</p>`;
  el.innerHTML = `
    ${setNote}
    ${mine.length ? latestTable : `${latestTable}<p class="empty-box">この商品の自動取得の記録はまだありません。</p>`}
    <details class="more-box"><summary>過去の記録を見る</summary>
      ${variants.length ? `<p class="notice">この商品は版によって相場が大きく違うため、<strong>通常版</strong>と${variants.map(([, l]) => `<strong>${escapeHTML(l)}</strong>`).join("・")}を分けて集計しています。</p>` : ""}
      ${mercariBlockHTML(item)}
      ${blocks}
      ${run ? `<div class="notice"><strong>最終取得：${escapeHTML(formatDate(run.date))}</strong><ul class="status-list">${statusLines}</ul>
        件数・価格は、検索結果から条件に合う出品を機械的に集計した目安です（まとめ売り・本体のみ等は除外）。状態や付属品の違いは、ヤフオクで区分を表示している商品以外は区別していません。</div>` : ""}
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
  document.title = `${item.id} ${item.title} | ${data.meta?.title || "DRAGON BALL COLLECTION"}`;

  // 要確認事項（alerts）の注意書きはオーナー指示（2026-10-05）で表示しない（データは残す）
  const alerts = "";

  document.getElementById("detail").innerHTML = `
    <nav class="breadcrumb" aria-label="パンくずリスト">
      <a href="index.html">トップ</a> ›
      <a href="index.html#cat-${escapeHTML(item.category)}">${escapeHTML(category?.label || item.category)}</a> ›
      ${escapeHTML(item.id)}
    </nav>
    <div class="detail-head">
      <div class="detail-photo-col">
        <div class="detail-photo">${photoSliderHTML(item.images, item.title, item.id)}${ownershipStamp(item.ownership?.status)}</div>
        ${(() => {
          const group = data.items.filter((i) => i.category === item.category);
          return pagerHTML(group, group.indexOf(item), PAGER_GROUP_LABELS[item.category] || category?.label || item.category, cardTitle);
        })()}
      </div>
      <div>
        <span class="item-id">${escapeHTML(item.id)}</span>
        <h1 class="detail-title">${escapeHTML(item.title)}</h1>
        <div class="detail-badges">
          ${ownershipBadge(item.ownership?.status)}
          <span class="tag">${escapeHTML(category?.label || item.category)}</span>
        </div>
        ${alerts}
        ${summaryHTML(item, { marketLabel: isCapsuleSeries(item) ? "全種セットの相場" : "相場の目安" })}
      </div>
    </div>
    ${tocHTML([
      isCapsuleSeries(item) && ["figures", "フィギュア"],
      ["basic", "基本情報"],
      (item.editions || item.editionsNote) && ["editions", "版の違い"],
      ["gallery", "画像"],
      ["ownership", "所持・購入"],
      ["market", "相場"],
      ["memo", "メモ・出典"],
    ])}
    ${figuresHTML(item)}
    ${section("基本情報", basicInfoHTML(item, category), "basic")}
    ${item.editions || item.editionsNote ? section("版の違い・見分け方", editionsHTML(item), "editions") : ""}
    ${section(`画像（${(item.images || []).length}枚）`, galleryHTML(item), "gallery")}
    ${section("所持状況・商品の状態", ownershipHTML(item), "ownership")}
    ${section("購入記録", purchasesHTML(item))}
    <section id="market"><h2 class="section-title">${isCapsuleSeries(item) ? "相場（全種セット・自動取得＋メルカリ）" : "相場（自動取得＋メルカリ）"}</h2><div id="auto-market"><p class="empty-box">読み込み中…</p></div></section>
    ${section(isCapsuleSeries(item) ? "中古相場（全種セットの調査記録）" : "中古相場（調査記録）", marketPricesHTML(item))}
    ${section("メモ", item.notes ? `<p class="empty-box" style="border-style:solid;color:var(--text);white-space:pre-line">${escapeHTML(item.notes)}</p>` : `<p class="empty-box">メモはありません。</p>`, "memo")}
    ${section("参考URL・出典", referencesHTML(item))}
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
    <nav class="breadcrumb" aria-label="パンくずリスト">
      <a href="index.html">トップ</a> ›
      <a href="index.html#cat-${escapeHTML(series.category)}">${escapeHTML(category?.label || series.category)}</a> ›
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
          <span class="tag">${escapeHTML(category?.label || series.category)}</span>
        </div>
        <p class="series-link">シリーズ：<a href="${itemURL(series.id)}">${escapeHTML(series.title)}</a></p>
        ${summaryHTML({ ownership: o }, { marketLabel: "1体の相場" })}
      </div>
    </div>
    ${tocHTML([["basic", "情報"], ["gallery", "画像"], ["market", "相場"], ["others", "ほかのフィギュア"]])}
    ${section("フィギュアの情報", `<table class="info-table">
      ${row("管理ID", `<span class="item-id">${escapeHTML(fig.id)}</span>`)}
      ${row("名称", factHTML(fig.name))}
      ${row("シリーズ内の番号", `${fig.no} / ${(series.figures || []).length}`)}
      ${row("シリーズ", `<a href="${itemURL(series.id)}">${escapeHTML(series.id)} ${escapeHTML(series.title)}</a>`)}
      ${row("発売日・発売年", factHTML(series.release, formatDate))}
      ${row("メーカー希望小売価格", factHTML(series.listPrice, formatYen))}
      ${fig.notes ? row("メモ", escapeHTML(fig.notes)) : ""}
    </table>`, "basic")}
    ${section(`画像（${(fig.images || []).length}枚）`, galleryHTML({ ...series, images: fig.images, title: name }), "gallery")}
    ${section("所持状況", `<table class="info-table">
      ${row("所持状況", `${ownershipBadge(o.status)}${o.checkedAt ? `<span class="sub-note">確認日：${escapeHTML(formatDate(o.checkedAt))}</span>` : ""}${o.note ? `<span class="sub-note">${escapeHTML(o.note)}</span>` : ""}`)}
    </table>`)}
    <section id="market"><h2 class="section-title">相場（自動取得＋メルカリ）</h2>
      <p class="sub-note">このフィギュア1体だけの出品を集計しています（セット・まとめ売りは除外）。全種セットの相場は<a href="${itemURL(series.id)}">シリーズのページ</a>で見られます。</p>
      <div id="auto-market"><p class="empty-box">読み込み中…</p></div></section>
    ${section("中古相場（調査記録）", marketPricesHTML(fig))}
    ${section("ほかのフィギュア", `<ul class="figure-nav">${(series.figures || [])
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
      initLightbox(el);
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
    initPhotoSliders(el);
    initLightbox(el);
    renderAutoMarket(item);
  } catch (err) {
    showLoadError(el, err);
  }
})();
