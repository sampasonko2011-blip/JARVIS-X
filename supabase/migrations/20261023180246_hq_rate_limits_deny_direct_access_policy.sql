create policy "No direct client access to rate limit counters"
on public.hq_rate_limits
for all
to public
using (false)
with check (false);