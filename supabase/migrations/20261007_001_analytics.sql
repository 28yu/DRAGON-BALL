-- アクセス解析（DRAGON BALL COLLECTION）
-- Supabase プロジェクト「dragon-ball」（ref: ebyifkbzxbqstggfqqrt、東京）に適用済み。
-- 説明は docs/analytics.md。
--
-- 考え方
-- - 表はすべて RLS（行ごとの読み書き制限）を有効にし、ポリシーを作らない＝サイトの閲覧者は表を直接読めも書けもしない。
-- - 閲覧者が使えるのは、下の「窓口の関数」だけ（記録する track_*、パスワードで入る dashboard_login、集計を返す dashboard_data）。
-- - IPアドレスは保存しない。国は通信経路の国情報（あれば）か、端末のタイムゾーンから判定する。
-- - 将来、ほかの人もアカウントを作って使えるように、すべての記録に site_id（どのサイトの記録か）を付ける。

create extension if not exists pgcrypto with schema extensions;

-- ---------- 表 ----------

-- サイト（今は dragon-ball の1件だけ。将来、利用者ごとのサイト・ページが増えたら行を足す）
create table public.sites (
  id text primary key,
  name text not null,
  dashboard_password_hash text not null,      -- ダッシュボードのパスワード（bcrypt で暗号化して保存。元の文字は残らない）
  owner_user_id uuid references auth.users (id) on delete set null,  -- 将来のアカウント機能用（今は空）
  created_at timestamptz not null default now()
);

-- ページの表示1回ごとの記録
create table public.page_views (
  id uuid primary key,                         -- 表示ごとの番号（閲覧者の端末で作る。滞在時間の追記に使う）
  site_id text not null references public.sites (id),
  ts timestamptz not null default now(),
  path text not null,                          -- 例：/DRAGON-BALL/item.html
  page_type text,                              -- top / item / dashboard など
  item_id text,                                -- 商品ページの管理ID（例：FC-001）
  category text,                               -- 商品のカテゴリー（book / famicom など）
  title text,                                  -- ページの題名（表示した時点のもの）
  referrer_host text,                          -- どこから来たか（ドメインだけ。例：www.google.com）
  utm_source text,                             -- 広告・SNS用の目印（?utm_source=…）
  country text,                                -- 国コード（JP など）
  country_source text,                         -- 国の判定方法（edge＝通信経路 / timezone＝端末の時刻設定）
  timezone text,
  lang text,                                   -- 端末の言語（ja-JP など）
  device text,                                 -- mobile / tablet / desktop
  os text,
  browser text,
  screen_w int,
  visitor_id uuid,                             -- 端末ごとの番号（ランダム。個人は特定しない）
  session_id uuid,                             -- 訪問ごとの番号（30分操作がないと新しい訪問）
  is_new_visitor boolean,
  is_new_session boolean,
  duration_sec int,                            -- 滞在時間（ページを離れたときに追記）
  max_scroll int                               -- どこまで読んだか（％）
);
create index page_views_site_ts on public.page_views (site_id, ts);
create index page_views_site_item on public.page_views (site_id, item_id);

-- ページ内の操作（外部リンクのクリック・写真の拡大など）。将来の機能の利用状況もここに記録する
create table public.events (
  id bigint generated always as identity primary key,
  site_id text not null references public.sites (id),
  ts timestamptz not null default now(),
  view_id uuid,
  visitor_id uuid,
  session_id uuid,
  name text not null,                          -- 例：outbound（外部リンク）/ lightbox（写真の拡大）
  target text,                                 -- 例：auctions.yahoo.co.jp
  item_id text,
  props jsonb
);
create index events_site_ts on public.events (site_id, ts);

-- タイムゾーン → 国コード
create table public.tz_country (
  timezone text primary key,
  country text not null
);

-- ダッシュボードのログイン状態（合言葉そのものではなく、ランダムな鍵の暗号化した値を保存）
create table public.dashboard_sessions (
  token_hash text primary key,
  site_id text not null references public.sites (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- パスワードの試行記録（間違いが続いたら一時ロックするため。直近15分だけを見る）
create table public.login_attempts (
  id bigint generated always as identity primary key,
  site_id text not null,
  ts timestamptz not null default now(),
  client_key text,                             -- 接続元を区別する暗号化した値（IPアドレスそのものは残さない）
  ok boolean not null
);
create index login_attempts_ts on public.login_attempts (site_id, ts);

alter table public.sites enable row level security;
alter table public.page_views enable row level security;
alter table public.events enable row level security;
alter table public.tz_country enable row level security;
alter table public.dashboard_sessions enable row level security;
alter table public.login_attempts enable row level security;

revoke all on public.sites, public.page_views, public.events, public.tz_country,
  public.dashboard_sessions, public.login_attempts from anon, authenticated;

-- ---------- 内部で使う関数 ----------

-- 文字を指定の長さで切る（長すぎる値や空文字を入れないため）
create or replace function public._clip(v text, n int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(v), n), '')
$$;

-- 通信の見出し（request.headers）から1つ取り出す
create or replace function public._header(name text) returns text
language sql stable set search_path = '' as $$
  select (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb) ->> name
$$;

-- 接続元を区別する値（IPアドレスを日付つきで暗号化。元のIPには戻せない）
create or replace function public._client_key() returns text
language sql stable set search_path = '' as $$
  select encode(extensions.digest(
    coalesce(split_part(public._header('x-forwarded-for'), ',', 1), public._header('x-real-ip'), 'unknown')
      || '|' || current_date::text, 'sha256'), 'hex')
$$;

-- ---------- 記録の窓口（サイトの閲覧者が呼ぶ） ----------

create or replace function public.track_view(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_site text := public._clip(p ->> 'site', 40);
  v_tz text := public._clip(p ->> 'tz', 64);
  v_edge text := upper(public._clip(public._header('cf-ipcountry'), 2));
  v_country text;
  v_source text;
begin
  if v_site is null or not exists (select 1 from public.sites where id = v_site) then
    return;
  end if;
  if v_edge ~ '^[A-Z]{2}$' and v_edge not in ('XX', 'T1') then
    v_country := v_edge; v_source := 'edge';
  else
    select country into v_country from public.tz_country where timezone = v_tz;
    if v_country is not null then v_source := 'timezone'; end if;
  end if;

  insert into public.page_views (
    id, site_id, path, page_type, item_id, category, title, referrer_host, utm_source,
    country, country_source, timezone, lang, device, os, browser, screen_w,
    visitor_id, session_id, is_new_visitor, is_new_session
  ) values (
    (p ->> 'view_id')::uuid, v_site,
    coalesce(public._clip(p ->> 'path', 300), '/'),
    public._clip(p ->> 'page_type', 30),
    public._clip(p ->> 'item_id', 40),
    public._clip(p ->> 'category', 40),
    public._clip(p ->> 'title', 200),
    lower(public._clip(p ->> 'referrer_host', 200)),
    public._clip(p ->> 'utm_source', 100),
    v_country, v_source, v_tz,
    public._clip(p ->> 'lang', 20),
    public._clip(p ->> 'device', 20),
    public._clip(p ->> 'os', 30),
    public._clip(p ->> 'browser', 30),
    least(greatest((p ->> 'screen_w')::int, 0), 20000),
    (p ->> 'visitor_id')::uuid,
    (p ->> 'session_id')::uuid,
    coalesce((p ->> 'is_new_visitor')::boolean, false),
    coalesce((p ->> 'is_new_session')::boolean, false)
  ) on conflict (id) do nothing;
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
  return;  -- 形のおかしい値は記録しない
end $$;

-- ページを離れたときに、滞在時間とどこまで読んだかを追記する（表示から1日以内のものだけ）
create or replace function public.track_leave(p_view_id uuid, p_duration int, p_scroll int) returns void
language sql security definer set search_path = '' as $$
  update public.page_views
     set duration_sec = greatest(coalesce(duration_sec, 0), least(greatest(p_duration, 0), 4 * 3600)),
         max_scroll = greatest(coalesce(max_scroll, 0), least(greatest(p_scroll, 0), 100))
   where id = p_view_id and ts > now() - interval '1 day'
$$;

create or replace function public.track_event(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_site text := public._clip(p ->> 'site', 40);
begin
  if v_site is null or not exists (select 1 from public.sites where id = v_site) then
    return;
  end if;
  insert into public.events (site_id, view_id, visitor_id, session_id, name, target, item_id, props)
  values (
    v_site,
    (p ->> 'view_id')::uuid,
    (p ->> 'visitor_id')::uuid,
    (p ->> 'session_id')::uuid,
    coalesce(public._clip(p ->> 'name', 40), 'unknown'),
    public._clip(p ->> 'target', 300),
    public._clip(p ->> 'item_id', 40),
    case when jsonb_typeof(p -> 'props') = 'object' and length((p -> 'props')::text) <= 2000 then p -> 'props' end
  );
exception when invalid_text_representation then
  return;
end $$;

-- ---------- ダッシュボードの窓口 ----------

-- パスワードを確かめ、合っていればログイン用の鍵（12時間有効）を返す。
-- 同じ接続元で15分に5回、全体で15分に30回間違えると、しばらく受け付けない。
-- （古い試行記録・期限切れの鍵は、判定で無視されるので消さずに残す。件数はごくわずか）
create or replace function public.dashboard_login(p_site text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := public._client_key();
  v_hash text;
  v_fail_mine int;
  v_fail_all int;
  v_token text;
begin
  select count(*) filter (where client_key = v_key), count(*)
    into v_fail_mine, v_fail_all
    from public.login_attempts
   where site_id = p_site and not ok and ts > now() - interval '15 minutes';
  if v_fail_mine >= 5 or v_fail_all >= 30 then
    return jsonb_build_object('ok', false, 'locked', true);
  end if;

  select dashboard_password_hash into v_hash from public.sites where id = p_site;
  if v_hash is null or extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into public.login_attempts (site_id, client_key, ok) values (coalesce(p_site, ''), v_key, false);
    return jsonb_build_object('ok', false, 'locked', false);
  end if;

  insert into public.login_attempts (site_id, client_key, ok) values (p_site, v_key, true);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.dashboard_sessions (token_hash, site_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_site, now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

create or replace function public._dashboard_site(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select site_id from public.dashboard_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and expires_at > now()
$$;

create or replace function public.dashboard_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.dashboard_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- パスワードの変更（ログイン中のみ。4文字以上）
create or replace function public.dashboard_change_password(p_token text, p_new text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_site text := public._dashboard_site(p_token);
begin
  if v_site is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if length(coalesce(p_new, '')) < 4 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  update public.sites set dashboard_password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = v_site;
  return jsonb_build_object('ok', true);
end $$;

-- 集計結果をまとめて返す。
-- p_from / p_to は日本時間などの「日付」（p_from の0時から p_to の0時の手前まで）。p_bucket は day / week / month / year。
create or replace function public.dashboard_data(
  p_token text, p_from date, p_to date, p_bucket text, p_tz text default 'Asia/Tokyo'
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site text := public._dashboard_site(p_token);
  v_tz text := coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz), 'Asia/Tokyo');
  v_bucket text := case when p_bucket in ('day', 'week', 'month', 'year') then p_bucket else 'day' end;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start timestamptz;
  v_step interval := case v_bucket when 'day' then interval '1 day' when 'week' then interval '1 week'
                                   when 'month' then interval '1 month' else interval '1 year' end;
  v_result jsonb;
begin
  if v_site is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 3700 then
    return jsonb_build_object('ok', false, 'error', 'bad_range');
  end if;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := p_to::timestamp at time zone v_tz;
  v_prev_start := (p_from - (p_to - p_from))::timestamp at time zone v_tz;

  with v as (
    select pv.*, (pv.ts at time zone v_tz) as lt
      from public.page_views pv
     where pv.site_id = v_site and pv.ts >= v_start and pv.ts < v_end
  ),
  prev as (
    select * from public.page_views pv
     where pv.site_id = v_site and pv.ts >= v_prev_start and pv.ts < v_start
  ),
  sess as (
    select session_id, count(*) as n from v where session_id is not null group by session_id
  ),
  buckets as (
    select gs as b
      from generate_series(date_trunc(v_bucket, p_from::timestamp), (p_to - 1)::timestamp, v_step) gs
  ),
  series as (
    select b.b, count(v.id) as views, count(distinct v.visitor_id) as visitors
      from buckets b
      left join v on date_trunc(v_bucket, v.lt) = b.b
     group by b.b
  ),
  ev as (
    select e.* from public.events e
     where e.site_id = v_site and e.ts >= v_start and e.ts < v_end
  )
  select jsonb_build_object(
    'ok', true,
    'site', v_site,
    'tz', v_tz,
    'from', p_from, 'to', p_to, 'bucket', v_bucket,
    'first_view', (select min(ts) from public.page_views where site_id = v_site),
    'summary', (select jsonb_build_object(
        'views', count(*),
        'visitors', count(distinct visitor_id),
        'sessions', count(distinct session_id),
        'new_visitors', count(distinct visitor_id) filter (where is_new_visitor),
        'avg_duration', round(avg(duration_sec) filter (where duration_sec > 0)),
        'bounce_rate', (select round(100.0 * count(*) filter (where n = 1) / nullif(count(*), 0)) from sess)
      ) from v),
    'prev', (select jsonb_build_object(
        'views', count(*),
        'visitors', count(distinct visitor_id),
        'sessions', count(distinct session_id),
        'avg_duration', round(avg(duration_sec) filter (where duration_sec > 0))
      ) from prev),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('t', to_char(b, 'YYYY-MM-DD'), 'views', views, 'visitors', visitors) order by b), '[]') from series),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'views', n) order by h), '[]') from (
        select gs as h, (select count(*) from v where extract(hour from v.lt) = gs) as n from generate_series(0, 23) gs) x),
    'weekday_hour', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'h', h, 'views', n)), '[]') from (
        select extract(isodow from lt)::int as d, extract(hour from lt)::int as h, count(*) as n from v group by 1, 2) x),
    'countries', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(country, '??') as country, count(*) as views, count(distinct visitor_id) as visitors
          from v group by 1 order by 2 desc limit 30) x),
    'pages', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(page_type, 'other') as page_type, item_id,
               (array_agg(title order by ts desc))[1] as title,
               count(*) as views, count(distinct visitor_id) as visitors,
               round(avg(duration_sec) filter (where duration_sec > 0)) as avg_duration,
               round(avg(max_scroll) filter (where max_scroll is not null)) as avg_scroll
          from v group by 1, 2 order by count(*) desc limit 50) x),
    'categories', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select category, count(*) as views from v where category is not null group by 1) x),
    'referrers', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(referrer_host, '(direct)') as host, count(*) as views
          from v where is_new_session group by 1 order by 2 desc limit 20) x),
    'devices', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(device, 'unknown') as name, count(*) as views from v group by 1) x),
    'browsers', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(browser, 'unknown') as name, count(*) as views from v group by 1 order by 2 desc limit 10) x),
    'os', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(os, 'unknown') as name, count(*) as views from v group by 1 order by 2 desc limit 10) x),
    'langs', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select coalesce(split_part(lang, '-', 1), 'unknown') as name, count(*) as views from v group by 1 order by 2 desc limit 10) x),
    'events', (select coalesce(jsonb_agg(x order by x.count desc), '[]') from (
        select name, target, count(*) as count from ev group by 1, 2 order by 3 desc limit 30) x)
  ) into v_result;
  return v_result;
end $$;

-- 窓口の関数だけを閲覧者に開放する（内部用の _ で始まる関数は開放しない）
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.track_view(jsonb), public.track_leave(uuid, int, int), public.track_event(jsonb),
  public.dashboard_login(text, text), public.dashboard_logout(text), public.dashboard_change_password(text, text),
  public.dashboard_data(text, date, date, text, text)
  to anon, authenticated;

-- サイトの登録（パスワードは「28」。変更はダッシュボードの「パスワードの変更」から）
insert into public.sites (id, name, dashboard_password_hash)
values ('dragon-ball', 'DRAGON BALL COLLECTION', extensions.crypt('28', extensions.gen_salt('bf', 10)))
on conflict (id) do nothing;

-- タイムゾーンと国の対応表は 20261007_002_tz_country.sql
