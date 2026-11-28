BEGIN;

-- Eventos anteriores à ativação não devem gerar Push retroativo.
ALTER TABLE public.notificacoes
    ADD COLUMN push_processada_em timestamptz DEFAULT now();
ALTER TABLE public.notificacoes
    ALTER COLUMN push_processada_em DROP DEFAULT;
CREATE INDEX idx_notificacoes_push_pendentes
    ON public.notificacoes (criada_em, id)
    WHERE push_processada_em IS NULL;

INSERT INTO funilador_meta.schema_migrations (versao, arquivo, metodo)
VALUES ('0007', '0007_processamento_push.sql', 'migration');
COMMIT;
