// アクセス解析：ページの表示・滞在時間・外部リンクのクリックを Supabase（プロジェクト dragon-ball）に記録する。
// - IPアドレス・名前などの個人情報は送らない。端末ごと・訪問ごとの番号はランダムな値。
// - 記録先の表は閲覧者からは読めず、集計はパスワード付きのダッシュボード（dashboard.html）だけで見られる。
// - 詳しくは docs/analytics.md。

(function () {
  const CONFIG = {
    url: "https://ebyifkbzxbqstggfqqrt.supabase.co",
    // 公開用の鍵（ブラウザに置く前提の鍵。表の読み書きは Supabase 側の制限で守っている）
    key: "sb_publishable_9eULNP9uzOCtaL-8aCq0YA_u3fRiPo7",
    site: "dragon-ball",
    // 公開サイトでのアクセスだけを記録する（手元の確認用サーバーでは記録しない）
    hosts: ["28yu.github.io"],
    sessionMinutes: 30,
  };
  const OPTOUT_KEY = "db-analytics-optout";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.random() * 256; });
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // Supabase の窓口の関数を呼ぶ（ダッシュボードからも使う）
  async function rpc(name, body, opts = {}) {
    const res = await fetch(`${CONFIG.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: CONFIG.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: !!opts.keepalive,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const isOptedOut = () => storageGet(OPTOUT_KEY) === "1";

  window.DBAnalytics = {
    config: CONFIG,
    rpc,
    isOptedOut,
    // この端末のアクセスを記録しない／記録する（ダッシュボードの設定から切り替える）
    setOptOut(on) {
      if (on) storageSet(OPTOUT_KEY, "1");
      else storageRemove(OPTOUT_KEY);
    },
  };

  // ---------- ここから記録 ----------
  const path = location.pathname;
  const isDashboard = /dashboard\.html$/.test(path);
  if (isDashboard) return; // ダッシュボード自体は数えない
  if (!CONFIG.hosts.includes(location.hostname)) return;
  if (isOptedOut()) return;
  if (navigator.webdriver) return; // 自動操作のブラウザ（ロボット）は数えない

  const params = new URLSearchParams(location.search);
  const itemId = /item\.html$/.test(path) ? (params.get("id") || "").slice(0, 40) : "";
  const CATEGORY_BY_PREFIX = { BOOK: "book", FC: "famicom", SFC: "sfc", DBC: "capsule" };
  const category = itemId ? CATEGORY_BY_PREFIX[itemId.split("-")[0]] || null : null;
  const pageType = itemId ? "item" : /listings\.html$/.test(path) ? "listings" : /(\/|index\.html)$/.test(path) ? "top" : "other";

  // 端末ごとの番号（初めての端末なら新しく作る）
  let visitorId = storageGet("db-vid");
  let isNewVisitor = false;
  if (!visitorId) {
    visitorId = uuid();
    isNewVisitor = storageSet("db-vid", visitorId);
  }
  // 訪問ごとの番号（最後の操作から30分たったら新しい訪問）
  const now = Date.now();
  let sessionId = storageGet("db-sid");
  const lastSeen = Number(storageGet("db-sid-ts")) || 0;
  let isNewSession = false;
  if (!sessionId || now - lastSeen > CONFIG.sessionMinutes * 60 * 1000) {
    sessionId = uuid();
    isNewSession = true;
    storageSet("db-sid", sessionId);
  }
  const touchSession = () => storageSet("db-sid-ts", String(Date.now()));
  touchSession();

  let referrerHost = null;
  try {
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.host !== location.host) referrerHost = r.hostname;
    }
  } catch (e) {}

  const ua = navigator.userAgent;
  const device = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "tablet"
    : /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop";
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iOS"
    : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "その他";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "その他";

  let tz = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) {}

  const viewId = uuid();
  const base = { site: CONFIG.site, view_id: viewId, visitor_id: visitorId, session_id: sessionId };

  function send(name, body, keepalive) {
    rpc(name, body, { keepalive }).catch(() => {}); // 記録に失敗しても、サイトの表示には影響させない
  }

  send("track_view", {
    p: {
      ...base,
      path,
      page_type: pageType,
      item_id: itemId || null,
      category,
      title: document.title,
      referrer_host: referrerHost,
      utm_source: params.get("utm_source"),
      tz,
      lang: navigator.language || null,
      device,
      os,
      browser,
      screen_w: Math.round(window.screen?.width || window.innerWidth || 0),
      is_new_visitor: isNewVisitor,
      is_new_session: isNewSession,
    },
  });

  // 商品ページの題名は読み込み直後は「商品詳細」のまま。ダッシュボードでは管理IDから items.json の商品名を引いて表示する

  // 滞在時間（画面が見えていた時間）とどこまで読んだか
  let visibleMs = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  let maxScroll = 0;
  function updateScroll() {
    const doc = document.documentElement;
    const total = doc.scrollHeight - window.innerHeight;
    const pct = total > 0 ? Math.round((window.scrollY / total) * 100) : 100;
    if (pct > maxScroll) maxScroll = Math.min(100, Math.max(0, pct));
  }
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("load", updateScroll);

  let lastSent = -1;
  function flush() {
    if (visibleSince !== null) {
      visibleMs += Date.now() - visibleSince;
      visibleSince = null;
    }
    const sec = Math.round(visibleMs / 1000);
    if (sec === lastSent) return;
    lastSent = sec;
    send("track_leave", { p_view_id: viewId, p_duration: sec, p_scroll: maxScroll }, true);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else { visibleSince = Date.now(); touchSession(); }
  });
  window.addEventListener("pagehide", flush);

  // 外部リンク（相場の検索結果・公式ページなど）のクリックと、写真の拡大
  document.addEventListener("click", (e) => {
    touchSession();
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    if (a.matches("[data-photo-index]")) {
      send("track_event", { p: { ...base, name: "photo_open", target: null, item_id: itemId || null } });
      return;
    }
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (!/^https?:$/.test(url.protocol) || url.host === location.host) return;
    send("track_event", {
      p: { ...base, name: "outbound", target: url.hostname, item_id: itemId || null, props: { text: (a.textContent || "").trim().slice(0, 60) } },
    }, true);
  }, true);
})();
