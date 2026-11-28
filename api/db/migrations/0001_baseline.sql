--
-- PostgreSQL database dump
--

\restrict mY6ubgiUI7nc6omjsPOJtkQ9YqAGYAkYqL5cGB0zvPYShAqyGnfNfAsJVbFm7sV

-- Dumped from database version 18.7 (3190d2f)
-- Dumped by pg_dump version 18.7

-- Started on 2026-11-28 06:00:12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 244 (class 1255 OID 114688)
-- Name: criar_conversa_geral(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_conversa_geral() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO conversas (cliente_id, titulo, tipo)
    VALUES (NEW.id, 'Geral', 'geral')
    ON CONFLICT (cliente_id) WHERE tipo = 'geral'
    DO NOTHING;

    RETURN NEW;
END;
$$;


--
-- TOC entry 251 (class 1255 OID 147487)
-- Name: funilador_grupo_notificacao(text, uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_grupo_notificacao(tipo text, referencia uuid, evento uuid, titulo text, cliente uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE
        WHEN tipo = 'mensagem' THEN 'm:' || cliente::text || ':' || referencia::text || CASE WHEN titulo LIKE 'Negociação · %' THEN ':' || titulo ELSE '' END
        WHEN tipo = 'projeto' THEN 'p:' || cliente::text || ':' || referencia::text || ':' || CASE
            WHEN titulo IN ('Marco atualizado', 'Status do marco atualizado') THEN 'marco_atualizado'
            WHEN titulo LIKE 'Projeto atualizado:%' THEN 'status_projeto'
            ELSE titulo END
        ELSE 'e:' || evento::text
    END;
$$;


--
-- TOC entry 247 (class 1255 OID 131190)
-- Name: funilador_notificar_arquivo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_arquivo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.arquivada_em IS NOT NULL AND OLD.arquivada_em IS NULL THEN
        INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo)
        VALUES ('cliente', NEW.cliente_id, 'conversa', NEW.id, 'Conversa arquivada', left(NEW.titulo, 180));
    END IF;
    RETURN NEW;
END; $$;


--
-- TOC entry 263 (class 1255 OID 147462)
-- Name: funilador_notificar_dados_projeto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_dados_projeto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE campos TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF NEW.titulo IS DISTINCT FROM OLD.titulo THEN campos := array_append(campos, 'Título'); END IF;
    IF NEW.descricao IS DISTINCT FROM OLD.descricao THEN campos := array_append(campos, 'Descrição'); END IF;
    IF NEW.valor_acordado IS DISTINCT FROM OLD.valor_acordado THEN campos := array_append(campos, 'Valor acordado'); END IF;
    IF NEW.prazo_acordado IS DISTINCT FROM OLD.prazo_acordado THEN campos := array_append(campos, 'Prazo acordado'); END IF;
    IF NEW.tecnologias IS DISTINCT FROM OLD.tecnologias THEN campos := array_append(campos, 'Tecnologias'); END IF;
    IF NEW.modo_progresso IS DISTINCT FROM OLD.modo_progresso OR
       (NEW.modo_progresso = 'manual' AND NEW.progresso IS DISTINCT FROM OLD.progresso) THEN campos := array_append(campos, 'Progresso'); END IF;
    IF cardinality(campos) > 0 THEN
        INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo)
        VALUES ('cliente', NEW.cliente_id, 'projeto', NEW.id, 'Dados do projeto atualizados', left(NEW.titulo || ' · ' || array_to_string(campos, ', '), 180));
    END IF;
    RETURN NEW;
END; $$;


--
-- TOC entry 265 (class 1255 OID 147464)
-- Name: funilador_notificar_marco(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_marco() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE evento TEXT; projeto UUID; nome TEXT; marco UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        evento := 'Marco excluído'; projeto := OLD.projeto_id; nome := OLD.titulo; marco := NULL;
    ELSE
        projeto := NEW.projeto_id; nome := NEW.titulo; marco := NEW.id;
        IF TG_OP = 'INSERT' THEN evento := 'Novo marco';
        ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
            evento := CASE NEW.status WHEN 'concluido' THEN 'Marco concluído' WHEN 'cancelado' THEN 'Marco cancelado' WHEN 'aguardando_validacao' THEN 'Marco aguardando validação' ELSE 'Status do marco atualizado' END;
        ELSIF ROW(NEW.titulo, NEW.descricao, NEW.valor, NEW.prazo_entrega, NEW.vencimento, NEW.cobranca_iniciada, NEW.bloqueia_progresso, NEW.saldo_dispensado)
              IS DISTINCT FROM ROW(OLD.titulo, OLD.descricao, OLD.valor, OLD.prazo_entrega, OLD.vencimento, OLD.cobranca_iniciada, OLD.bloqueia_progresso, OLD.saldo_dispensado) THEN
            evento := CASE WHEN NEW.saldo_dispensado AND NOT OLD.saldo_dispensado THEN 'Saldo do marco dispensado' WHEN NEW.cobranca_iniciada AND NOT OLD.cobranca_iniciada THEN 'Marco aguardando pagamento' ELSE 'Marco atualizado' END;
        ELSE RETURN NEW;
        END IF;
    END IF;
    INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo, marco_id)
    SELECT 'cliente', p.cliente_id, 'projeto', p.id, evento, left(p.titulo || ' · ' || nome, 180), marco FROM projetos p WHERE p.id = projeto;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;


--
-- TOC entry 249 (class 1255 OID 131184)
-- Name: funilador_notificar_mensagem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_mensagem() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo, mensagem_id)
    SELECT CASE WHEN NEW.remetente_tipo = 'admin' THEN 'cliente' ELSE 'admin' END,
        c.cliente_id, 'mensagem', c.id,
        CASE WHEN NEW.remetente_tipo = 'cliente' THEN cl.nome || ' · ' || c.titulo ELSE 'Administração · ' || c.titulo END,
        left(NEW.conteudo, 180), NEW.id
    FROM conversas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = NEW.conversa_id;
    RETURN NEW;
END; $$;


--
-- TOC entry 264 (class 1255 OID 147466)
-- Name: funilador_notificar_pagamento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_pagamento() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE evento TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN evento := 'Pagamento registrado';
    ELSIF NEW.anulado_em IS NOT NULL AND OLD.anulado_em IS NULL THEN evento := 'Recebimento anulado';
    ELSE RETURN NEW;
    END IF;
    INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo)
    SELECT 'cliente', p.cliente_id, 'projeto', p.id, evento,
        left(p.titulo || ' · ' || m.titulo || ' · R$ ' || replace(NEW.valor::text, '.', ','), 180)
    FROM projetos_marcos m JOIN projetos p ON p.id = m.projeto_id WHERE m.id = NEW.marco_id;
    RETURN NEW;
END; $_$;


--
-- TOC entry 246 (class 1255 OID 131188)
-- Name: funilador_notificar_projeto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_projeto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE evento TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN evento := 'Novo projeto';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        evento := 'Projeto atualizado: ' || CASE NEW.status::text WHEN 'planejado' THEN 'Planejado' WHEN 'em_andamento' THEN 'Em andamento' WHEN 'concluido' THEN 'Concluído' WHEN 'cancelado' THEN 'Cancelado' ELSE NEW.status::text END;
    ELSE RETURN NEW;
    END IF;
    INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo)
    VALUES ('cliente', NEW.cliente_id, 'projeto', NEW.id, evento, left(NEW.titulo, 180));
    RETURN NEW;
END; $$;


--
-- TOC entry 248 (class 1255 OID 131192)
-- Name: funilador_notificar_reabertura(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_reabertura() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE destino TEXT; evento TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN destino := 'admin'; evento := 'Pedido de reabertura';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('aprovada', 'recusada') THEN
        destino := 'cliente'; evento := CASE NEW.status::text WHEN 'aprovada' THEN 'Reabertura aprovada' ELSE 'Reabertura recusada' END;
    ELSE RETURN NEW;
    END IF;
    INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo)
    SELECT destino, c.cliente_id, 'reabertura', c.id, evento,
        left(CASE WHEN destino = 'admin' THEN cl.nome || ' · ' ELSE '' END || c.titulo || CASE WHEN destino = 'cliente' AND NEW.justificativa IS NOT NULL THEN ' · ' || NEW.justificativa ELSE '' END, 180)
    FROM conversas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = NEW.conversa_id;
    RETURN NEW;
END; $$;


--
-- TOC entry 245 (class 1255 OID 131186)
-- Name: funilador_notificar_solicitacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_notificar_solicitacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO notificacoes(publico, cliente_id, tipo, referencia_id, titulo, resumo)
        VALUES ('cliente', NEW.cliente_id, 'solicitacao', NEW.id,
            CASE NEW.status::text WHEN 'aprovada' THEN 'Solicitação aprovada' WHEN 'recusada' THEN 'Solicitação recusada' ELSE 'Solicitação reconsiderada' END,
            left(NEW.titulo, 180));
    END IF;
    RETURN NEW;
END; $$;


--
-- TOC entry 250 (class 1255 OID 139339)
-- Name: funilador_progresso_projeto(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funilador_progresso_projeto(projeto uuid, modo text, manual integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT CASE WHEN modo = 'manual' THEN manual ELSE
        COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE m.status = 'concluido') / NULLIF(COUNT(*), 0))::int
                  FROM projetos_marcos m WHERE m.projeto_id = projeto AND m.status <> 'cancelado'), 0) END;
$$;


SET default_table_access_method = heap;

--
-- TOC entry 223 (class 1259 OID 40998)
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- TOC entry 219 (class 1259 OID 24576)
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    email text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id text
);


--
-- TOC entry 228 (class 1259 OID 106498)
-- Name: conversas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    projeto_id uuid,
    titulo text NOT NULL,
    tipo text DEFAULT 'geral'::text NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    arquivada_em timestamp with time zone,
    CONSTRAINT conversa_tipo_check CHECK ((((tipo = 'projeto'::text) AND (projeto_id IS NOT NULL)) OR ((tipo = ANY (ARRAY['geral'::text, 'avulsa'::text])) AND (projeto_id IS NULL)))),
    CONSTRAINT conversas_tipo_check CHECK ((tipo = ANY (ARRAY['geral'::text, 'projeto'::text, 'avulsa'::text])))
);


--
-- TOC entry 231 (class 1259 OID 131107)
-- Name: conversas_ocultas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversas_ocultas (
    conversa_id uuid NOT NULL,
    usuario_id text NOT NULL,
    ocultada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ultima_admin_id uuid
);


--
-- TOC entry 230 (class 1259 OID 131072)
-- Name: conversas_reaberturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversas_reaberturas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversa_id uuid NOT NULL,
    ciclo_arquivamento timestamp with time zone NOT NULL,
    solicitada_por text,
    solicitada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    decidida_por text,
    decidida_em timestamp with time zone,
    justificativa text,
    CONSTRAINT conversas_reaberturas_check CHECK ((((status = 'pendente'::text) AND (decidida_em IS NULL)) OR ((status <> 'pendente'::text) AND (decidida_em IS NOT NULL)))),
    CONSTRAINT conversas_reaberturas_justificativa_check CHECK ((char_length(justificativa) <= 1000)),
    CONSTRAINT conversas_reaberturas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovada'::text, 'recusada'::text])))
);


--
-- TOC entry 226 (class 1259 OID 73728)
-- Name: convites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.convites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    usado_em timestamp with time zone,
    revogado_em timestamp with time zone,
    token text,
    cliente_aceitou_id uuid,
    usado_por_email text,
    CONSTRAINT convite_estado_check CHECK (((usado_em IS NULL) OR (revogado_em IS NULL))),
    CONSTRAINT convite_validade_check CHECK ((expira_em > criado_em))
);


--
-- TOC entry 236 (class 1259 OID 139308)
-- Name: marcos_pagamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcos_pagamentos (
    id uuid NOT NULL,
    marco_id uuid NOT NULL,
    valor numeric(12,2) NOT NULL,
    recebido_em date NOT NULL,
    registrado_em timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id text,
    anulado_em timestamp with time zone,
    anulado_por text,
    CONSTRAINT marcos_pagamentos_valor_check CHECK ((valor > (0)::numeric))
);


--
-- TOC entry 235 (class 1259 OID 139274)
-- Name: projetos_marcos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projetos_marcos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projeto_id uuid NOT NULL,
    titulo text NOT NULL,
    descricao text,
    status text DEFAULT 'pendente'::text NOT NULL,
    valor numeric(12,2),
    prazo_entrega date,
    vencimento date,
    cobranca_iniciada boolean DEFAULT false NOT NULL,
    bloqueia_progresso boolean DEFAULT false NOT NULL,
    saldo_dispensado boolean DEFAULT false NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projetos_marcos_check CHECK (((NOT saldo_dispensado) OR (status = 'cancelado'::text))),
    CONSTRAINT projetos_marcos_descricao_check CHECK ((char_length(descricao) <= 5000)),
    CONSTRAINT projetos_marcos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'aguardando_validacao'::text, 'concluido'::text, 'cancelado'::text]))),
    CONSTRAINT projetos_marcos_titulo_check CHECK (((char_length(btrim(titulo)) >= 1) AND (char_length(btrim(titulo)) <= 150))),
    CONSTRAINT projetos_marcos_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- TOC entry 237 (class 1259 OID 139334)
-- Name: funilador_marcos_resumo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.funilador_marcos_resumo AS
 SELECT m.id,
    m.projeto_id,
    m.titulo,
    m.descricao,
    m.status,
    m.valor,
    m.prazo_entrega,
    m.vencimento,
    m.cobranca_iniciada,
    m.bloqueia_progresso,
    m.saldo_dispensado,
    m.criada_em,
    m.atualizada_em,
    COALESCE(pg.recebido, (0)::numeric) AS recebido,
        CASE
            WHEN (m.valor IS NULL) THEN NULL::numeric
            WHEN m.saldo_dispensado THEN (0)::numeric
            ELSE GREATEST((m.valor - COALESCE(pg.recebido, (0)::numeric)), (0)::numeric)
        END AS saldo,
    COALESCE(pg.pagamentos, '[]'::jsonb) AS pagamentos
   FROM (public.projetos_marcos m
     LEFT JOIN LATERAL ( SELECT sum(p.valor) FILTER (WHERE (p.anulado_em IS NULL)) AS recebido,
            jsonb_agg(jsonb_build_object('id', p.id, 'valor', (p.valor)::text, 'recebidoEm', to_char((p.recebido_em)::timestamp with time zone, 'YYYY-MM-DD'::text), 'anuladoEm', p.anulado_em) ORDER BY p.recebido_em, p.id) AS pagamentos
           FROM public.marcos_pagamentos p
          WHERE (p.marco_id = m.id)) pg ON (true));


--
-- TOC entry 239 (class 1259 OID 147488)
-- Name: projetos_propostas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projetos_propostas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversa_id uuid NOT NULL,
    mensagem_id uuid NOT NULL,
    resposta_mensagem_id uuid,
    anterior_id uuid,
    autor_tipo text NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    descricao text,
    valor numeric(12,2),
    prazo_entrega date,
    vencimento date,
    novo_total numeric(12,2),
    novo_prazo date,
    total_base numeric(12,2),
    prazo_base date,
    status text DEFAULT 'pendente'::text NOT NULL,
    marco_id uuid,
    decidida_em timestamp with time zone,
    decidido_por text,
    criada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT projetos_propostas_autor_tipo_check CHECK ((autor_tipo = ANY (ARRAY['admin'::text, 'cliente'::text]))),
    CONSTRAINT projetos_propostas_check CHECK (((status = 'pendente'::text) = (decidida_em IS NULL))),
    CONSTRAINT projetos_propostas_check1 CHECK (((status = 'pendente'::text) = (resposta_mensagem_id IS NULL))),
    CONSTRAINT projetos_propostas_check2 CHECK (((marco_id IS NOT NULL) = ((status = 'aceita'::text) AND (tipo = 'marco'::text)))),
    CONSTRAINT projetos_propostas_descricao_check CHECK ((char_length(descricao) <= 5000)),
    CONSTRAINT projetos_propostas_novo_total_check CHECK ((novo_total >= (0)::numeric)),
    CONSTRAINT projetos_propostas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aceita'::text, 'recusada'::text, 'contraproposta'::text, 'retirada'::text]))),
    CONSTRAINT projetos_propostas_tipo_check CHECK ((tipo = ANY (ARRAY['marco'::text, 'dados'::text]))),
    CONSTRAINT projetos_propostas_titulo_check CHECK (((char_length(btrim(titulo)) >= 1) AND (char_length(btrim(titulo)) <= 150))),
    CONSTRAINT projetos_propostas_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- TOC entry 241 (class 1259 OID 147580)
-- Name: funilador_propostas_publicas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.funilador_propostas_publicas AS
 SELECT id,
    mensagem_id,
    resposta_mensagem_id,
    conversa_id,
    status,
    jsonb_build_object('id', id, 'tipo', tipo, 'autorTipo', autor_tipo, 'titulo', titulo, 'descricao', descricao, 'valor', (valor)::text, 'prazoEntrega', to_char((prazo_entrega)::timestamp with time zone, 'YYYY-MM-DD'::text), 'vencimento', to_char((vencimento)::timestamp with time zone, 'YYYY-MM-DD'::text), 'novoTotal', (novo_total)::text, 'novoPrazo', to_char((novo_prazo)::timestamp with time zone, 'YYYY-MM-DD'::text), 'totalBase', (total_base)::text, 'prazoBase', to_char((prazo_base)::timestamp with time zone, 'YYYY-MM-DD'::text), 'status', status, 'marcoId', marco_id, 'anteriorId', anterior_id) AS dados
   FROM public.projetos_propostas p;


--
-- TOC entry 238 (class 1259 OID 147468)
-- Name: marcos_ocultos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcos_ocultos (
    marco_id uuid NOT NULL,
    usuario_id text NOT NULL
);


--
-- TOC entry 240 (class 1259 OID 147555)
-- Name: marcos_validacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcos_validacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    marco_id uuid NOT NULL,
    usuario_id text,
    versao text NOT NULL,
    validada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- TOC entry 227 (class 1259 OID 98304)
-- Name: mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    remetente_id text,
    remetente_tipo text NOT NULL,
    conteudo text NOT NULL,
    enviada_em timestamp with time zone DEFAULT now() NOT NULL,
    conversa_id uuid NOT NULL,
    CONSTRAINT mensagens_conteudo_check CHECK (((char_length(btrim(conteudo)) >= 1) AND (char_length(btrim(conteudo)) <= 5000))),
    CONSTRAINT mensagens_remetente_tipo_check CHECK ((remetente_tipo = ANY (ARRAY['admin'::text, 'cliente'::text])))
);


--
-- TOC entry 229 (class 1259 OID 122880)
-- Name: mensagens_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensagens_leituras (
    mensagem_id uuid NOT NULL,
    usuario_id text NOT NULL,
    lida_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 232 (class 1259 OID 131135)
-- Name: notificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    publico text NOT NULL,
    cliente_id uuid NOT NULL,
    tipo text NOT NULL,
    referencia_id uuid NOT NULL,
    titulo text NOT NULL,
    resumo text NOT NULL,
    criada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    mensagem_id uuid,
    marco_id uuid,
    CONSTRAINT notificacoes_publico_check CHECK ((publico = ANY (ARRAY['admin'::text, 'cliente'::text]))),
    CONSTRAINT notificacoes_tipo_check CHECK ((tipo = ANY (ARRAY['mensagem'::text, 'solicitacao'::text, 'projeto'::text, 'conversa'::text, 'reabertura'::text])))
);


--
-- TOC entry 233 (class 1259 OID 131162)
-- Name: notificacoes_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacoes_leituras (
    notificacao_id uuid NOT NULL,
    usuario_id text NOT NULL,
    lida_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ocultada_em timestamp with time zone
);


--
-- TOC entry 225 (class 1259 OID 49152)
-- Name: projetos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projetos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    titulo text NOT NULL,
    descricao text NOT NULL,
    status text DEFAULT 'planejado'::text NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    solicitacao_id uuid,
    arquivada_em timestamp with time zone,
    valor_acordado numeric(12,2),
    prazo_acordado date,
    tecnologias text[] DEFAULT '{}'::text[] NOT NULL,
    prioridade text,
    progresso integer,
    observacoes_internas text,
    modo_progresso text DEFAULT 'manual'::text NOT NULL,
    CONSTRAINT projeto_status_valido CHECK ((status = ANY (ARRAY['planejado'::text, 'em_andamento'::text, 'concluido'::text, 'cancelado'::text]))),
    CONSTRAINT projetos_modo_progresso_check CHECK ((modo_progresso = ANY (ARRAY['manual'::text, 'marcos'::text]))),
    CONSTRAINT projetos_observacoes_internas_check CHECK ((char_length(observacoes_internas) <= 5000)),
    CONSTRAINT projetos_prioridade_check CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'normal'::text, 'alta'::text]))),
    CONSTRAINT projetos_progresso_check CHECK (((progresso >= 0) AND (progresso <= 100))),
    CONSTRAINT projetos_valor_acordado_check CHECK ((valor_acordado >= (0)::numeric))
);


--
-- TOC entry 222 (class 1259 OID 40977)
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL,
    "impersonatedBy" text
);


--
-- TOC entry 220 (class 1259 OID 24598)
-- Name: solicitacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    titulo text NOT NULL,
    descricao text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    orcamento_esperado numeric(12,2),
    prazo_esperado date,
    CONSTRAINT solicitacoes_orcamento_esperado_check CHECK ((orcamento_esperado >= (0)::numeric)),
    CONSTRAINT status_valido CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovada'::text, 'recusada'::text])))
);


--
-- TOC entry 234 (class 1259 OID 131200)
-- Name: solicitacoes_decisoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitacoes_decisoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    solicitacao_id uuid NOT NULL,
    usuario_id text,
    status_anterior text NOT NULL,
    status_novo text NOT NULL,
    criada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT solicitacoes_decisoes_check CHECK ((((status_anterior = 'pendente'::text) AND (status_novo = ANY (ARRAY['aprovada'::text, 'recusada'::text]))) OR ((status_anterior = 'recusada'::text) AND (status_novo = 'pendente'::text))))
);


--
-- TOC entry 221 (class 1259 OID 40960)
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean DEFAULT false,
    "banReason" text,
    "banExpires" timestamp with time zone
);


--
-- TOC entry 242 (class 1259 OID 155654)
-- Name: usuarios_configuracoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_configuracoes (
    usuario_id text NOT NULL,
    nome_alterado_em timestamp with time zone,
    tema text,
    senha_provisoria_ate timestamp with time zone,
    estilo text DEFAULT 'moderno'::text NOT NULL,
    acento text DEFAULT 'grape'::text NOT NULL,
    densidade text DEFAULT 'normal'::text NOT NULL,
    movimento text DEFAULT 'sistema'::text NOT NULL,
    paleta text DEFAULT 'neutra'::text NOT NULL,
    CONSTRAINT usuarios_configuracoes_acento_check CHECK ((acento = ANY (ARRAY['grape'::text, 'violet'::text, 'blue'::text, 'cyan'::text, 'teal'::text, 'orange'::text, 'pink'::text]))),
    CONSTRAINT usuarios_configuracoes_densidade_check CHECK ((densidade = ANY (ARRAY['compacta'::text, 'normal'::text, 'confortavel'::text]))),
    CONSTRAINT usuarios_configuracoes_estilo_check CHECK ((estilo = ANY (ARRAY['minimalista'::text, 'moderno'::text, 'expressivo'::text]))),
    CONSTRAINT usuarios_configuracoes_movimento_check CHECK ((movimento = ANY (ARRAY['sistema'::text, 'reduzido'::text]))),
    CONSTRAINT usuarios_configuracoes_paleta_check CHECK ((paleta = ANY (ARRAY['neutra'::text, 'obsidiana'::text, 'meia-noite'::text, 'ametista'::text, 'floresta'::text]))),
    CONSTRAINT usuarios_configuracoes_tema_check CHECK ((tema = ANY (ARRAY['light'::text, 'dark'::text, 'auto'::text])))
);


--
-- TOC entry 243 (class 1259 OID 155669)
-- Name: usuarios_recuperacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_recuperacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id text NOT NULL,
    administrador_id text,
    tipo text NOT NULL,
    token_hash text,
    criada_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expira_em timestamp with time zone,
    usada_em timestamp with time zone,
    revogada_em timestamp with time zone,
    CONSTRAINT usuarios_recuperacoes_check CHECK (((tipo = 'link'::text) = (token_hash IS NOT NULL))),
    CONSTRAINT usuarios_recuperacoes_check1 CHECK (((tipo = 'sessoes'::text) = (expira_em IS NULL))),
    CONSTRAINT usuarios_recuperacoes_check2 CHECK ((NOT ((usada_em IS NOT NULL) AND (revogada_em IS NOT NULL)))),
    CONSTRAINT usuarios_recuperacoes_tipo_check CHECK ((tipo = ANY (ARRAY['link'::text, 'provisoria'::text, 'sessoes'::text])))
);


--
-- TOC entry 224 (class 1259 OID 41017)
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- TOC entry 3494 (class 2606 OID 41011)
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- TOC entry 3479 (class 2606 OID 24587)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- TOC entry 3481 (class 2606 OID 65537)
-- Name: clientes clientes_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_usuario_id_key UNIQUE (usuario_id);


--
-- TOC entry 3526 (class 2606 OID 131117)
-- Name: conversas_ocultas conversas_ocultas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_ocultas
    ADD CONSTRAINT conversas_ocultas_pkey PRIMARY KEY (conversa_id, usuario_id);


--
-- TOC entry 3514 (class 2606 OID 106514)
-- Name: conversas conversas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_pkey PRIMARY KEY (id);


--
-- TOC entry 3522 (class 2606 OID 131089)
-- Name: conversas_reaberturas conversas_reaberturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_reaberturas
    ADD CONSTRAINT conversas_reaberturas_pkey PRIMARY KEY (id);


--
-- TOC entry 3506 (class 2606 OID 73742)
-- Name: convites convites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convites
    ADD CONSTRAINT convites_pkey PRIMARY KEY (id);


--
-- TOC entry 3508 (class 2606 OID 81921)
-- Name: convites convites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convites
    ADD CONSTRAINT convites_token_key UNIQUE (token);


--
-- TOC entry 3549 (class 2606 OID 147476)
-- Name: marcos_ocultos marcos_ocultos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_ocultos
    ADD CONSTRAINT marcos_ocultos_pkey PRIMARY KEY (marco_id, usuario_id);


--
-- TOC entry 3547 (class 2606 OID 139321)
-- Name: marcos_pagamentos marcos_pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_pagamentos
    ADD CONSTRAINT marcos_pagamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 3562 (class 2606 OID 147569)
-- Name: marcos_validacoes marcos_validacoes_marco_id_versao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_validacoes
    ADD CONSTRAINT marcos_validacoes_marco_id_versao_key UNIQUE (marco_id, versao);


--
-- TOC entry 3564 (class 2606 OID 147567)
-- Name: marcos_validacoes marcos_validacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_validacoes
    ADD CONSTRAINT marcos_validacoes_pkey PRIMARY KEY (id);


--
-- TOC entry 3520 (class 2606 OID 122890)
-- Name: mensagens_leituras mensagens_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_leituras
    ADD CONSTRAINT mensagens_leituras_pkey PRIMARY KEY (mensagem_id, usuario_id);


--
-- TOC entry 3512 (class 2606 OID 98319)
-- Name: mensagens mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_pkey PRIMARY KEY (id);


--
-- TOC entry 3537 (class 2606 OID 131172)
-- Name: notificacoes_leituras notificacoes_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes_leituras
    ADD CONSTRAINT notificacoes_leituras_pkey PRIMARY KEY (notificacao_id, usuario_id);


--
-- TOC entry 3534 (class 2606 OID 131153)
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);


--
-- TOC entry 3500 (class 2606 OID 106497)
-- Name: projetos projetos_id_cliente_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos
    ADD CONSTRAINT projetos_id_cliente_unique UNIQUE (id, cliente_id);


--
-- TOC entry 3543 (class 2606 OID 139301)
-- Name: projetos_marcos projetos_marcos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_marcos
    ADD CONSTRAINT projetos_marcos_pkey PRIMARY KEY (id);


--
-- TOC entry 3502 (class 2606 OID 49170)
-- Name: projetos projetos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos
    ADD CONSTRAINT projetos_pkey PRIMARY KEY (id);


--
-- TOC entry 3552 (class 2606 OID 147521)
-- Name: projetos_propostas projetos_propostas_anterior_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_anterior_id_key UNIQUE (anterior_id);


--
-- TOC entry 3554 (class 2606 OID 147523)
-- Name: projetos_propostas projetos_propostas_marco_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_marco_id_key UNIQUE (marco_id);


--
-- TOC entry 3556 (class 2606 OID 147517)
-- Name: projetos_propostas projetos_propostas_mensagem_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_mensagem_id_key UNIQUE (mensagem_id);


--
-- TOC entry 3558 (class 2606 OID 147515)
-- Name: projetos_propostas projetos_propostas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_pkey PRIMARY KEY (id);


--
-- TOC entry 3560 (class 2606 OID 147519)
-- Name: projetos_propostas projetos_propostas_resposta_mensagem_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_resposta_mensagem_id_key UNIQUE (resposta_mensagem_id);


--
-- TOC entry 3504 (class 2606 OID 49177)
-- Name: projetos projetos_solicitacao_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos
    ADD CONSTRAINT projetos_solicitacao_id_key UNIQUE (solicitacao_id);


--
-- TOC entry 3489 (class 2606 OID 40990)
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- TOC entry 3491 (class 2606 OID 40992)
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- TOC entry 3540 (class 2606 OID 131214)
-- Name: solicitacoes_decisoes solicitacoes_decisoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_decisoes
    ADD CONSTRAINT solicitacoes_decisoes_pkey PRIMARY KEY (id);


--
-- TOC entry 3483 (class 2606 OID 24614)
-- Name: solicitacoes solicitacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes
    ADD CONSTRAINT solicitacoes_pkey PRIMARY KEY (id);


--
-- TOC entry 3485 (class 2606 OID 40976)
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- TOC entry 3487 (class 2606 OID 40974)
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- TOC entry 3566 (class 2606 OID 155662)
-- Name: usuarios_configuracoes usuarios_configuracoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_configuracoes
    ADD CONSTRAINT usuarios_configuracoes_pkey PRIMARY KEY (usuario_id);


--
-- TOC entry 3570 (class 2606 OID 155685)
-- Name: usuarios_recuperacoes usuarios_recuperacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_recuperacoes
    ADD CONSTRAINT usuarios_recuperacoes_pkey PRIMARY KEY (id);


--
-- TOC entry 3573 (class 2606 OID 155687)
-- Name: usuarios_recuperacoes usuarios_recuperacoes_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_recuperacoes
    ADD CONSTRAINT usuarios_recuperacoes_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 3498 (class 2606 OID 41031)
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- TOC entry 3495 (class 1259 OID 41033)
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId");


--
-- TOC entry 3515 (class 1259 OID 106527)
-- Name: idx_conversas_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversas_cliente ON public.conversas USING btree (cliente_id);


--
-- TOC entry 3516 (class 1259 OID 106525)
-- Name: idx_conversas_geral; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversas_geral ON public.conversas USING btree (cliente_id) WHERE (tipo = 'geral'::text);


--
-- TOC entry 3527 (class 1259 OID 131133)
-- Name: idx_conversas_ocultas_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversas_ocultas_usuario ON public.conversas_ocultas USING btree (usuario_id, conversa_id);


--
-- TOC entry 3517 (class 1259 OID 106526)
-- Name: idx_conversas_projeto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conversas_projeto ON public.conversas USING btree (projeto_id) WHERE (tipo = 'projeto'::text);


--
-- TOC entry 3544 (class 1259 OID 139333)
-- Name: idx_marcos_pagamentos_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marcos_pagamentos_data ON public.marcos_pagamentos USING btree (recebido_em);


--
-- TOC entry 3545 (class 1259 OID 139332)
-- Name: idx_marcos_pagamentos_marco; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marcos_pagamentos_marco ON public.marcos_pagamentos USING btree (marco_id, recebido_em);


--
-- TOC entry 3509 (class 1259 OID 106534)
-- Name: idx_mensagens_conversa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_conversa ON public.mensagens USING btree (conversa_id, enviada_em, id);


--
-- TOC entry 3518 (class 1259 OID 122901)
-- Name: idx_mensagens_leituras_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_leituras_usuario ON public.mensagens_leituras USING btree (usuario_id, mensagem_id);


--
-- TOC entry 3510 (class 1259 OID 131134)
-- Name: idx_mensagens_ultimo_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensagens_ultimo_admin ON public.mensagens USING btree (conversa_id, enviada_em DESC, id DESC) WHERE (remetente_tipo = 'admin'::text);


--
-- TOC entry 3528 (class 1259 OID 131160)
-- Name: idx_notificacoes_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_cliente ON public.notificacoes USING btree (cliente_id, publico, criada_em DESC, id DESC);


--
-- TOC entry 3529 (class 1259 OID 131161)
-- Name: idx_notificacoes_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_grupo ON public.notificacoes USING btree (publico, cliente_id, tipo, referencia_id, criada_em DESC, id DESC);


--
-- TOC entry 3535 (class 1259 OID 131183)
-- Name: idx_notificacoes_leituras_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_leituras_usuario ON public.notificacoes_leituras USING btree (usuario_id, notificacao_id);


--
-- TOC entry 3530 (class 1259 OID 155653)
-- Name: idx_notificacoes_lembretes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_lembretes ON public.notificacoes USING btree (marco_id, criada_em DESC) WHERE (titulo = 'Lembrete de pagamento'::text);


--
-- TOC entry 3531 (class 1259 OID 131199)
-- Name: idx_notificacoes_mensagem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_mensagem ON public.notificacoes USING btree (mensagem_id) WHERE (mensagem_id IS NOT NULL);


--
-- TOC entry 3532 (class 1259 OID 131159)
-- Name: idx_notificacoes_publico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_publico ON public.notificacoes USING btree (publico, criada_em DESC, id DESC);


--
-- TOC entry 3541 (class 1259 OID 139307)
-- Name: idx_projetos_marcos_projeto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projetos_marcos_projeto ON public.projetos_marcos USING btree (projeto_id, criada_em, id);


--
-- TOC entry 3550 (class 1259 OID 147554)
-- Name: idx_projetos_propostas_conversa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projetos_propostas_conversa ON public.projetos_propostas USING btree (conversa_id, status);


--
-- TOC entry 3523 (class 1259 OID 131106)
-- Name: idx_reaberturas_ciclo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reaberturas_ciclo ON public.conversas_reaberturas USING btree (conversa_id, ciclo_arquivamento, solicitada_em DESC, id DESC);


--
-- TOC entry 3524 (class 1259 OID 131105)
-- Name: idx_reaberturas_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reaberturas_pendente ON public.conversas_reaberturas USING btree (conversa_id) WHERE (status = 'pendente'::text);


--
-- TOC entry 3538 (class 1259 OID 131225)
-- Name: idx_solicitacoes_decisoes_solicitacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitacoes_decisoes_solicitacao ON public.solicitacoes_decisoes USING btree (solicitacao_id, criada_em, id);


--
-- TOC entry 3492 (class 1259 OID 41032)
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");


--
-- TOC entry 3567 (class 1259 OID 155698)
-- Name: usuarios_recuperacoes_historico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usuarios_recuperacoes_historico ON public.usuarios_recuperacoes USING btree (usuario_id, criada_em DESC, id DESC);


--
-- TOC entry 3568 (class 1259 OID 155699)
-- Name: usuarios_recuperacoes_link_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_recuperacoes_link_ativo ON public.usuarios_recuperacoes USING btree (usuario_id) WHERE ((tipo = 'link'::text) AND (usada_em IS NULL) AND (revogada_em IS NULL));


--
-- TOC entry 3571 (class 1259 OID 155700)
-- Name: usuarios_recuperacoes_provisoria_ativa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_recuperacoes_provisoria_ativa ON public.usuarios_recuperacoes USING btree (usuario_id) WHERE ((tipo = 'provisoria'::text) AND (usada_em IS NULL) AND (revogada_em IS NULL));


--
-- TOC entry 3496 (class 1259 OID 41034)
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- TOC entry 3623 (class 2620 OID 131191)
-- Name: conversas funilador_notificar_arquivo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_arquivo AFTER UPDATE OF arquivada_em ON public.conversas FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_arquivo();


--
-- TOC entry 3620 (class 2620 OID 147463)
-- Name: projetos funilador_notificar_dados_projeto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_dados_projeto AFTER UPDATE OF titulo, descricao, valor_acordado, prazo_acordado, tecnologias, modo_progresso, progresso ON public.projetos FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_dados_projeto();


--
-- TOC entry 3625 (class 2620 OID 147465)
-- Name: projetos_marcos funilador_notificar_marco; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_marco AFTER INSERT OR DELETE OR UPDATE ON public.projetos_marcos FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_marco();


--
-- TOC entry 3622 (class 2620 OID 131185)
-- Name: mensagens funilador_notificar_mensagem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_mensagem AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_mensagem();


--
-- TOC entry 3626 (class 2620 OID 147467)
-- Name: marcos_pagamentos funilador_notificar_pagamento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_pagamento AFTER INSERT OR UPDATE OF anulado_em ON public.marcos_pagamentos FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_pagamento();


--
-- TOC entry 3621 (class 2620 OID 131189)
-- Name: projetos funilador_notificar_projeto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_projeto AFTER INSERT OR UPDATE OF status ON public.projetos FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_projeto();


--
-- TOC entry 3624 (class 2620 OID 131193)
-- Name: conversas_reaberturas funilador_notificar_reabertura; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_reabertura AFTER INSERT OR UPDATE OF status ON public.conversas_reaberturas FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_reabertura();


--
-- TOC entry 3619 (class 2620 OID 131187)
-- Name: solicitacoes funilador_notificar_solicitacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER funilador_notificar_solicitacao AFTER UPDATE OF status ON public.solicitacoes FOR EACH ROW EXECUTE FUNCTION public.funilador_notificar_solicitacao();


--
-- TOC entry 3618 (class 2620 OID 114689)
-- Name: clientes trigger_conversa_geral; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_conversa_geral AFTER INSERT ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.criar_conversa_geral();


--
-- TOC entry 3577 (class 2606 OID 41012)
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3574 (class 2606 OID 65538)
-- Name: clientes clientes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3584 (class 2606 OID 106520)
-- Name: conversas conversa_projeto_cliente_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversa_projeto_cliente_fk FOREIGN KEY (projeto_id, cliente_id) REFERENCES public.projetos(id, cliente_id) ON DELETE RESTRICT;


--
-- TOC entry 3585 (class 2606 OID 106515)
-- Name: conversas conversas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas
    ADD CONSTRAINT conversas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;


--
-- TOC entry 3591 (class 2606 OID 131118)
-- Name: conversas_ocultas conversas_ocultas_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_ocultas
    ADD CONSTRAINT conversas_ocultas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE CASCADE;


--
-- TOC entry 3592 (class 2606 OID 131128)
-- Name: conversas_ocultas conversas_ocultas_ultima_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_ocultas
    ADD CONSTRAINT conversas_ocultas_ultima_admin_id_fkey FOREIGN KEY (ultima_admin_id) REFERENCES public.mensagens(id) ON DELETE SET NULL;


--
-- TOC entry 3593 (class 2606 OID 131123)
-- Name: conversas_ocultas conversas_ocultas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_ocultas
    ADD CONSTRAINT conversas_ocultas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3588 (class 2606 OID 131090)
-- Name: conversas_reaberturas conversas_reaberturas_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_reaberturas
    ADD CONSTRAINT conversas_reaberturas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE RESTRICT;


--
-- TOC entry 3589 (class 2606 OID 131100)
-- Name: conversas_reaberturas conversas_reaberturas_decidida_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_reaberturas
    ADD CONSTRAINT conversas_reaberturas_decidida_por_fkey FOREIGN KEY (decidida_por) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3590 (class 2606 OID 131095)
-- Name: conversas_reaberturas conversas_reaberturas_solicitada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversas_reaberturas
    ADD CONSTRAINT conversas_reaberturas_solicitada_por_fkey FOREIGN KEY (solicitada_por) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3580 (class 2606 OID 90112)
-- Name: convites convites_cliente_aceitou_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convites
    ADD CONSTRAINT convites_cliente_aceitou_id_fkey FOREIGN KEY (cliente_aceitou_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- TOC entry 3581 (class 2606 OID 73745)
-- Name: convites convites_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convites
    ADD CONSTRAINT convites_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;


--
-- TOC entry 3605 (class 2606 OID 147477)
-- Name: marcos_ocultos marcos_ocultos_marco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_ocultos
    ADD CONSTRAINT marcos_ocultos_marco_id_fkey FOREIGN KEY (marco_id) REFERENCES public.projetos_marcos(id) ON DELETE CASCADE;


--
-- TOC entry 3606 (class 2606 OID 147482)
-- Name: marcos_ocultos marcos_ocultos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_ocultos
    ADD CONSTRAINT marcos_ocultos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3602 (class 2606 OID 147456)
-- Name: marcos_pagamentos marcos_pagamentos_anulado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_pagamentos
    ADD CONSTRAINT marcos_pagamentos_anulado_por_fkey FOREIGN KEY (anulado_por) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3603 (class 2606 OID 139322)
-- Name: marcos_pagamentos marcos_pagamentos_marco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_pagamentos
    ADD CONSTRAINT marcos_pagamentos_marco_id_fkey FOREIGN KEY (marco_id) REFERENCES public.projetos_marcos(id) ON DELETE RESTRICT;


--
-- TOC entry 3604 (class 2606 OID 139327)
-- Name: marcos_pagamentos marcos_pagamentos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_pagamentos
    ADD CONSTRAINT marcos_pagamentos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3613 (class 2606 OID 147570)
-- Name: marcos_validacoes marcos_validacoes_marco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_validacoes
    ADD CONSTRAINT marcos_validacoes_marco_id_fkey FOREIGN KEY (marco_id) REFERENCES public.projetos_marcos(id) ON DELETE RESTRICT;


--
-- TOC entry 3614 (class 2606 OID 147575)
-- Name: marcos_validacoes marcos_validacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcos_validacoes
    ADD CONSTRAINT marcos_validacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3582 (class 2606 OID 106528)
-- Name: mensagens mensagens_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE RESTRICT;


--
-- TOC entry 3586 (class 2606 OID 122891)
-- Name: mensagens_leituras mensagens_leituras_mensagem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_leituras
    ADD CONSTRAINT mensagens_leituras_mensagem_id_fkey FOREIGN KEY (mensagem_id) REFERENCES public.mensagens(id) ON DELETE CASCADE;


--
-- TOC entry 3587 (class 2606 OID 122896)
-- Name: mensagens_leituras mensagens_leituras_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens_leituras
    ADD CONSTRAINT mensagens_leituras_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3583 (class 2606 OID 98325)
-- Name: mensagens mensagens_remetente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensagens
    ADD CONSTRAINT mensagens_remetente_id_fkey FOREIGN KEY (remetente_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3594 (class 2606 OID 131154)
-- Name: notificacoes notificacoes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- TOC entry 3597 (class 2606 OID 131173)
-- Name: notificacoes_leituras notificacoes_leituras_notificacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes_leituras
    ADD CONSTRAINT notificacoes_leituras_notificacao_id_fkey FOREIGN KEY (notificacao_id) REFERENCES public.notificacoes(id) ON DELETE CASCADE;


--
-- TOC entry 3598 (class 2606 OID 131178)
-- Name: notificacoes_leituras notificacoes_leituras_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes_leituras
    ADD CONSTRAINT notificacoes_leituras_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3595 (class 2606 OID 155648)
-- Name: notificacoes notificacoes_marco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_marco_id_fkey FOREIGN KEY (marco_id) REFERENCES public.projetos_marcos(id) ON DELETE SET NULL;


--
-- TOC entry 3596 (class 2606 OID 131194)
-- Name: notificacoes notificacoes_mensagem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_mensagem_id_fkey FOREIGN KEY (mensagem_id) REFERENCES public.mensagens(id) ON DELETE CASCADE;


--
-- TOC entry 3578 (class 2606 OID 49171)
-- Name: projetos projetos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos
    ADD CONSTRAINT projetos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- TOC entry 3601 (class 2606 OID 139302)
-- Name: projetos_marcos projetos_marcos_projeto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_marcos
    ADD CONSTRAINT projetos_marcos_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.projetos(id) ON DELETE RESTRICT;


--
-- TOC entry 3607 (class 2606 OID 147539)
-- Name: projetos_propostas projetos_propostas_anterior_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_anterior_id_fkey FOREIGN KEY (anterior_id) REFERENCES public.projetos_propostas(id) ON DELETE RESTRICT;


--
-- TOC entry 3608 (class 2606 OID 147524)
-- Name: projetos_propostas projetos_propostas_conversa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES public.conversas(id) ON DELETE RESTRICT;


--
-- TOC entry 3609 (class 2606 OID 147549)
-- Name: projetos_propostas projetos_propostas_decidido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3610 (class 2606 OID 147544)
-- Name: projetos_propostas projetos_propostas_marco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_marco_id_fkey FOREIGN KEY (marco_id) REFERENCES public.projetos_marcos(id) ON DELETE RESTRICT;


--
-- TOC entry 3611 (class 2606 OID 147529)
-- Name: projetos_propostas projetos_propostas_mensagem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_mensagem_id_fkey FOREIGN KEY (mensagem_id) REFERENCES public.mensagens(id) ON DELETE RESTRICT;


--
-- TOC entry 3612 (class 2606 OID 147534)
-- Name: projetos_propostas projetos_propostas_resposta_mensagem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos_propostas
    ADD CONSTRAINT projetos_propostas_resposta_mensagem_id_fkey FOREIGN KEY (resposta_mensagem_id) REFERENCES public.mensagens(id) ON DELETE RESTRICT;


--
-- TOC entry 3579 (class 2606 OID 49178)
-- Name: projetos projetos_solicitacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projetos
    ADD CONSTRAINT projetos_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES public.solicitacoes(id);


--
-- TOC entry 3576 (class 2606 OID 40993)
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3575 (class 2606 OID 24615)
-- Name: solicitacoes solicitacoes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes
    ADD CONSTRAINT solicitacoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- TOC entry 3599 (class 2606 OID 131215)
-- Name: solicitacoes_decisoes solicitacoes_decisoes_solicitacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_decisoes
    ADD CONSTRAINT solicitacoes_decisoes_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES public.solicitacoes(id) ON DELETE RESTRICT;


--
-- TOC entry 3600 (class 2606 OID 131220)
-- Name: solicitacoes_decisoes solicitacoes_decisoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_decisoes
    ADD CONSTRAINT solicitacoes_decisoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3615 (class 2606 OID 155663)
-- Name: usuarios_configuracoes usuarios_configuracoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_configuracoes
    ADD CONSTRAINT usuarios_configuracoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3616 (class 2606 OID 155693)
-- Name: usuarios_recuperacoes usuarios_recuperacoes_administrador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_recuperacoes
    ADD CONSTRAINT usuarios_recuperacoes_administrador_id_fkey FOREIGN KEY (administrador_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- TOC entry 3617 (class 2606 OID 155688)
-- Name: usuarios_recuperacoes usuarios_recuperacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_recuperacoes
    ADD CONSTRAINT usuarios_recuperacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public."user"(id) ON DELETE CASCADE;


-- Completed on 2026-11-28 06:00:13

--
-- PostgreSQL database dump complete
--

\unrestrict mY6ubgiUI7nc6omjsPOJtkQ9YqAGYAkYqL5cGB0zvPYShAqyGnfNfAsJVbFm7sV

