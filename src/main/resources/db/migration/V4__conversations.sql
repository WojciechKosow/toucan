-- Sessions / chat (iterative editing): a Conversation owns ordered Versions.
--
-- Additive, taken verbatim from what ddl-auto=update generates for the new
-- Conversation entity + the two new Animation columns, so Hibernate validate
-- passes. The single-shot animations path is untouched (both columns are null
-- for those rows). The SceneSpec/Remotion columns from V2/V3 are untouched.

CREATE TABLE public.conversations (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255),
    current_version integer,
    preview_url character varying(255),
    created_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone
);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

-- animations doubles as the version table: a row with conversation_id set is a turn.
ALTER TABLE public.animations ADD COLUMN conversation_id uuid;
ALTER TABLE public.animations ADD COLUMN version_number integer;

ALTER TABLE ONLY public.animations
    ADD CONSTRAINT animations_conversation_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);

CREATE INDEX animations_conversation_idx ON public.animations (conversation_id);
