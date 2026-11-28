BEGIN;

ALTER TABLE public.mensagens
ADD CONSTRAINT mensagens_id_conversa_unique
UNIQUE (id, conversa_id);

ALTER TABLE public.projetos_propostas
ADD CONSTRAINT propostas_mensagem_conversa_fkey
FOREIGN KEY (mensagem_id, conversa_id)
REFERENCES public.mensagens (id, conversa_id)
ON DELETE RESTRICT;

ALTER TABLE public.projetos_propostas
ADD CONSTRAINT propostas_resposta_conversa_fkey
FOREIGN KEY (resposta_mensagem_id, conversa_id)
REFERENCES public.mensagens (id, conversa_id)
ON DELETE RESTRICT;

ALTER TABLE public.projetos_propostas
DROP CONSTRAINT projetos_propostas_mensagem_id_fkey,
DROP CONSTRAINT projetos_propostas_resposta_mensagem_id_fkey;

INSERT INTO funilador_meta.schema_migrations
    (versao, arquivo, metodo)
VALUES
    ('0004', '0004_integridade_propostas.sql', 'migration');

COMMIT;