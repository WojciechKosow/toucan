-- Toucan schema baseline (Section F).
--
-- This is the exact schema that Hibernate's ddl-auto=update produced for the
-- v0.1 entities (User, UserToken, Animation). It was captured with
--   pg_dump --schema-only --no-owner --no-privileges --no-comments
-- against a live Postgres 16 database, NOT hand-written from the entities.
--
-- Flyway adopts existing databases via baseline-on-migrate (baseline-version=1):
--   * existing DBs are baselined at v1, so this script is NOT re-run against them;
--   * fresh DBs (CI, new installs) run this script to create the schema from scratch.
-- New objects (e.g. render_jobs) arrive in V2 (Section 4) — nothing new is added here.

CREATE TABLE public.animations (
    id uuid NOT NULL,
    created_at timestamp(6) without time zone,
    error_message text,
    generated_code text,
    preview_url character varying(255),
    prompt text NOT NULL,
    spec_json text,
    status character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    updated_at timestamp(6) without time zone,
    user_id uuid NOT NULL,
    CONSTRAINT animations_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'GENERATING'::character varying, 'READY'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT animations_type_check CHECK (((type)::text = ANY ((ARRAY['FLOW'::character varying, 'CODE_BLOCK'::character varying, 'DATA_STRUCTURE'::character varying])::text[])))
);

CREATE TABLE public.user_tokens (
    id uuid NOT NULL,
    created_at timestamp(6) without time zone,
    expires_at timestamp(6) without time zone,
    token_hash character varying(255) NOT NULL,
    type character varying(255),
    used boolean NOT NULL,
    user_id uuid,
    CONSTRAINT user_tokens_type_check CHECK (((type)::text = ANY ((ARRAY['EMAIL_VERIFICATION'::character varying, 'PASSWORD_RESET'::character varying])::text[])))
);

CREATE TABLE public.users (
    id uuid NOT NULL,
    avatar_image character varying(255),
    created_at timestamp(6) without time zone,
    credentials_updated_at timestamp(6) without time zone,
    display_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    enabled boolean NOT NULL,
    failed_login_attempts integer NOT NULL,
    last_generation timestamp(6) without time zone,
    lock_until timestamp(6) without time zone,
    password character varying(255) NOT NULL,
    provider_id character varying(255),
    role character varying(255),
    updated_at timestamp(6) without time zone,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'USER'::character varying])::text[])))
);

ALTER TABLE ONLY public.animations
    ADD CONSTRAINT animations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uk6dotkott2kjsp8vw4d0m25fb7 UNIQUE (email);

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT user_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT fk61iiu6gfevpvo2v3yl76sar7r FOREIGN KEY (user_id) REFERENCES public.users(id);
