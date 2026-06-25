-- Section 4: orchestration spine — async render jobs + MP4 storage on animations.
--
-- Authored as the delta from V1, with the render_jobs DDL and the new animations
-- columns taken verbatim from what ddl-auto=update generates for the updated
-- entities (RenderJob, Animation), so Hibernate validate passes against it.

-- animations: drop the user-facing type (locked decision 2 — create takes a prompt
-- only; topic class survives only as an internal director hint), add the MP4 fields.
-- Dropping the column also drops its dependent animations_type_check constraint.
ALTER TABLE public.animations DROP COLUMN type;
ALTER TABLE public.animations ADD COLUMN mp4_url character varying(255);
ALTER TABLE public.animations ADD COLUMN poster_url character varying(255);
ALTER TABLE public.animations ADD COLUMN duration_ms bigint;

-- render_jobs: the source of truth for render progress (locked decision 3 — no broker).
CREATE TABLE public.render_jobs (
    id uuid NOT NULL,
    animation_id uuid NOT NULL,
    attempts integer NOT NULL,
    created_at timestamp(6) without time zone,
    error text,
    status character varying(255) NOT NULL,
    updated_at timestamp(6) without time zone,
    CONSTRAINT render_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'GENERATING'::character varying, 'READY'::character varying, 'FAILED'::character varying])::text[])))
);

ALTER TABLE ONLY public.render_jobs
    ADD CONSTRAINT render_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.render_jobs
    ADD CONSTRAINT render_jobs_animation_fk FOREIGN KEY (animation_id) REFERENCES public.animations(id);

CREATE INDEX render_jobs_animation_idx ON public.render_jobs (animation_id);
