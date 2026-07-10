-- HTML engine wiring: persist the engine's per-generation usage/cost telemetry.
--
-- Additive column, taken verbatim from what ddl-auto=update generates for the
-- Animation.engineUsageJson field (text), so Hibernate validate passes against it.
-- Billing-prep only (attribute cost to an author); the SceneSpec/Remotion columns
-- from V2 are untouched.

ALTER TABLE public.animations ADD COLUMN engine_usage_json text;
