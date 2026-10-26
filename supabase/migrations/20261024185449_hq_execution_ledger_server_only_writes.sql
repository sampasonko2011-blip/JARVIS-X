-- Keep the execution ledger append-only for authenticated clients.
-- Trusted gateway writes use the server-side service role; users retain read-only
-- access to their own rows through the existing RLS SELECT policy.
DROP POLICY IF EXISTS "Users can create their own execution records" ON public.hq_execution_runs;
DROP POLICY IF EXISTS "Users can update their own execution records" ON public.hq_execution_runs;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.hq_execution_runs FROM authenticated;
