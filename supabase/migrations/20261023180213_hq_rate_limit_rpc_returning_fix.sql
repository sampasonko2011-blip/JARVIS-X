
create or replace function public.consume_hq_rate_limit(p_limit_key text)
returns table (
  allowed boolean,
  limit_key text,
  request_limit integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_window_seconds integer;
  v_max_requests integer;
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_limit_key = 'minute' then
    v_window_seconds := 60;
    v_max_requests := 10;
  elsif p_limit_key = 'day' then
    v_window_seconds := 86400;
    v_max_requests := 100;
  else
    raise exception 'invalid_limit_key' using errcode = '22023';
  end if;

  insert into public.hq_rate_limits as current_limit
    (user_id, limit_key, window_started_at, request_count, updated_at)
  values
    (v_user_id, p_limit_key, v_now, 1, v_now)
  on conflict (user_id, limit_key) do update
  set
    window_started_at = case
      when current_limit.window_started_at <= v_now - (v_window_seconds * interval '1 second')
      then v_now
      else current_limit.window_started_at
    end,
    request_count = case
      when current_limit.window_started_at <= v_now - (v_window_seconds * interval '1 second')
      then 1
      else current_limit.request_count + 1
    end,
    updated_at = v_now
  returning current_limit.window_started_at, current_limit.request_count
  into v_window_started_at, v_request_count;

  return query select
    (v_request_count <= v_max_requests),
    p_limit_key,
    v_max_requests,
    greatest(0, v_max_requests - v_request_count),
    v_window_started_at + (v_window_seconds * interval '1 second');
end;
$$;

revoke all on function public.consume_hq_rate_limit(text) from public, anon;
grant execute on function public.consume_hq_rate_limit(text) to authenticated;
