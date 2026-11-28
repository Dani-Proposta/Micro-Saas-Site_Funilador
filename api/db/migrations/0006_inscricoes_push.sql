BEGIN;

-- Inscricoes Web Push por sessao autenticada do Better Auth.
-- A conta destinataria e derivada de public.session."userId".
CREATE TABLE public.inscricoes_push (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id text NOT NULL REFERENCES public.session(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    criada_em timestamptz NOT NULL DEFAULT now(),
    atualizada_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inscricoes_push_endpoint_check CHECK (
        endpoint LIKE 'https://%' AND char_length(endpoint) <= 2048
    ),
    CONSTRAINT inscricoes_push_p256dh_check CHECK (
        char_length(p256dh) = 87 AND p256dh ~ '^[A-Za-z0-9_-]+$'
    ),
    CONSTRAINT inscricoes_push_auth_check CHECK (
        char_length(auth) = 22 AND auth ~ '^[A-Za-z0-9_-]+$'
    )
);

CREATE INDEX idx_inscricoes_push_sessao
    ON public.inscricoes_push (sessao_id);

REVOKE ALL ON public.inscricoes_push FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inscricoes_push
    TO funilador_runtime;

INSERT INTO funilador_meta.schema_migrations
    (versao, arquivo, metodo)
VALUES
    ('0006', '0006_inscricoes_push.sql', 'migration');

COMMIT;
