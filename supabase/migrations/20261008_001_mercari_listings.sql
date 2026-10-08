-- メルカリの出品の半自動取り込み（2026-10-08 オーナー指示）。Supabase プロジェクト dragon-ball に適用済み。
-- オーナーが自分のブラウザでメルカリの「販売中」の検索結果を開き、ブックマークレットで画面上の出品を読み取って、
-- 管理ページ（dashboard.html、パスワード付き）から保存する。説明は docs/listings.md。
-- - 保存（mercari_import）はダッシュボードにログインした鍵が必要。読み出し（mercari_listings）は誰でもできる。
-- - 同じ検索語で前回取り込んだのに今回の画面に無かった出品は「売れた・終わった」とみなして active=false にする（消さない）。
-- - 最後の取り込みから30日たった出品は表示しない。

create table public.mercari_listings (
  id text primary key,                 -- メルカリの商品ID（m123…）、メルカリShops は shops_…
  site_id text not null references public.sites (id),
  title text not null,
  price int not null,
  url text not null,
  keyword text,                        -- 取り込んだときの検索語
  active boolean not null default true,
  first_seen timestamptz not null default now(),
  captured_at timestamptz not null default now()
);
create index mercari_listings_site on public.mercari_listings (site_id, active, captured_at);
alter table public.mercari_listings enable row level security;
revoke all on public.mercari_listings from anon, authenticated;

create or replace function public.mercari_import(p_token text, p_keyword text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_site text := public._dashboard_site(p_token);
  v_kw text := public._clip(p_keyword, 200);
  v_start timestamptz := clock_timestamp();
  v_saved int;
  v_off int := 0;
begin
  if v_site is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 500 then
    return jsonb_build_object('ok', false, 'error', 'bad_rows');
  end if;
  with r as (
    select public._clip(x ->> 'id', 40) as id, public._clip(x ->> 'title', 200) as title,
           (x ->> 'price')::int as price
      from jsonb_array_elements(p_rows) x
  ), v as (
    select distinct on (id) * from r where id ~ '^(m\d+|shops_[A-Za-z0-9]+)$' and title is not null and price between 1 and 100000000
  ), up as (
    insert into public.mercari_listings (id, site_id, title, price, url, keyword, active, captured_at)
    select id, v_site, title, price,
           case when id like 'shops_%' then 'https://jp.mercari.com/shops/product/' || substr(id, 7) else 'https://jp.mercari.com/item/' || id end,
           v_kw, true, v_start
      from v
    on conflict (id) do update set title = excluded.title, price = excluded.price, keyword = excluded.keyword, active = true, captured_at = excluded.captured_at
    returning 1
  )
  select count(*) into v_saved from up;
  -- 同じ検索語で前回取り込んだのに、今回の画面に無かった出品は「売れた・終わった」とみなして表示しない
  if v_kw is not null then
    update public.mercari_listings m set active = false
     where m.site_id = v_site and m.keyword = v_kw and m.active and m.captured_at < v_start;
    get diagnostics v_off = row_count;
  end if;
  return jsonb_build_object('ok', true, 'saved', v_saved, 'inactivated', v_off);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'error', 'bad_rows');
end $$;

create or replace function public.mercari_listings(p_site text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'listings', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'price', price, 'url', url, 'keyword', keyword, 'capturedAt', captured_at, 'firstSeen', first_seen
    ) order by price), '[]'))
    from public.mercari_listings
   where site_id = p_site and active and captured_at > now() - interval '30 days'
$$;

revoke all on function public.mercari_import(text, text, jsonb), public.mercari_listings(text) from public, anon, authenticated;
grant execute on function public.mercari_import(text, text, jsonb), public.mercari_listings(text) to anon, authenticated;
