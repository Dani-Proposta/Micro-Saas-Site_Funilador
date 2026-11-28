BEGIN;

ALTER TABLE public.solicitacoes
ADD CONSTRAINT solicitacoes_id_cliente_unique
UNIQUE (id, cliente_id);

ALTER TABLE public.projetos
ADD CONSTRAINT projetos_solicitacao_cliente_fkey
FOREIGN KEY (solicitacao_id, cliente_id)
REFERENCES public.solicitacoes (id, cliente_id);

ALTER TABLE public.projetos
DROP CONSTRAINT projetos_solicitacao_id_fkey;

INSERT INTO funilador_meta.schema_migrations
    (versao, arquivo, metodo)
VALUES
    ('0003', '0003_integridade_projeto_solicitacao.sql', 'migration');

COMMIT;