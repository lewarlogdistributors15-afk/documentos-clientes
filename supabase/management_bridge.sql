CREATE TABLE public.management_bridge (id text PRIMARY KEY CHECK(id='lewar'), writer_hash text NOT NULL CHECK(writer_hash ~ '^[0-9a-f]{64}$'), revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), snapshot jsonb, readers jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.management_bridge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_bridge FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.management_bridge TO service_role;
COMMENT ON TABLE public.management_bridge IS 'Private read-only aging mirror. Edge Function authenticates individual access keys;
no direct browser Data API access.';
