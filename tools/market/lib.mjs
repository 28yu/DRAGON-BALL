// 相場の自動取得（collect.mjs）と出品中の一覧（listings.mjs）で共通に使う部品
// - サイトの robots.txt を確認し、禁止されているページは読まない。
// - 読み込みの間は数秒あけ、サイトに負荷をかけない。

export const UA = "DragonBallCollectionBot/1.0 (personal collection price log; +https://github.com/28yu/DRAGON-BALL)";
export const WAIT_MS = 3000;
// どの商品でも除外する出品（まとめ売り・本体・攻略本など相場をゆがめるもの）
export const GLOBAL_EXCLUDE = ["まとめ", "セット", "本体", "大量", "空箱", "箱のみ", "説明書のみ"];
// 共通の除外語のうち、そのままだと別の語にも当てはまるものの検索パターン（「セット」が「カセット」に当てはまらないように）
export const GLOBAL_PATTERN = { "セット": "(?<!カ)セット" };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- robots.txt ----------
const robotsCache = new Map();
const robotsWhy = new Map();
export async function robotsAllows(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    let why = "";
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA } });
      // 404/410（ファイルなし）は制限なし。それ以外のエラーは確認できないものとして扱う
      if (res.ok) rules = parseRobots(await res.text());
      else if (res.status === 404 || res.status === 410) rules = [];
      else { rules = null; why = `HTTP ${res.status}`; }
    } catch (e) {
      rules = null; // robots.txt を確認できない場合は安全側に倒して取得しない
      why = e.cause?.code || e.message;
    }
    robotsCache.set(u.origin, rules);
    // 確認できなかった理由（サイトの応答番号・通信エラーの種類）を記録に残す
    if (rules === null) robotsWhy.set(u.origin, why);
  }
  const rules = robotsCache.get(u.origin);
  if (rules === null) return { ok: false, reason: `robots.txt を確認できなかったため取得しない（${robotsWhy.get(u.origin)}）` };
  const path = u.pathname + u.search;
  let best = null;
  for (const r of rules) {
    if (r.pattern && matchRobots(path, r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  if (best && !best.allow) return { ok: false, reason: `robots.txt で禁止（Disallow: ${best.pattern}）` };
  return { ok: true };
}
function parseRobots(text) {
  // User-agent: * のグループだけを使う
  const rules = [];
  let agents = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (inRules) { agents = []; inRules = false; }
      agents.push(val.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      inRules = true;
      if (agents.includes("*")) rules.push({ allow: key === "allow", pattern: val });
    }
  }
  return rules;
}
function matchRobots(path, pattern) {
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}


// ---------- 取得処理 ----------
// okStatus：成功として扱う応答番号（例：ヤフオクの出品中の検索は、0件のとき 404 を返す）
export async function getText(url, { okStatus = [] } = {}) {
  const check = await robotsAllows(url);
  if (!check.ok) return { skipped: check.reason };
  await sleep(WAIT_MS);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok && !okStatus.includes(res.status)) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text(), status: res.status };
}

export const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
export const toNum = (s) => Number(String(s).replace(/[^\d]/g, ""));

// 検索結果から、商品の条件（market.mustInclude / exclude）に合う出品だけを残す
export function filterRows(rows, market) {
  const inc = (market.mustInclude || []).map((s) => new RegExp(s, "i"));
  // allowWords：共通の除外語のうち、この商品では除外しない語（全種セットの相場を取るシリーズの「セット」など）
  const allow = market.allowWords || [];
  const exc = [...(market.exclude || []), ...GLOBAL_EXCLUDE.filter((w) => !allow.includes(w)).map((w) => GLOBAL_PATTERN[w] || w)];
  return rows.filter((r) => r.price > 0 && inc.every((re) => re.test(r.title)) && !exc.some((w) => new RegExp(w, "i").test(r.title)));
}
