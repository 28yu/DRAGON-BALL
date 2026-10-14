// 相場の推移グラフ（商品詳細ページ。2026-10-14 オーナー指示で追加）
// data/market-history.json の記録から、取得元ごとの「中央値」を日付順の折れ線で描く。
// 件数が0の日は点を打たず、線もそこで切る。数値の一覧は「過去の記録を見る」の表にある。
// ヤフオクで状態の区分（未開封・箱付き・箱なし など）を集計している商品は、状態ごとのグラフも出す（2026-10-14 オーナー指示）。

// 取得元ごとの色と点の形（色だけで見分けなくて済むよう、点の形も変える）
const CHART_SERIES_STYLE = {
  yahoo: { color: "var(--series-1)", shape: "circle" },
  bookoff: { color: "var(--series-2)", shape: "square" },
  rakuten: { color: "var(--series-3)", shape: "diamond" },
};

// 取得元ごとの点の列を作る。records は同じ商品・同じ版の記録
function marketChartSeries(records, labelOf) {
  return Object.keys(CHART_SERIES_STYLE)
    .map((key) => {
      const points = records
        .filter((r) => r.source === key)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, value: r.count ? r.median : null, count: r.count, min: r.min, max: r.max }));
      return { key, label: labelOf(key), points, ...CHART_SERIES_STYLE[key] };
    })
    .filter((s) => s.points.some((p) => p.value != null));
}

// 状態ごとの線の色と点の形（取得元のグラフと色がかぶらないよう、別の色を使う）。「全体」は灰色の点線
const CHART_GRADE_STYLE = [
  { color: "var(--grade-1)", shape: "square" },
  { color: "var(--grade-2)", shape: "diamond" },
  { color: "var(--grade-3)", shape: "triangle" },
];
// ヤフオクの記録から、「全体」と状態の区分ごとの点の列を作る
function marketGradeSeries(records) {
  const recs = records.filter((r) => r.source === "yahoo").sort((a, b) => a.date.localeCompare(b.date));
  if (!recs.some((r) => r.grades?.length)) return [];
  const toPoint = (r, o) => ({ date: r.date, value: o && o.count ? o.median : null, count: o ? o.count : null });
  const all = { key: "all", label: t("全体", "All"), points: recs.map((r) => toPoint(r, r)), color: "var(--text-muted)", shape: "circle", dashed: true };
  // 区分の並びは記録に出てくる順（未開封 → 箱付き → 箱なし など）
  const grades = [...new Map(recs.flatMap((r) => r.grades || []).map((g) => [g.key, g.label])).entries()];
  const lines = grades.map(([key, label], i) => ({
    key,
    label: tx(label),
    // 状態の集計を始める前の日は「記録なし」（点を打たない）
    points: recs.map((r) => (r.grades ? toPoint(r, r.grades.find((g) => g.key === key) || { count: 0 }) : { date: r.date, value: null, count: null })),
    ...CHART_GRADE_STYLE[i % CHART_GRADE_STYLE.length],
  }));
  return [all, ...lines].filter((s) => s.points.some((p) => p.value != null));
}

// グラフを入れる枠（実際の絵は drawMarketCharts で、枠の幅に合わせて描く）
const marketChartData = [];
function marketChartHTML(series, title, note = "") {
  if (!series.length) return "";
  const id = marketChartData.push(series) - 1;
  const legend = series
    .map((s) => `<li><svg width="26" height="12" aria-hidden="true"><line x1="1" y1="6" x2="25" y2="6" stroke="${s.color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="4 3"' : ""}/>${markerSVG(s.shape, 13, 6, s.color)}</svg>${escapeHTML(s.label)}</li>`)
    .join("");
  return `
    <figure class="market-chart" data-chart="${id}">
      <figcaption class="market-chart-title">${escapeHTML(title)}${note ? `<small class="market-chart-note">${escapeHTML(note)}</small>` : ""}</figcaption>
      <ul class="market-chart-legend">${legend}</ul>
      <div class="market-chart-plot"></div>
    </figure>`;
}

function markerSVG(shape, x, y, color, r = 4) {
  const ring = `stroke="var(--surface)" stroke-width="2"`;
  if (shape === "square") return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="1" fill="${color}" ${ring}/>`;
  if (shape === "diamond") {
    const d = r * 1.3;
    return `<polygon points="${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}" fill="${color}" ${ring}/>`;
  }
  if (shape === "triangle") {
    const d = r * 1.3;
    return `<polygon points="${x},${y - d} ${x + d},${y + d * 0.75} ${x - d},${y + d * 0.75}" fill="${color}" ${ring}/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${ring}/>`;
}

// 目盛りをきりのよい数にする（例：0, 5,000, 10,000…）
function niceStep(max, count) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

// 軸の金額は短く書く（英語は ¥12k、日本語は 1.2万）
function shortYen(v) {
  if (LANG === "en") return v >= 1000 ? `¥${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : `¥${v}`;
  return v >= 10000 ? `${(v / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万` : `${v.toLocaleString("ja-JP")}円`;
}

function shortDate(date) {
  const [, m, d] = date.split("-");
  return LANG === "en" ? `${EN_MONTHS[Number(m) - 1]} ${Number(d)}` : `${Number(m)}/${Number(d)}`;
}

function drawMarketChart(fig) {
  const series = marketChartData[Number(fig.dataset.chart)];
  const plot = fig.querySelector(".market-chart-plot");
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  if (dates.length < 2) {
    plot.innerHTML = `<p class="sub-note">${t("記録が2日分以上たまると、ここに推移のグラフが出ます。", "A trend chart appears here once there are records for two or more days.")}</p>`;
    return;
  }
  const W = Math.max(260, plot.clientWidth);
  const H = W < 480 ? 190 : 230;
  const m = { top: 12, right: 14, bottom: 26, left: W < 480 ? 46 : 58 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v != null);
  const step = niceStep(Math.max(...values) || 1, 4);
  const yMax = Math.ceil((Math.max(...values) * 1.05) / step) * step || step;
  const x = (i) => m.left + (dates.length === 1 ? iw / 2 : (i / (dates.length - 1)) * iw);
  const y = (v) => m.top + ih - (v / yMax) * ih;

  // 横の目盛り線と金額
  let grid = "";
  for (let v = 0; v <= yMax + 1e-6; v += step) {
    grid += `<line class="mc-grid${v === 0 ? " mc-base" : ""}" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="mc-axis" x="${m.left - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${escapeHTML(shortYen(v))}</text>`;
  }
  // 日付の目盛り（多いときは間引く）
  const every = Math.max(1, Math.ceil(dates.length / Math.floor(iw / 52)));
  let xTicks = "";
  dates.forEach((d, i) => {
    if (i % every && i !== dates.length - 1) return;
    if (i !== dates.length - 1 && dates.length - 1 - i < every) return; // 最後の日付と重ならないように
    const anchor = i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle";
    xTicks += `<text class="mc-axis" x="${x(i)}" y="${H - 8}" text-anchor="${anchor}">${escapeHTML(shortDate(d))}</text>`;
  });
  // 線と点。値のない日で線を切る
  const lines = series.map((s) => {
    const byDate = new Map(s.points.map((p) => [p.date, p]));
    let path = "";
    let pen = false;
    let marks = "";
    dates.forEach((d, i) => {
      const p = byDate.get(d);
      if (!p || p.value == null) { pen = false; return; }
      path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      pen = true;
      marks += markerSVG(s.shape, x(i), y(p.value), s.color);
    });
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 4"' : ""}/>${marks}`;
  }).join("");

  plot.innerHTML = `
    <svg class="mc-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHTML(`${fig.querySelector(".market-chart-title")?.textContent || ""}${t("（折れ線グラフ）。数値は「過去の記録を見る」の表にあります。", " (line chart). The numbers are in the tables under \"Show past records\".")}`)}">
      ${grid}${xTicks}
      <line class="mc-cross" x1="0" x2="0" y1="${m.top}" y2="${m.top + ih}" visibility="hidden"/>
      ${lines}
      <rect class="mc-hit" x="${m.left - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>
    </svg>
    <div class="mc-tip${W < 480 ? " mc-tip-below" : ""}" hidden></div>`;

  // 指やマウスを当てた日の値を出す
  const svg = plot.querySelector("svg");
  const cross = svg.querySelector(".mc-cross");
  const tip = plot.querySelector(".mc-tip");
  const show = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const i = Math.max(0, Math.min(dates.length - 1, Math.round(((px - m.left) / iw) * (dates.length - 1))));
    const d = dates[i];
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.setAttribute("visibility", "visible");
    const rows = series.map((s) => {
      const p = s.points.find((q) => q.date === d);
      const val = p && p.value != null ? `${escapeHTML(formatYen(p.value))} <small>${t(`（${p.count}件）`, `(${p.count})`)}</small>` : `<small>${p ? t("0件", "none") : t("記録なし", "no record")}</small>`;
      return `<li><svg width="12" height="12" aria-hidden="true">${markerSVG(s.shape, 6, 6, s.color)}</svg><span>${escapeHTML(s.label)}</span><strong>${val}</strong></li>`;
    }).join("");
    tip.innerHTML = `<p class="mc-tip-date">${escapeHTML(formatDate(d))}　${t("中央値", "Median")}</p><ul>${rows}</ul>`;
    tip.hidden = false;
    // スマホなど幅が狭いときは、グラフに重ねずに下に出す
    if (W < 480) return;
    const tw = tip.offsetWidth;
    const left = x(i) + 12 + tw > W ? x(i) - 12 - tw : x(i) + 12;
    tip.style.left = `${Math.max(0, left)}px`;
  };
  const hide = () => {
    cross.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };
  const hit = svg.querySelector(".mc-hit");
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") hide(); });
  plot.hideTip = hide;
}
// グラフの外を押したら、出ている値の表示を消す
document.addEventListener("pointerdown", (ev) => {
  document.querySelectorAll(".market-chart-plot").forEach((plot) => {
    if (plot.hideTip && !plot.contains(ev.target)) plot.hideTip();
  });
});

// ページ内のグラフをすべて描く。画面の幅が変わったら描き直す
function drawMarketCharts(root = document) {
  root.querySelectorAll(".market-chart[data-chart]").forEach(drawMarketChart);
}
let marketChartWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === marketChartWidth) return; // スマホでアドレスバーが出入りしただけのときは描き直さない
  marketChartWidth = window.innerWidth;
  drawMarketCharts();
});
