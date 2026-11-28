BEGIN;

GRANT CONNECT ON DATABASE neondb
TO funilador_runtime;

GRANT USAGE ON SCHEMA public
TO funilador_runtime;

-- Autenticacao
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public."user",
    public.account,
    public.session,
    public.verification
TO funilador_runtime;

-- Registros operacionais
GRANT SELECT, INSERT, UPDATE ON
    public.clientes,
    public.projetos,
    public.solicitacoes,
    public.conversas,
    public.conversas_reaberturas,
    public.projetos_propostas,
    public.marcos_pagamentos,
    public.notificacoes,
    public.notificacoes_leituras,
    public.usuarios_configuracoes,
    public.usuarios_recuperacoes
TO funilador_runtime;

-- Registros com exclusao prevista
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.convites,
    public.projetos_marcos,
    public.conversas_ocultas
TO funilador_runtime;

-- Visibilidade de marcos
GRANT SELECT, INSERT, DELETE ON
    public.marcos_ocultos
TO funilador_runtime;

-- Historicos preservados
GRANT SELECT, INSERT ON
    public.mensagens,
    public.mensagens_leituras,
    public.marcos_validacoes,
    public.solicitacoes_decisoes
TO funilador_runtime;

-- Views
GRANT SELECT ON
    public.funilador_marcos_resumo,
    public.funilador_propostas_publicas
TO funilador_runtime;

-- Funcoes
GRANT EXECUTE ON FUNCTION
    public.funilador_progresso_projeto(uuid, text, integer),
    public.funilador_grupo_notificacao(text, uuid, uuid, text, uuid)
TO funilador_runtime;

COMMIT;