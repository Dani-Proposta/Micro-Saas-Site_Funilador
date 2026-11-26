//precisa pra se quer existir
import express from "express";

import type { PoolClient } from "pg";

import { pool } from "./db.ts";

import { randomUUID, randomBytes } from "node:crypto";

import { Kysely, PostgresDialect, sql } from "kysely";

import { betterAuth } from "better-auth";

import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

import type { Request, Response, NextFunction } from "express";

import type { Solicitacao } from "./solicitacao.ts";

import type { Cliente } from "./cliente.ts";

import { auth } from "./auth.ts";

import { error } from "node:console";

const app = express();

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

//função de proteção de dados para q só admin acesse algumas coisas
async function exigirAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const sessao = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!sessao) {
            res.status(401).json({ erro: "Você precisa fazer login" });
            return;
        }

        const papeis = sessao.user.role?.split(",") ?? [];

        if (!papeis.includes("admin")) {
            res.status(403).json({ erro: "Acesso restrito" });
            return;
        }

        res.locals.usuarioId = sessao.user.id;
        next();
    } catch (erro) {
        console.error("Erro ao verificar acesso:", erro);
        res.status(500).json({ erro: "Falha ao verificar autenticação" });
    }
}

//precisa ser clientep para acessar essa area
async function exigirCliente(req: Request, res: Response, next: NextFunction) {
    try {
        const sessao = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!sessao) {
            res.status(401).json({ erro: "Você precisa fazer login" });
            return;
        }

        const papeis = sessao.user.role?.split(",") ?? [];

        if (!papeis.includes("user") || papeis.includes("admin")) {
            res.status(403).json({ erro: "Acesso restrito aos clientes" });
            return;
        }

        const resultado = await pool.query(
            `
            SELECT id, nome, email
            FROM clientes
            WHERE usuario_id = $1
        `,
            [sessao.user.id],
        );

        if (resultado.rows.length === 0) {
            res.status(403).json({ erro: "Nenhum cliente vinculado à conta" });
            return;
        }

        res.locals.cliente = resultado.rows[0];
        res.locals.usuarioId = sessao.user.id;

        next();
    } catch (erro) {
        console.error("Erro ao verificar cliente:", erro);
        res.status(500).json({ erro: "Falha ao verificar autenticação" });
    }
}

//aqui eu protego oq só adm pode solicitar ou acessar
app.use(
    [
        "/api/clientes",
        "/api/solicitacoes",
        "/api/projetos",
        "/api/dashboard",
        "/api/convites",
        "/api/conversas",
        "/api/notificacoes",
    ],
    exigirAdmin,
);

//apenas cliente logado ve
app.use("/api/me", exigirCliente);

const dbCadastro = new Kysely({
    dialect: new PostgresDialect({ pool }),
});

class ErroCadastro extends Error {
    public status: number;

    constructor(status: number, mensagem: string) {
        super(mensagem);
        this.status = status;
    }
}

//funções auxiliares
function rotaHistorico(lado: "admin" | "cliente") {
    return async (req: Request, res: Response) => {
        const {id} = req.params;
        const {antes, depois, aPartir} = req.query;
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const cursor = antes ?? depois ?? aPartir ?? null;
        const inicio = req.query.inicio === "true";
        if (typeof id !== "string" || !uuid.test(id) ||
            ([antes, depois, aPartir].filter(v => v !== undefined).length > 1) ||
            (cursor !== null && (typeof cursor !== "string" || !uuid.test(cursor)))) {
            res.status(400).json({erro: "Conversa ou cursor inválido."});
            return;
        }

        const crescente = depois !== undefined || aPartir !== undefined;
        const direcao = crescente ? "ASC" : "DESC";
        const operador = aPartir !== undefined ? ">=" : crescente ? ">" : "<";
        const clienteId = lado === "cliente" ? res.locals.cliente.id : null;

        try {
            const resultado = await pool.query(`
                SELECT c.arquivada_em AS "arquivadaEm",
                    COALESCE(h.mensagens, '[]'::json) AS mensagens,
                    COALESCE(h."temMais", false) AS "temMais",
                    CASE WHEN $6::boolean THEN (
                        SELECT m.id FROM mensagens m
                        WHERE m.conversa_id = c.id AND m.remetente_tipo <> $5
                            AND NOT EXISTS (SELECT 1 FROM mensagens_leituras l
                                WHERE l.mensagem_id = m.id AND l.usuario_id = $3)
                        ORDER BY m.enviada_em ASC, m.id ASC LIMIT 1
                    ) END AS "primeiraNaoLidaId"
                FROM conversas c
                LEFT JOIN mensagens referencia ON referencia.id = $4::uuid
                    AND referencia.conversa_id = c.id
                LEFT JOIN LATERAL (
                    SELECT json_agg(json_build_object(
                        'id', m.id,
                        'remetenteTipo', m.remetente_tipo,
                        'conteudo', m.conteudo,
                        'proposta', (SELECT pp.dados FROM funilador_propostas_publicas pp WHERE pp.mensagem_id = m.id),
                        'decisaoProposta', (SELECT json_build_object('id',pp.id,'status',pp.status) FROM funilador_propostas_publicas pp WHERE pp.resposta_mensagem_id = m.id),
                        'lida', (m.remetente_tipo = $5 OR EXISTS (
                            SELECT 1 FROM mensagens_leituras l
                            WHERE l.mensagem_id = m.id AND l.usuario_id = $3
                        )),
                        'enviadaEm', to_char(m.enviada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                    ) ORDER BY m.enviada_em ASC, m.id ASC)
                        FILTER (WHERE m.pos <= 50) AS mensagens,
                        COUNT(*) > 50 AS "temMais"
                    FROM (
                        SELECT pagina.*, row_number() OVER (ORDER BY enviada_em ${direcao}, id ${direcao}) AS pos
                        FROM (
                            SELECT id, remetente_tipo, conteudo, enviada_em
                            FROM mensagens
                            WHERE conversa_id = c.id
                                AND ($4::uuid IS NULL OR (enviada_em, id) ${operador} (referencia.enviada_em, referencia.id))
                            ORDER BY enviada_em ${direcao}, id ${direcao}
                            LIMIT 51
                        ) pagina
                    ) m
                ) h ON TRUE
                WHERE c.id = $1 AND ($2::uuid IS NULL OR c.cliente_id = $2)
                    AND ($4::uuid IS NULL OR referencia.id IS NOT NULL)
            `, [id, clienteId, res.locals.usuarioId, cursor, lado, inicio]);

            const conversa = resultado.rows[0];
            if (!conversa) {
                res.status(404).json({erro: "Conversa ou cursor não encontrado."});
                return;
            }

            res.set("Cache-Control", "no-store");
            //manter resposta antiga sem cursor
            res.json(req.query.estado === "true" || cursor !== null ? conversa : conversa.mensagens);
        } catch (erro) {
            console.error("Erro ao buscar histórico:", erro);
            res.status(500).json({erro: "Não foi possível carregar as mensagens."});
        }
    };
}

const uuidConversa = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErroConversa extends Error {
    public status: number;
    constructor(status: number, mensagem: string) {
        super(mensagem);
        this.status = status;
    }
}

async function transacaoConversa<T>(acao: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await pool.connect();
    try {
        await db.query("BEGIN");
        const resultado = await acao(db);
        await db.query("COMMIT");
        return resultado;
    } catch (erro) {
        await db.query("ROLLBACK");
        throw erro;
    } finally {
        db.release();
    }
}

function responderErroConversa(res: Response, erro: unknown) {
    if (erro instanceof ErroConversa) {
        res.status(erro.status).json({erro: erro.message});
        return;
    }
    console.error("Erro ao gerenciar conversa:", erro);
    res.status(500).json({erro: "Não foi possível concluir a operação."});
}

function contarNaoLidas(lado: "admin" | "cliente") {
    const recebidoDe = lado === "admin" ? "cliente" : "admin";
    return async (_req: Request, res: Response) => {
        try {
            const clienteId = lado === "cliente" ? res.locals.cliente.id : null;
            const resultado = await pool.query(`
                SELECT COUNT(*)::int AS total
                FROM mensagens m JOIN conversas c ON c.id = m.conversa_id
                WHERE m.remetente_tipo = $1
                    AND ($2::uuid IS NULL OR c.cliente_id = $2)
                    AND NOT EXISTS (SELECT 1 FROM mensagens_leituras l
                        WHERE l.mensagem_id = m.id AND l.usuario_id = $3)
            `, [recebidoDe, clienteId, res.locals.usuarioId]);
            res.set("Cache-Control", "no-store");
            res.json(resultado.rows[0]);
        } catch (erro) {
            console.error("Erro ao contar mensagens não lidas:", erro);
            res.status(500).json({erro: "Não foi possível atualizar o contador."});
        }
    };
}

function registrarLeituras(lado: "admin" | "cliente") {
    const recebidoDe = lado === "admin" ? "cliente" : "admin";
    return async (req: Request, res: Response) => {
        const {id} = req.params;
        const {mensagemIds, todas} = req.body ?? {};
        const marcarTodas = todas === true;
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof id !== "string" || !uuid.test(id) || (!marcarTodas && (!Array.isArray(mensagemIds) ||
            mensagemIds.length < 1 || mensagemIds.length > 100 ||
            !mensagemIds.every(v => typeof v === "string" && uuid.test(v))))) {
            res.status(400).json({erro: "Informe IDs de mensagens válidos (até 100)."});
            return;
        }
        try {
            const clienteId = lado === "cliente" ? res.locals.cliente.id : null;
            //verificar e registrar leitura
            const resultado = await pool.query(`
                WITH conversa AS (
                    SELECT id FROM conversas WHERE id = $1
                        AND ($2::uuid IS NULL OR cliente_id = $2)
                ), elegiveis AS (
                    SELECT m.id FROM mensagens m JOIN conversa c ON c.id = m.conversa_id
                    WHERE ($6::boolean OR m.id = ANY($3::uuid[])) AND m.remetente_tipo = $4
                        AND (NOT $6::boolean OR NOT EXISTS (SELECT 1 FROM mensagens_leituras l WHERE l.mensagem_id = m.id AND l.usuario_id = $5))
                ), gravadas AS (
                    INSERT INTO mensagens_leituras (mensagem_id, usuario_id)
                    SELECT id, $5 FROM elegiveis WHERE TRUE ON CONFLICT DO NOTHING
                    RETURNING mensagem_id
                )
                SELECT EXISTS (SELECT 1 FROM conversa) AS autorizada,
                    CASE WHEN $6::boolean THEN '[]'::json ELSE COALESCE((SELECT json_agg(id) FROM elegiveis), '[]'::json) END AS "mensagemIds",
                    (SELECT COUNT(*)::int FROM gravadas) AS total
            `, [id, clienteId, marcarTodas ? [] : mensagemIds, recebidoDe, res.locals.usuarioId, marcarTodas]);
            const dados = resultado.rows[0];
            if (!dados.autorizada) {
                res.status(404).json({erro: "Conversa não encontrada."});
                return;
            }
            res.json({mensagemIds: dados.mensagemIds, total: dados.total});
        } catch (erro) {
            console.error("Erro ao registrar leitura:", erro);
            res.status(500).json({erro: "Não foi possível registrar a leitura."});
        }
    };
}

function listarNotificacoes(lado: "admin" | "cliente") {
    return async (req: Request, res: Response) => {
        const pagina = req.query.pagina === undefined ? 0 : Number(req.query.pagina);
        if (!Number.isSafeInteger(pagina) || pagina < 0 || pagina > 1000000) {
            res.status(400).json({erro: "Página inválida."}); return;
        }
        const clienteId = lado === "cliente" ? res.locals.cliente.id : null;
        try {
            const resultado = await pool.query(`
                WITH eventos AS (
                    SELECT n.*, (
                        l.notificacao_id IS NULL AND CASE
                            WHEN n.tipo <> 'mensagem' THEN TRUE
                            WHEN n.mensagem_id IS NOT NULL THEN NOT EXISTS (
                                SELECT 1 FROM mensagens_leituras ml
                                WHERE ml.mensagem_id = n.mensagem_id AND ml.usuario_id = $3
                            )
                            ELSE EXISTS (
                                -- compatibilidade com notificações antigas
                                SELECT 1 FROM mensagens m
                                WHERE m.conversa_id = n.referencia_id
                                    AND m.remetente_tipo = CASE WHEN n.publico = 'admin' THEN 'cliente' ELSE 'admin' END
                                    AND m.enviada_em <= n.criada_em
                                    AND NOT EXISTS (SELECT 1 FROM mensagens_leituras ml WHERE ml.mensagem_id = m.id AND ml.usuario_id = $3)
                            )
                        END
                    ) AS nao_lida,
                        funilador_grupo_notificacao(n.tipo, n.referencia_id, n.id, n.titulo, n.cliente_id) AS grupo
                    FROM notificacoes n
                    LEFT JOIN notificacoes_leituras l ON l.notificacao_id = n.id AND l.usuario_id = $3
                    WHERE n.publico = $1 AND ($2::uuid IS NULL OR n.cliente_id = $2)
                        AND l.ocultada_em IS NULL
                ), agrupadas AS (
                    SELECT *, (COUNT(*) FILTER (WHERE nao_lida) OVER (PARTITION BY grupo))::int AS quantidade,
                        ROW_NUMBER() OVER (PARTITION BY grupo ORDER BY criada_em DESC, id DESC) AS ordem
                    FROM eventos
                ), grupos AS (
                    SELECT id, tipo, referencia_id AS "referenciaId", titulo, resumo,
                        criada_em AS "criadaEm", quantidade FROM agrupadas WHERE ordem = 1
                ), pagina AS (
                    SELECT * FROM grupos ORDER BY "criadaEm" DESC, id DESC LIMIT 20 OFFSET $4
                )
                SELECT (SELECT COUNT(*)::int FROM grupos WHERE quantidade > 0) AS total,
                    (SELECT COUNT(*)::int FROM grupos) AS "totalGrupos",
                    COALESCE((SELECT json_agg(p ORDER BY p."criadaEm" DESC, p.id DESC) FROM pagina p), '[]'::json) AS itens
            `, [lado, clienteId, res.locals.usuarioId, pagina * 20]);
            res.set("Cache-Control", "no-store").json(resultado.rows[0]);
        } catch (erro) {
            console.error("Erro ao consultar notificações:", erro);
            res.status(500).json({erro: "Não foi possível consultar notificações."});
        }
    };
}

function limparNotificacoes(lado: "admin" | "cliente") {
    return async (_req: Request, res: Response) => {
        const clienteId = lado === "cliente" ? res.locals.cliente.id : null;
        try {
            const resultado = await pool.query(`
                INSERT INTO notificacoes_leituras (notificacao_id, usuario_id, ocultada_em)
                SELECT n.id, $3, clock_timestamp()
                FROM notificacoes n
                LEFT JOIN notificacoes_leituras l ON l.notificacao_id = n.id AND l.usuario_id = $3
                WHERE n.publico = $1 AND ($2::uuid IS NULL OR n.cliente_id = $2)
                    AND l.ocultada_em IS NULL
                ON CONFLICT (notificacao_id, usuario_id) DO UPDATE
                    SET ocultada_em = EXCLUDED.ocultada_em
                    WHERE notificacoes_leituras.ocultada_em IS NULL
                RETURNING notificacao_id
            `, [lado, clienteId, res.locals.usuarioId]);
            res.json({limpas: resultado.rowCount ?? 0});
        } catch (erro) {
            console.error("Erro ao limpar notificações:", erro);
            res.status(500).json({erro: "Não foi possível limpar as notificações."});
        }
    };
}

function lerNotificacoes(lado: "admin" | "cliente") {
    return async (req: Request, res: Response) => {
        const {id, todas} = req.body ?? {};
        const marcarTodas = todas === true;
        if (!marcarTodas && (typeof id !== "string" || !uuidConversa.test(id))) {
            res.status(400).json({erro: "Notificação inválida."}); return;
        }
        const clienteId = lado === "cliente" ? res.locals.cliente.id : null;
        try {
            //marcar até a notificação selecionada
            const resultado = await pool.query(`
                WITH autorizadas AS (
                    SELECT n.* FROM notificacoes n WHERE publico = $1 AND ($2::uuid IS NULL OR cliente_id = $2)
                        AND NOT EXISTS (SELECT 1 FROM notificacoes_leituras l WHERE l.notificacao_id = n.id AND l.usuario_id = $3 AND l.ocultada_em IS NOT NULL)
                ), ancora AS (
                    SELECT * FROM autorizadas WHERE id = $4::uuid
                ), gravadas AS (
                    INSERT INTO notificacoes_leituras (notificacao_id, usuario_id)
                    SELECT n.id, $3 FROM autorizadas n
                    WHERE $5::boolean OR EXISTS (
                        SELECT 1 FROM ancora a WHERE n.id = a.id OR (
                            funilador_grupo_notificacao(n.tipo, n.referencia_id, n.id, n.titulo, n.cliente_id) =
                            funilador_grupo_notificacao(a.tipo, a.referencia_id, a.id, a.titulo, a.cliente_id)
                            AND (n.criada_em, n.id) <= (a.criada_em, a.id)
                        )
                    ) ON CONFLICT DO NOTHING RETURNING notificacao_id
                )
                SELECT ($5::boolean OR EXISTS (SELECT 1 FROM ancora)) AS encontrada,
                    (SELECT COUNT(*)::int FROM gravadas) AS marcadas
            `, [lado, clienteId, res.locals.usuarioId, marcarTodas ? null : id, marcarTodas]);
            if (!resultado.rows[0].encontrada) {res.status(404).json({erro: "Notificação não encontrada."}); return;}
            res.json({marcadas: resultado.rows[0].marcadas});
        } catch (erro) {
            console.error("Erro ao registrar leitura de notificações:", erro);
            res.status(500).json({erro: "Não foi possível registrar a leitura."});
        }
    };
}

//validar valor em reais
function valorComercial(valor: unknown): string | null {
    if (valor === undefined || valor === null || valor === "") return null;
    if (typeof valor !== "string" || !/^\d{1,10}(?:[.,]\d{1,2})?$/.test(valor.trim())) {
        throw new ErroConversa(400, "Informe um valor válido em reais");
    }
    return valor.trim().replace(",", ".");
}

//validar prazo
function prazoComercial(valor: unknown): string | null {
    if (valor === undefined || valor === null || valor === "") return null;
    if (typeof valor !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)) throw new ErroConversa(400, "Prazo inválido");
    const data = new Date(valor + "T00:00:00Z");
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new ErroConversa(400, "Prazo inválido");
    return valor;
}

//validar dados do projeto
function dadosComerciaisProjeto(corpo: Record<string, unknown>) {
    const valor = valorComercial(corpo.valorAcordado);
    const prazo = prazoComercial(corpo.prazoAcordado);
    const prioridade = corpo.prioridade ?? null;
    const progresso = corpo.progresso ?? null;
    const tecnologias = corpo.tecnologias ?? [];
    const observacoes = corpo.observacoesInternas ?? null;
    if (prioridade !== null && prioridade !== "baixa" && prioridade !== "normal" && prioridade !== "alta") throw new ErroConversa(400, "Prioridade inválida");
    if (progresso !== null && (typeof progresso !== "number" || !Number.isInteger(progresso) || progresso < 0 || progresso > 100)) throw new ErroConversa(400, "Progresso deve estar entre 0 e 100");
    if (!Array.isArray(tecnologias) || tecnologias.length > 30 || tecnologias.some(t => typeof t !== "string" || !t.trim() || t.trim().length > 60)) throw new ErroConversa(400, "Tecnologias inválidas");
    if (observacoes !== null && (typeof observacoes !== "string" || observacoes.length > 5000)) throw new ErroConversa(400, "Observações inválidas");
    return [valor, prazo, prioridade, progresso, [...new Set(tecnologias.map(t => t.trim()))], typeof observacoes === "string" ? observacoes.trim() || null : null];
}

//validar dados do marco
function dadosMarco(corpo: Record<string, unknown>) {
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw new ErroConversa(400, "Dados inválidos");
    const {titulo, descricao, status, cobrancaIniciada, bloqueiaProgresso, saldoDispensado} = corpo;
    if (typeof titulo !== "string" || !titulo.trim() || titulo.trim().length > 150) throw new ErroConversa(400, "Informe um título de até 150 caracteres");
    if (typeof descricao !== "string" || descricao.length > 5000) throw new ErroConversa(400, "Descrição inválida");
    if (typeof status !== "string" || !["pendente", "em_andamento", "aguardando_validacao", "concluido", "cancelado"].includes(status)) throw new ErroConversa(400, "Status inválido");
    if (typeof cobrancaIniciada !== "boolean" || typeof bloqueiaProgresso !== "boolean" || typeof saldoDispensado !== "boolean" || (saldoDispensado && status !== "cancelado")) throw new ErroConversa(400, "Dados de pagamento inválidos");
    return [titulo.trim(), descricao.trim() || null, status, valorComercial(corpo.valor), prazoComercial(corpo.prazoEntrega), prazoComercial(corpo.vencimento), cobrancaIniciada, bloqueiaProgresso, saldoDispensado];
}

//buscar marcos e progresso
async function carregarMarcos(db: PoolClient | typeof pool, id: string, clienteId: string | null = null, usuarioId: string | null = null) {
    if (!uuidConversa.test(id)) throw new ErroConversa(400, "Projeto inválido");
    const resultado = await db.query(`
        SELECT p.id, p.modo_progresso AS "modoProgresso",
            funilador_progresso_projeto(p.id, p.modo_progresso, p.progresso) AS progresso,
            p.atualizada_em AS "atualizadaEm",
            p.valor_acordado::text AS "valorAcordado",
            to_char(p.prazo_acordado, 'YYYY-MM-DD') AS "prazoAcordado",
            COALESCE(SUM(m.recebido), 0)::text AS "totalPago",
            COALESCE(SUM(CASE WHEN m.saldo_dispensado THEN m.recebido ELSE COALESCE(m.valor, 0) END), 0)::text AS "valorDistribuido",
            (p.valor_acordado - COALESCE(SUM(CASE WHEN m.saldo_dispensado THEN m.recebido ELSE COALESCE(m.valor, 0) END), 0))::text AS "valorRestante",
            COALESCE(jsonb_agg(jsonb_build_object(
                'id', m.id, 'titulo', m.titulo, 'descricao', m.descricao, 'status', m.status,
                'valor', m.valor::text, 'recebido', m.recebido::text, 'saldo', m.saldo::text,
                'prazoEntrega', to_char(m.prazo_entrega, 'YYYY-MM-DD'),
                'vencimento', to_char(m.vencimento, 'YYYY-MM-DD'),
                'cobrancaIniciada', m.cobranca_iniciada, 'bloqueiaProgresso', m.bloqueia_progresso,
                'saldoDispensado', m.saldo_dispensado, 'pagamentos', m.pagamentos,
                'acordado', EXISTS (SELECT 1 FROM projetos_propostas pp WHERE pp.marco_id = m.id),
                'validado', EXISTS (SELECT 1 FROM marcos_validacoes v WHERE v.marco_id = m.id),
                'versao', to_char(m.atualizada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                'oculto', EXISTS (SELECT 1 FROM marcos_ocultos o WHERE o.marco_id = m.id AND o.usuario_id = $3)
            ) ORDER BY m.criada_em, m.id) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS marcos
        FROM projetos p
        LEFT JOIN funilador_marcos_resumo m ON m.projeto_id = p.id
        WHERE p.id = $1 AND ($2::uuid IS NULL OR (p.cliente_id = $2 AND p.arquivada_em IS NULL))
        GROUP BY p.id
    `, [id, clienteId, usuarioId]);
    if (!resultado.rows.length) throw new ErroConversa(404, "Projeto não encontrado");
    const dados = resultado.rows[0];
    if (clienteId !== null) {
        delete dados.valorDistribuido;
        delete dados.valorRestante;
        for (const marco of dados.marcos) delete marco.oculto;
    }
    return dados;
}

//travar projeto antes de alterar marcos
async function travarProjetoMarco(db: PoolClient, id: string) {
    if (!uuidConversa.test(id)) throw new ErroConversa(400, "Projeto inválido");
    const resultado = await db.query(`SELECT status FROM projetos WHERE id = $1 AND arquivada_em IS NULL FOR UPDATE`, [id]);
    if (!resultado.rows.length) throw new ErroConversa(404, "Projeto não encontrado ou arquivado");
    return resultado.rows[0].status as string;
}

//atualizar data do projeto
async function atualizarProjetoMarco(db: PoolClient, id: string, usuarioId: string) {
    await db.query(`UPDATE projetos SET atualizada_em = NOW() WHERE id = $1`, [id]);
    return carregarMarcos(db, id, null, usuarioId);
}

//erro ao gerenciar marcos
function responderErroMarco(res: Response, erro: unknown) {
    if (erro instanceof ErroConversa) {res.status(erro.status).json({erro: erro.message}); return;}
    console.error("Erro ao gerenciar marcos:", erro);
    res.status(500).json({erro: "Não foi possível concluir a operação"});
}

//dados da negociação
function dadosProposta(corpo: Record<string, unknown>) {
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw new ErroConversa(400, "Dados inválidos");
    const {tipo, titulo, descricao} = corpo;
    if (tipo !== "marco" && tipo !== "dados") throw new ErroConversa(400, "Tipo de proposta inválido");
    if (typeof titulo !== "string" || !titulo.trim() || titulo.trim().length > 150 || typeof descricao !== "string" || descricao.length > 5000) throw new ErroConversa(400, "Informe título e descrição válidos");
    const valor = tipo === "marco" ? valorComercial(corpo.valor) : null;
    const entrega = tipo === "marco" ? prazoComercial(corpo.prazoEntrega) : null;
    const vencimento = tipo === "marco" ? prazoComercial(corpo.vencimento) : null;
    const total = valorComercial(corpo.novoTotal);
    const prazo = prazoComercial(corpo.novoPrazo);
    if (tipo === "dados" && total === null && prazo === null) throw new ErroConversa(400, "Informe o novo valor ou prazo");
    return {tipo, titulo: titulo.trim(), descricao: descricao.trim() || null, valor, entrega, vencimento, total, prazo};
}

//travar conversa e projeto para negociar
async function travarNegociacao(db: PoolClient, id: string, clienteId: string | null) {
    if (!uuidConversa.test(id)) throw new ErroConversa(400, "Conversa inválida");
    const conversa = await db.query(`SELECT projeto_id, cliente_id, arquivada_em FROM conversas WHERE id = $1 AND tipo = 'projeto' AND ($2::uuid IS NULL OR cliente_id = $2) FOR UPDATE`, [id, clienteId]);
    const c = conversa.rows[0];
    if (!c) throw new ErroConversa(404, "Conversa de projeto não encontrada");
    if (c.arquivada_em) throw new ErroConversa(409, "Conversa arquivada");
    const projeto = await db.query(`SELECT id, status, arquivada_em, valor_acordado::text AS total, to_char(prazo_acordado,'YYYY-MM-DD') AS prazo FROM projetos WHERE id = $1 AND cliente_id = $2 FOR UPDATE`, [c.projeto_id, c.cliente_id]);
    const p = projeto.rows[0];
    if (!p || p.arquivada_em || !["planejado", "em_andamento"].includes(p.status)) throw new ErroConversa(409, "Projeto indisponível para negociação");
    return p;
}

//mensagem vinculada à negociação
async function mensagemNegociacao(db: PoolClient, conversa: string, usuario: string, lado: "admin" | "cliente", titulo: string, conteudo: string) {
    const mensagem = await db.query(`INSERT INTO mensagens (conversa_id, remetente_id, remetente_tipo, conteudo, enviada_em) VALUES ($1,$2,$3,$4,clock_timestamp()) RETURNING id`, [conversa, usuario, lado, conteudo]);
    const id = mensagem.rows[0].id;
    await db.query(`UPDATE notificacoes SET titulo = $2 WHERE mensagem_id = $1`, [id, `Negociação · ${titulo}`]);
    return id as string;
}

//registrar proposta sem alterar o projeto
async function criarProposta(db: PoolClient, conversa: string, usuario: string, lado: "admin" | "cliente", projeto: {total: string | null; prazo: string | null}, dados: ReturnType<typeof dadosProposta>, anterior: string | null = null) {
    const mensagem = await mensagemNegociacao(db, conversa, usuario, lado, anterior ? "Contraproposta" : "Nova proposta", `${anterior ? "Contraproposta" : "Proposta"}: ${dados.titulo}`);
    const resultado = await db.query(`INSERT INTO projetos_propostas (conversa_id, mensagem_id, anterior_id, autor_tipo, tipo, titulo, descricao, valor, prazo_entrega, vencimento, novo_total, novo_prazo, total_base, prazo_base) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [conversa, mensagem, anterior, lado, dados.tipo, dados.titulo, dados.descricao, dados.valor, dados.entrega, dados.vencimento, dados.total, dados.prazo, projeto.total, projeto.prazo]);
    return {id: resultado.rows[0].id as string, mensagem};
}

function rotaCriarProposta(lado: "admin" | "cliente") {
    return async (req: Request, res: Response) => {
        try {
            const dados = dadosProposta(req.body);
            const resultado = await transacaoConversa(async db => {
                const projeto = await travarNegociacao(db, req.params.id, lado === "cliente" ? res.locals.cliente.id : null);
                return criarProposta(db, req.params.id, res.locals.usuarioId, lado, projeto, dados);
            });
            res.status(201).json(resultado);
        } catch (erro) {responderErroConversa(res, erro);}
    };
}

//aceitar apenas termos compatíveis com o acordo atual
async function aceitarProposta(db: PoolClient, projeto: {id: string; total: string | null; prazo: string | null}, proposta: {tipo: string; titulo: string; descricao: string | null; valor: string | null; prazo_entrega: string | null; vencimento: string | null; novo_total: string | null; novo_prazo: string | null; total_base: string | null; prazo_base: string | null}) {
    if (projeto.total !== proposta.total_base || projeto.prazo !== proposta.prazo_base) throw new ErroConversa(409, "O acordo do projeto mudou. Envie uma contraproposta atualizada");
    const total = proposta.novo_total ?? projeto.total;
    const prazo = proposta.novo_prazo ?? projeto.prazo;
    const valor = proposta.tipo === "marco" ? proposta.valor : null;
    const saldo = await db.query(`SELECT ($2::numeric IS NULL OR COALESCE(SUM(CASE WHEN saldo_dispensado THEN recebido ELSE COALESCE(valor,0) END),0) + COALESCE($3::numeric,0) <= $2::numeric) AS suficiente FROM funilador_marcos_resumo WHERE projeto_id = $1`, [projeto.id, total, valor]);
    if (!saldo.rows[0].suficiente || (total === null && valor !== null && Number(valor) > 0)) throw new ErroConversa(409, "O valor dos marcos excede o acordo. Envie uma contraproposta com o novo total");
    let marcoId: string | null = null;
    if (proposta.tipo === "marco") {
        const marco = await db.query(`INSERT INTO projetos_marcos (projeto_id,titulo,descricao,valor,prazo_entrega,vencimento) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [projeto.id, proposta.titulo, proposta.descricao, valor, proposta.prazo_entrega, proposta.vencimento]);
        marcoId = marco.rows[0].id;
    }
    await db.query(`UPDATE projetos SET valor_acordado = $2, prazo_acordado = $3, atualizada_em = NOW() WHERE id = $1`, [projeto.id, total, prazo]);
    return marcoId;
}

function rotaDecidirProposta(lado: "admin" | "cliente") {
    return async (req: Request, res: Response) => {
        const {id, propostaId} = req.params;
        const {acao} = req.body ?? {};
        try {
            if (!uuidConversa.test(propostaId) || !["aceitar", "recusar", "contrapor", "retirar"].includes(acao)) throw new ErroConversa(400, "Decisão inválida");
            const resultado = await transacaoConversa(async db => {
                const projeto = await travarNegociacao(db, id, lado === "cliente" ? res.locals.cliente.id : null);
                const consulta = await db.query(`SELECT id, autor_tipo, tipo, titulo, descricao, valor::text, to_char(prazo_entrega,'YYYY-MM-DD') AS prazo_entrega, to_char(vencimento,'YYYY-MM-DD') AS vencimento, novo_total::text, to_char(novo_prazo,'YYYY-MM-DD') AS novo_prazo, total_base::text, to_char(prazo_base,'YYYY-MM-DD') AS prazo_base, status FROM projetos_propostas WHERE id = $1 AND conversa_id = $2 FOR UPDATE`, [propostaId, id]);
                const proposta = consulta.rows[0];
                if (!proposta) throw new ErroConversa(404, "Proposta não encontrada");
                if (proposta.status !== "pendente") throw new ErroConversa(409, "Esta proposta já foi resolvida");
                if ((proposta.autor_tipo === lado) !== (acao === "retirar")) throw new ErroConversa(403, "Você não pode realizar esta ação");
                let marcoId: string | null = null;
                let mensagem: string;
                let status: string;
                if (acao === "contrapor") {
                    const dados = dadosProposta(req.body?.proposta);
                    if (dados.tipo !== proposta.tipo) throw new ErroConversa(400, "Mantenha o tipo da proposta original");
                    const nova = await criarProposta(db, id, res.locals.usuarioId, lado, projeto, dados, propostaId);
                    mensagem = nova.mensagem; status = "contraproposta";
                } else {
                    if (acao === "aceitar") marcoId = await aceitarProposta(db, projeto, proposta);
                    status = acao === "aceitar" ? "aceita" : acao === "recusar" ? "recusada" : "retirada";
                    const titulo = `Proposta ${status}`;
                    mensagem = await mensagemNegociacao(db, id, res.locals.usuarioId, lado, titulo, `${titulo}: ${proposta.titulo}`);
                }
                await db.query(`UPDATE projetos_propostas SET status = $2, resposta_mensagem_id = $3, marco_id = $4, decidida_em = clock_timestamp(), decidido_por = $5 WHERE id = $1`, [propostaId, status, mensagem, marcoId, res.locals.usuarioId]);
                return {id: propostaId, status};
            });
            res.json(resultado);
        } catch (erro) {responderErroConversa(res, erro);}
    };
}

//rotas GET

//verificar conexão com api
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});

//cliente: carregar dados da conta
app.get("/api/me", (_req, res) => {
    res.json(res.locals.cliente);
});

//admin: carregar dashboard
app.get("/api/dashboard", async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
            (SELECT COUNT(*) :: int
            FROM clientes) AS "totalClientes",
            
            (SELECT COUNT(*)::int
            FROM projetos
            WHERE status = 'em_andamento'
            AND arquivada_em IS NULL) AS "projetosEmAndamento",
            
            (SELECT COUNT(*)::int
            FROM solicitacoes
            WHERE status = 'pendente') AS "solicitacoesPendentes",
            
            (SELECT COUNT(*)::int
            FROM projetos
            WHERE status = 'concluido'
            AND arquivada_em IS NULL) AS "projetosConcluidos"`,
        );

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("não foi possivel pegar os dados pro dashboard", erro);

        res
            .status(500)
            .json({ erro: "não foi possivel carregar os dados do dashboard" });
    }
});

//cliente: carregar dashboard
app.get("/api/me/dashboard", async (_req, res) => {
    const clienteId = res.locals.cliente.id;

    try {
        const resultado = await pool.query(
            `
            SELECT
                (SELECT COUNT(*)::int
                FROM projetos
                WHERE cliente_id = $1
                    AND status = 'planejado'
                    AND arquivada_em IS NULL) AS "projetosPlanejados",

                (SELECT COUNT(*)::int
                FROM projetos
                WHERE cliente_id = $1
                    AND status = 'em_andamento'
                    AND arquivada_em IS NULL) AS "projetosEmAndamento",

                (SELECT COUNT(*)::int
                FROM projetos
                WHERE cliente_id = $1
                    AND status = 'concluido'
                    AND arquivada_em IS NULL) AS "projetosConcluidos",

                (SELECT COUNT(*)::int
                FROM solicitacoes
                WHERE cliente_id = $1
                    AND status = 'pendente') AS "solicitacoesPendentes"
        `,
            [clienteId],
        );

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao carregar dashboard do cliente:", erro);
        res.status(500).json({ erro: "Não foi possível carregar a visão geral." });
    }
});

//admin: clientes do DB
app.get("/api/clientes", async (_req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id, usuario_id AS "usuarioId", nome, email FROM clientes',
        );
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro na DB:", erro);
        res.status(500).json({ erro: "Erro no banco de dados" });
    }
});

//admin: dados do cliente
app.get("/api/clientes/:id", async (req, res) => {
    const id = req.params.id;

    try {
        const resultadoCliente = await pool.query(
            `SELECT
        id,
        nome,
        email,
        criado_em AS "criadoEm"
        FROM clientes
        WHERE id = $1`,
            [id],
        );

        if (resultadoCliente.rows.length === 0) {
            res.status(404).json({ erro: "Cliente não encontrado." });
            return;
        }

        const [resultadoProjetos, resultadoSolicitacoes] = await Promise.all([
            pool.query(
                `SELECT
            id,
            titulo,
            status,
            arquivada_em AS "arquivadaEm"
            FROM projetos
            WHERE cliente_id = $1
            ORDER BY criada_em DESC`,
                [id],
            ),

            pool.query(
                `SELECT
            id,
            titulo,
            status
            FROM solicitacoes
            WHERE cliente_id = $1
            ORDER BY criada_em DESC`,
                [id],
            ),
        ]);

        res.json({
            ...resultadoCliente.rows[0],
            projetos: resultadoProjetos.rows,
            solicitacoes: resultadoSolicitacoes.rows,
        });
    } catch (erro) {
        console.error("Erro ao buscar cliente:", erro);

        res.status(500).json({ erro: "Não foi possível carregar o cliente." });
    }
});

//admin: carregar solicitações
app.get("/api/solicitacoes", async (_req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT 
            s.id,
            s.cliente_id AS "clienteId",
            c.nome AS "clienteNome",
            s.titulo,
            s.descricao,
            s.status,
            s.criada_em AS "criadaEm",
                s.orcamento_esperado::text AS "orcamentoEsperado",
                to_char(s.prazo_esperado, 'YYYY-MM-DD') AS "prazoEsperado",
            (SELECT p.id FROM projetos p WHERE p.solicitacao_id = s.id ORDER BY p.id LIMIT 1) AS "projetoId",
            COALESCE((SELECT json_agg(json_build_object('id', h.id, 'anterior', h.status_anterior, 'status', h.status_novo, 'criadaEm', h.criada_em) ORDER BY h.criada_em, h.id)
                FROM solicitacoes_decisoes h WHERE h.solicitacao_id = s.id), '[]'::json) AS historico
            FROM solicitacoes AS s
            INNER JOIN clientes as c
                ON c.id = s.cliente_id
            
            ORDER by s.criada_em DESC`,
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar as solicitações:", erro);

        res
            .status(500)
            .json({ erro: "Não foi possivel carregar as solicitações." });
    }
});

//cliente: carregar solicitações
app.get("/api/me/solicitacoes", async (_req, res) => {
    const clienteId = res.locals.cliente.id;

    try {
        const resultado = await pool.query(
            `
            SELECT
                s.id,
                s.titulo,
                s.descricao,
                s.status,
                s.criada_em AS "criadaEm",
                s.orcamento_esperado::text AS "orcamentoEsperado",
                to_char(s.prazo_esperado, 'YYYY-MM-DD') AS "prazoEsperado",
                (SELECT p.id FROM projetos p WHERE p.solicitacao_id = s.id AND p.cliente_id = s.cliente_id AND p.arquivada_em IS NULL ORDER BY p.id LIMIT 1) AS "projetoId",
                COALESCE((SELECT json_agg(json_build_object('id', h.id, 'anterior', h.status_anterior, 'status', h.status_novo, 'criadaEm', h.criada_em) ORDER BY h.criada_em, h.id)
                    FROM solicitacoes_decisoes h WHERE h.solicitacao_id = s.id), '[]'::json) AS historico
            FROM solicitacoes s
            WHERE s.cliente_id = $1
            ORDER BY s.criada_em DESC
        `,
            [clienteId],
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar solicitações do cliente:", erro);
        res
            .status(500)
            .json({ erro: "Não foi possível carregar suas solicitações." });
    }
});

//admin: projetos do DB
app.get("/api/projetos", async (req, res) => {
    const arquivados = req.query.arquivados === "true";

    try {
        const resultado = await pool.query(
            `SELECT
            p.id,
            p.cliente_id AS "clienteId",
            c.nome AS "clienteNome",
            p.solicitacao_id AS "solicitacaoId",
            p.titulo,
            p.descricao,
            p.status,
            p.criada_em AS "criadaEm",
            p.atualizada_em AS "atualizadaEm"
            FROM projetos AS p
            INNER JOIN clientes AS c
            ON c.id = p.cliente_id
            WHERE (p.arquivada_em IS NOT NULL) = $1
            ORDER BY p.criada_em DESC
            
            `,
            [arquivados],
        );
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao procurar os projetos", erro);
        res.status(500).json({ erro: "Não foi possivel carregas os projetos" });
    }
});

//admin: dados do projeto
app.get("/api/projetos/:id", async (req, res) => {
    const id = req.params.id;

    try {
        const resultado = await pool.query(
            `SELECT
            p.id,
            p.cliente_id AS "clienteId",
            c.nome AS "clienteNome",
            p.solicitacao_id AS "solicitacaoId",
            p.titulo,
            p.descricao,
            p.status,
            p.criada_em AS "criadaEm",
            p.atualizada_em AS "atualizadaEm",
            p.arquivada_em AS "arquivadaEm",
            p.valor_acordado::text AS "valorAcordado",
            to_char(p.prazo_acordado, 'YYYY-MM-DD') AS "prazoAcordado",
            p.tecnologias,
            p.progresso AS "progressoManual",
            p.modo_progresso AS "modoProgresso",
            funilador_progresso_projeto(p.id, p.modo_progresso, p.progresso) AS progresso,
            p.prioridade,
            p.observacoes_internas AS "observacoesInternas"
            FROM projetos AS p
            INNER JOIN clientes AS c
            ON c.id = p.cliente_id
            WHERE p.id = $1`,
            [id],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "projeto não encontrado" });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao buscar projeto:", erro);
        res.status(500).json({ erro: "Não foi possível carregar o projeto." });
    }
});

//cliente: carregar projetos
app.get("/api/me/projetos", async (_req, res) => {
    const clienteId = res.locals.cliente.id;

    try {
        const resultado = await pool.query(
            `
            SELECT
            id,
            titulo,
            descricao,
            status,
            criada_em AS "criadaEm",
            atualizada_em AS "atualizadaEm",
            valor_acordado::text AS "valorAcordado",
            to_char(prazo_acordado, 'YYYY-MM-DD') AS "prazoAcordado",
            tecnologias,
            modo_progresso AS "modoProgresso",
            funilador_progresso_projeto(id, modo_progresso, progresso) AS progresso
            FROM projetos
            WHERE cliente_id = $1
            AND arquivada_em IS NULL
            ORDER BY criada_em DESC
        `,
            [clienteId],
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar projetos do cliente:", erro);
        res.status(500).json({ erro: "Não foi possível carregar seus projetos." });
    }
});

//admin: marcos do projeto
app.get("/api/projetos/:id/marcos", async (req, res) => {
    try {res.json(await carregarMarcos(pool, req.params.id, null, res.locals.usuarioId));}
    catch (erro) {responderErroMarco(res, erro);}
});

//cliente: marcos do projeto
app.get("/api/me/projetos/:id/marcos", async (req, res) => {
    try {res.json(await carregarMarcos(pool, req.params.id, res.locals.cliente.id));}
    catch (erro) {responderErroMarco(res, erro);}
});

//admin: convites do DB
app.get("/api/convites", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
            v.id,
            v.token,
            v.cliente_id AS "clienteId",
            c.nome AS "clienteNome",
            v.criado_em AS "criadoEm",
            v.expira_em AS "expiraEm",
            v.usado_em AS "usadoEm",
            v.revogado_em AS "revogadoEm",
            v.cliente_aceitou_id AS "clienteAceitouId",
            v.usado_por_email AS "usadoPorEmail",
            ca.nome AS "clienteAceitouNome",
            CASE
            WHEN v.usado_em IS NOT NULL THEN 'utilizado'
            WHEN v.revogado_em IS NOT NULL THEN 'revogado'
            WHEN v.expira_em <= NOW() THEN 'expirado'
            ELSE 'pendente'
            END AS "estado"

            FROM convites AS v
            LEFT JOIN clientes AS c ON c.id = v.cliente_id
            LEFT JOIN clientes AS ca ON ca.id = v.cliente_aceitou_id
            ORDER BY v.criado_em DESC
        `);

        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar convites:", erro);
        res.status(500).json({ erro: "Não foi possível carregar os convites." });
    }
});

//ler convite
app.get("/api/convite/:token", async (req, res) => {
    const token = req.params.token;

    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        res.status(404).json({ erro: "Convite não encontrado." });
        return;
    }

    try {
        const resultado = await pool.query(
            `
            SELECT
            v.cliente_id AS "clienteId",
            c.nome AS "clienteNome",
            c.usuario_id AS "usuarioId",
            v.expira_em AS "expiraEm",

            CASE
            WHEN v.usado_em IS NOT NULL THEN 'utilizado'
            WHEN v.revogado_em IS NOT NULL THEN 'revogado'
            WHEN v.expira_em <= NOW() THEN 'expirado'
            ELSE 'pendente'
            END AS "estado"

            FROM convites AS v
            LEFT JOIN clientes AS c ON c.id = v.cliente_id
            WHERE v.token = $1
        `,
            [token],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "Convite não encontrado" });
            return;
        }

        const convite = resultado.rows[0];

        if (convite.estado !== "pendente") {
            res.status(410).json({ erro: `Este convite está ${convite.estado}.` });
            return;
        }

        if (convite.clienteId && convite.usuarioId !== null) {
            res.status(410).json({ erro: "Este cliente já possui acesso" });
            return;
        }

        res.json({
            tipo: convite.clienteId ? "vinculado" : "livre",
            clienteNome: convite.clienteNome,
            expiraEm: convite.expiraEm,
        });
    } catch (erro) {
        console.error("Erro ao validar convite:", erro);
        res.status(500).json({ erro: "Não foi possível validar o convite." });
    }
});

//admin: conversas
app.get("/api/conversas", async (req, res) => {
    const arquivadas = req.query.arquivadas === "true";
    const todas = req.query.todas === "true";

    try {
        const resultado = await pool.query(`
            SELECT cl.id AS "clienteId", cl.nome AS "clienteNome",
                COALESCE(json_agg(json_build_object(
                    'id', c.id, 'titulo', c.titulo, 'tipo', c.tipo,
                    'projetoId', c.projeto_id, 'criadaEm', c.criada_em,
                    'arquivadaEm', c.arquivada_em,
                    'naoLidas', COALESCE(n.total, 0),
                    'ultimaAtividadeEm', COALESCE(u.enviada_em, c.criada_em),
                    'reabertura', reab.dados
                ) ORDER BY CASE WHEN c.tipo = 'geral' THEN 0 ELSE 1 END,
                    c.criada_em DESC, c.id) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS conversas
            FROM clientes cl
            LEFT JOIN conversas c ON c.cliente_id = cl.id
                AND ($2::boolean OR (c.arquivada_em IS NOT NULL) = $1::boolean)
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS total FROM mensagens m
                WHERE m.conversa_id = c.id AND m.remetente_tipo = 'cliente'
                    AND NOT EXISTS (SELECT 1 FROM mensagens_leituras l
                        WHERE l.mensagem_id = m.id AND l.usuario_id = $3)
            ) n ON TRUE
            LEFT JOIN LATERAL (
                SELECT enviada_em FROM mensagens WHERE conversa_id = c.id
                ORDER BY enviada_em DESC, id DESC LIMIT 1
            ) u ON TRUE
            LEFT JOIN LATERAL (
                SELECT json_build_object('id', r.id, 'status', r.status,
                    'solicitadaEm', r.solicitada_em, 'decididaEm', r.decidida_em,
                    'justificativa', r.justificativa) AS dados
                FROM conversas_reaberturas r
                WHERE r.conversa_id = c.id AND r.ciclo_arquivamento = c.arquivada_em
                ORDER BY r.solicitada_em DESC, r.id DESC LIMIT 1
            ) reab ON TRUE
            GROUP BY cl.id, cl.nome
            HAVING $2::boolean OR NOT $1::boolean OR COUNT(c.id) > 0
            ORDER BY cl.nome, cl.id
        `, [arquivadas, todas, res.locals.usuarioId]);

        res.set("Cache-Control", "no-store");
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar conversas:", erro);
        res.status(500).json({erro: "Não foi possível carregar as conversas."});
    }
});

//admin: carregar mensagens
app.get("/api/conversas/:id/mensagens", rotaHistorico("admin"));

//cliente: conversas
app.get("/api/me/conversas", async (req, res) => {
    const arquivadas = req.query.arquivadas === "true";
    const todas = req.query.todas === "true";

    try {
        const resultado = await pool.query(`
            SELECT c.id, c.titulo, c.tipo, c.projeto_id AS "projetoId",
                c.criada_em AS "criadaEm", c.arquivada_em AS "arquivadaEm",
                COALESCE(n.total, 0) AS "naoLidas",
                COALESCE(u.enviada_em, c.criada_em) AS "ultimaAtividadeEm",
                reab.dados AS reabertura,
                (c.tipo <> 'geral' AND c.arquivada_em IS NULL AND o.usuario_id IS NOT NULL
                    AND o.ultima_admin_id IS NOT DISTINCT FROM ua.id) AS "ocultada"
            FROM conversas c
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS total FROM mensagens m
                WHERE m.conversa_id = c.id AND m.remetente_tipo = 'admin'
                    AND NOT EXISTS (SELECT 1 FROM mensagens_leituras l
                        WHERE l.mensagem_id = m.id AND l.usuario_id = $4)
            ) n ON TRUE
            LEFT JOIN LATERAL (
                SELECT enviada_em FROM mensagens WHERE conversa_id = c.id
                ORDER BY enviada_em DESC, id DESC LIMIT 1
            ) u ON TRUE
            LEFT JOIN LATERAL (
                SELECT json_build_object('id', r.id, 'status', r.status,
                    'solicitadaEm', r.solicitada_em, 'decididaEm', r.decidida_em,
                    'justificativa', r.justificativa) AS dados
                FROM conversas_reaberturas r
                WHERE r.conversa_id = c.id AND r.ciclo_arquivamento = c.arquivada_em
                ORDER BY r.solicitada_em DESC, r.id DESC LIMIT 1
            ) reab ON TRUE
            LEFT JOIN conversas_ocultas o ON o.conversa_id = c.id AND o.usuario_id = $4
            LEFT JOIN LATERAL (
                SELECT id FROM mensagens WHERE conversa_id = c.id AND remetente_tipo = 'admin'
                ORDER BY enviada_em DESC, id DESC LIMIT 1
            ) ua ON TRUE
            WHERE c.cliente_id = $1
                AND ($3::boolean OR (c.arquivada_em IS NOT NULL) = $2::boolean)
            ORDER BY CASE WHEN c.tipo = 'geral' THEN 0 ELSE 1 END, c.criada_em DESC, c.id
        `, [res.locals.cliente.id, arquivadas, todas, res.locals.usuarioId]);

        res.set("Cache-Control", "no-store");
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao buscar conversas do cliente:", erro);
        res.status(500).json({erro: "Não foi possível carregar as conversas."});
    }
});

//cliente: carregar mensagens
app.get("/api/me/conversas/:id/mensagens", rotaHistorico("cliente"));

//admin: contar não lidas
app.get("/api/conversas/nao-lidas", contarNaoLidas("admin"));

//cliente: contar não lidas
app.get("/api/me/conversas/nao-lidas", contarNaoLidas("cliente"));

//admin: listar notificações
app.get("/api/notificacoes", listarNotificacoes("admin"));

//cliente: listar notificações
app.get("/api/me/notificacoes", listarNotificacoes("cliente"));

//rotas POST

//admin: cadastrar cliente
app.post("/api/clientes", async (req, res) => {
    const nome = req.body?.nome;
    const email = req.body?.email;

    if (typeof nome !== "string" || nome.trim().length === 0) {
        res.status(400).json({ erro: "Nome é obrigatório" });
        return;
    }

    if (email != null && typeof email !== "string") {
        res.status(400).json({ erro: "E-mail invalido" });
        return;
    }

    const emailTratado =
        typeof email === "string" && email.trim() ? email.trim() : null;

    try {
        const resultado = await pool.query(
            `INSERT INTO clientes (nome,email)
            VALUES ($1, $2)
            RETURNING id, nome, email`,
            [nome.trim(), emailTratado],
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao cadastrar cliente", erro);
        res.status(500).json({ erro: "Falha ao cadastrar cliente" });
    }
});

//admin: criar solicitação
app.post("/api/solicitacoes", async (req, res) => {
    const clienteId = req.body?.clienteId;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;
    //se n tiver preenchido nem vai fodase
    if (
        typeof clienteId !== "string" ||
        clienteId.trim().length === 0 ||
        typeof titulo !== "string" ||
        titulo.trim().length === 0 ||
        typeof descricao !== "string" ||
        descricao.trim().length === 0
    ) {
        res
            .status(400)
            .json({ erro: "Titulo e descrição necessario, por favor ne!" });
        return;
    }

    try {
        const orcamento = valorComercial(req.body?.orcamentoEsperado);
        const prazo = prazoComercial(req.body?.prazoEsperado);
        const resultado = await pool.query(
            `INSERT INTO solicitacoes (cliente_id, titulo, descricao, orcamento_esperado, prazo_esperado)
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING 
            id,
            cliente_id AS "clienteId",
            titulo,
            descricao,
            status,
            criada_em AS "criadaEm",
            orcamento_esperado::text AS "orcamentoEsperado",
            to_char(prazo_esperado, 'YYYY-MM-DD') AS "prazoEsperado"`,
            [clienteId, titulo.trim(), descricao.trim(), orcamento, prazo],
        );
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        if (erro instanceof ErroConversa) {
            res.status(erro.status).json({erro: erro.message});
            return;
        }
        console.error("Erro ao criar solicitação:", erro);

        res.status(500).json({ erro: "Dessa vez não foi sua culpa" });
    }
});

//cliente: criar solicitação
app.post("/api/me/solicitacoes", async (req, res) => {
    const clienteId = res.locals.cliente.id;
    const { titulo, descricao } = req.body ?? {};

    if (
        typeof titulo !== "string" ||
        !titulo.trim() ||
        titulo.trim().length > 150
    ) {
        res
            .status(400)
            .json({ erro: "Informe um título válido de até 150 caracteres." });
        return;
    }

    if (
        typeof descricao !== "string" ||
        !descricao.trim() ||
        descricao.trim().length > 5000
    ) {
        res
            .status(400)
            .json({ erro: "Informe uma descrição válida de até 5000 caracteres." });
        return;
    }

    try {
        const orcamento = valorComercial(req.body?.orcamentoEsperado);
        const prazo = prazoComercial(req.body?.prazoEsperado);
        const resultado = await pool.query(
            `
            WITH criada AS (
                INSERT INTO solicitacoes (cliente_id, titulo, descricao, status, orcamento_esperado, prazo_esperado)
                VALUES ($1, $2, $3, 'pendente', $4, $5)
                RETURNING id, cliente_id, titulo, descricao, status, criada_em, orcamento_esperado, prazo_esperado
            ), notificada AS (
                INSERT INTO notificacoes (publico, cliente_id, tipo, referencia_id, titulo, resumo)
                SELECT 'admin', s.cliente_id, 'solicitacao', s.id, 'Nova solicitação',
                    left(c.nome || ' · ' || s.titulo, 180)
                FROM criada s JOIN clientes c ON c.id = s.cliente_id
            )
            SELECT id, titulo, descricao, status, criada_em AS "criadaEm",
                orcamento_esperado::text AS "orcamentoEsperado",
                to_char(prazo_esperado, 'YYYY-MM-DD') AS "prazoEsperado" FROM criada
        `,
            [clienteId, titulo.trim(), descricao.trim(), orcamento, prazo],
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        if (erro instanceof ErroConversa) {
            res.status(erro.status).json({erro: erro.message});
            return;
        }
        console.error("Erro ao criar solicitação do cliente:", erro);
        res.status(500).json({ erro: "Não foi possível criar sua solicitação." });
    }
});

//admin: criar projeto
app.post("/api/projetos", async (req, res) => {
    const clienteId = req.body?.clienteId;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;

    if (
        typeof clienteId !== "string" ||
        clienteId.trim().length === 0 ||
        typeof titulo !== "string" ||
        titulo.trim().length === 0 ||
        typeof descricao !== "string" ||
        descricao.trim().length === 0
    ) {
        res.status(400).json({
            erro: "Cliente, título e descrição são obrigatórios.",
        });
        return;
    }
    try {
        const resultado = await pool.query(
            `INSERT INTO projetos (cliente_id, titulo, descricao)
            VALUES ($1, $2, $3)
            RETURNING
            id,
            cliente_id AS "clienteId",
            solicitacao_id AS "solicitacaoId",
            titulo,
            descricao,
            status,
            criada_em AS "criadaEm",
            atualizada_em AS "atualizadaEm"`,
            [clienteId, titulo.trim(), descricao.trim()],
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error("Deu ruim ao criar o projeto", erro);
        res.status(500).json({ erro: "Não deu pra criar o projeto" });
    }
});

//admin: criar marco
app.post("/api/projetos/:id/marcos", async (req, res) => {
    const {id} = req.params;
    try {
        const dados = dadosMarco(req.body);
        const resultado = await transacaoConversa(async db => {
            if (await travarProjetoMarco(db, id) === "cancelado") throw new ErroConversa(409, "Projeto cancelado");
            await db.query(`
                INSERT INTO projetos_marcos (projeto_id, titulo, descricao, status, valor, prazo_entrega, vencimento, cobranca_iniciada, bloqueia_progresso, saldo_dispensado)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `, [id, ...dados]);
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.status(201).json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: registrar pagamento
app.post("/api/projetos/:id/marcos/:marcoId/pagamentos", async (req, res) => {
    const {id, marcoId} = req.params;
    try {
        const {pagamentoId, valor, recebidoEm} = req.body ?? {};
        if (!uuidConversa.test(marcoId) || typeof pagamentoId !== "string" || !uuidConversa.test(pagamentoId)) throw new ErroConversa(400, "Pagamento inválido");
        const quantia = valorComercial(valor);
        const data = prazoComercial(recebidoEm);
        if (!quantia || Number(quantia) <= 0 || !data) throw new ErroConversa(400, "Informe valor e data do pagamento");
        const resultado = await transacaoConversa(async db => {
            const statusProjeto = await travarProjetoMarco(db, id);
            const existente = await db.query(`SELECT marco_id, anulado_em, valor = $2::numeric AND recebido_em = $3::date AS igual FROM marcos_pagamentos WHERE id = $1`, [pagamentoId, quantia, data]);
            if (existente.rows.length) {
                if (existente.rows[0].marco_id !== marcoId || !existente.rows[0].igual) throw new ErroConversa(409, "Pagamento já registrado");
                if (existente.rows[0].anulado_em) throw new ErroConversa(409, "Este recebimento já foi anulado");
                const vinculo = await db.query(`SELECT 1 FROM projetos_marcos WHERE id = $1 AND projeto_id = $2`, [marcoId, id]);
                if (!vinculo.rows.length) throw new ErroConversa(404, "Marco não encontrado");
                return carregarMarcos(db, id, null, res.locals.usuarioId);
            }
            const marco = await db.query(`
                SELECT status, saldo_dispensado, cobranca_iniciada, saldo >= $3::numeric AS suficiente,
                    $4::date <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS data_valida
                FROM funilador_marcos_resumo WHERE id = $1 AND projeto_id = $2
            `, [marcoId, id, quantia, data]);
            const atual = marco.rows[0];
            if (!atual) throw new ErroConversa(404, "Marco não encontrado");
            if (!atual.data_valida) throw new ErroConversa(400, "Data de recebimento não pode ser futura");
            if (!atual.suficiente || atual.saldo_dispensado) throw new ErroConversa(409, "O valor excede o saldo pendente");
            if (statusProjeto === "cancelado" && !["concluido", "cancelado", "aguardando_validacao"].includes(atual.status) && !atual.cobranca_iniciada) throw new ErroConversa(409, "Marco de projeto cancelado");
            await db.query(`INSERT INTO marcos_pagamentos (id, marco_id, valor, recebido_em, usuario_id) VALUES ($1,$2,$3,$4,$5)`, [pagamentoId, marcoId, quantia, data, res.locals.usuarioId]);
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.status(201).json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: criar convite
app.post("/api/convites", async (req, res) => {
    const clienteId = req.body?.clienteId ?? null;

    const validadeHoras = req.body?.validadeHoras ?? 48;

    if (![24, 48, 168].includes(validadeHoras)) {
        res.status(400).json({ erro: "Prazo de validade inválido." });
        return;
    }

    if (
        clienteId !== null &&
        (typeof clienteId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                clienteId,
            ))
    ) {
        res.status(400).json({ erro: "ID do cliente inválido." });
        return;
    }

    try {
        if (clienteId !== null) {
            const cliente = await pool.query(
                `SELECT id, usuario_id
                FROM clientes
                WHERE id = $1`,
                [clienteId],
            );

            if (cliente.rows.length === 0) {
                res.status(404).json({ erro: "Cliente não encontrado." });
                return;
            }

            if (cliente.rows[0].usuario_id !== null) {
                res
                    .status(409)
                    .json({ erro: "Este cliente já possui uma conta vinculada." });
                return;
            }
        }

        const token = randomBytes(32).toString("base64url");

        const resultado = await pool.query(
            `INSERT INTO convites (cliente_id, token, expira_em)
            VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 hour'))
            RETURNING
            id,
            cliente_id AS "clienteId",
            criado_em AS "criadoEm",
            expira_em AS "expiraEm"`,
            [clienteId, token, validadeHoras],
        );

        res.status(201).json({ ...resultado.rows[0], token });
    } catch (erro) {
        console.error("Erro ao gerar convite", erro);
        res.status(500).json({ erro: "Não foi possível gerar o convite" });
    }
});

//aceitar convite
app.post("/api/convite/:token/aceitar", async (req, res) => {
    const token = req.params.token;
    const { nome, email, senha } = req.body ?? {};

    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        res.status(404).json({ erro: "Convite não encontrado." });
        return;
    }

    if (typeof nome !== "string" || !nome.trim() || nome.length > 150) {
        res.status(400).json({ erro: "Informe um nome válido." });
        return;
    }

    if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.length > 254
    ) {
        res.status(400).json({ erro: "Informe um e-mail válido." });
        return;
    }

    if (typeof senha !== "string" || senha.length < 8 || senha.length > 128) {
        res
            .status(400)
            .json({ erro: "A senha deve possuir entre 8 e 128 caracteres." });
        return;
    }

    const emailNormalizado = email.trim().toLowerCase();

    try {
        await dbCadastro.transaction().execute(async (trx) => {
            const resultado = await sql<{ id: string; cliente_id: string | null }>`
                SELECT id, cliente_id
                FROM convites
                WHERE token = ${token}
                AND usado_em IS NULL
                AND revogado_em IS NULL
                AND expira_em > clock_timestamp()
                FOR UPDATE
            `.execute(trx);

            const convite = resultado.rows[0];

            if (!convite) throw new ErroCadastro(410, "Convite indisponível.");

            let clienteId = convite.cliente_id;
            let nomeUsuario = nome.trim();

            if (clienteId) {
                const resultadoCliente = await sql<{
                    nome: string;
                    usuario_id: string | null;
                }>`
                    SELECT nome, usuario_id
                    FROM clientes
                    WHERE id = ${clienteId}
                    FOR UPDATE
                `.execute(trx);

                const cliente = resultadoCliente.rows[0];

                if (!cliente) throw new ErroCadastro(404, "Cliente não encontrado.");
                if (cliente.usuario_id !== null)
                    throw new ErroCadastro(409, "Este cliente já possui acesso.");

                nomeUsuario = cliente.nome;
            }

            const emailExistente = await sql`
                SELECT id
                FROM "user"
                WHERE LOWER(email) = ${emailNormalizado}
            `.execute(trx);

            if (emailExistente.rows.length > 0) {
                throw new ErroCadastro(
                    409,
                    "Este e-mail já está associado a uma conta.",
                );
            }

            const authCadastro = betterAuth({
                ...auth.options,
                database: { db: trx, type: "postgres", transaction: false },
                advanced: {
                    database: {
                        validateSchema: false,
                    },
                },
            });

            const { user } = await authCadastro.api.createUser({
                body: {
                    name: nomeUsuario,
                    email: emailNormalizado,
                    password: senha,
                    role: "user",
                },
            });

            if (clienteId) {
                await sql`
                    UPDATE clientes
                    SET usuario_id = ${user.id},
                        email = ${emailNormalizado}
                    WHERE id = ${clienteId}
                `.execute(trx);
            } else {
                const novoCliente = await sql<{ id: string }>`
                    INSERT INTO clientes (nome, email, usuario_id)
                    VALUES (${nomeUsuario}, ${emailNormalizado}, ${user.id})
                    RETURNING id
                `.execute(trx);

                clienteId = novoCliente.rows[0].id;
            }

            const consumido = await sql`
                UPDATE convites
                SET usado_em = clock_timestamp(),
                cliente_aceitou_id = ${clienteId},
                usado_por_email = ${emailNormalizado}
                WHERE id = ${convite.id}
                AND usado_em IS NULL
                AND revogado_em IS NULL
                AND expira_em > clock_timestamp()
                RETURNING id
            `.execute(trx);

            if (consumido.rows.length === 0) {
                throw new ErroCadastro(410, "Convite indisponível.");
            }
        });

        res.status(201).json({ mensagem: "Conta criada com sucesso." });
    } catch (erro) {
        if (erro instanceof ErroCadastro) {
            res.status(erro.status).json({ erro: erro.message });
            return;
        }

        if (
            typeof erro === "object" &&
            erro !== null &&
            "code" in erro &&
            erro.code === "23505"
        ) {
            res.status(409).json({ erro: "Já existe um cadastro conflitante." });
            return;
        }

        console.error("Falha na aceitação do convite.", erro);
        res.status(500).json({ erro: "Não foi possível concluir o cadastro." });
    }
});

//admin: criar conversa
app.post("/api/conversas", async (req, res) => {
    const { clienteId, projetoId, titulo, tipo } = req.body ?? {};

    const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (typeof clienteId !== "string" || !uuidValido.test(clienteId)) {
        res.status(400).json({ erro: "Cliente inválido." });
        return;
    }

    if (tipo !== "avulsa" && tipo !== "projeto") {
        res.status(400).json({ erro: "Tipo de conversa inválido." });
        return;
    }

    if (
        tipo === "projeto" &&
        (typeof projetoId !== "string" || !uuidValido.test(projetoId))
    ) {
        res.status(400).json({ erro: "Informe um projeto válido." });
        return;
    }

    if (tipo === "avulsa" && projetoId != null) {
        res
            .status(400)
            .json({ erro: "Uma conversa avulsa não deve possuir um projeto." });
        return;
    }

    if (
        tipo === "avulsa" &&
        (typeof titulo !== "string" || !titulo.trim() || titulo.trim().length > 150)
    ) {
        res
            .status(400)
            .json({ erro: "Informe um título válido de até 150 caracteres." });
        return;
    }

    try {
        const resultado = await pool.query(
            `
            INSERT INTO conversas (cliente_id, projeto_id, titulo, tipo)
            SELECT
                cl.id,
                p.id,
                CASE
                    WHEN $3::text = 'projeto' THEN p.titulo
                    ELSE $4::text
                END,
                $3::text
            FROM clientes cl
            LEFT JOIN projetos p
                ON p.id = $2::uuid
                AND p.cliente_id = cl.id
                AND p.arquivada_em IS NULL
            WHERE cl.id = $1
                AND ($3::text <> 'projeto' OR p.id IS NOT NULL)
            RETURNING
                id,
                cliente_id AS "clienteId",
                projeto_id AS "projetoId",
                titulo,
                tipo,
                criada_em AS "criadaEm"
        `,
            [
                clienteId,
                tipo === "projeto" ? projetoId : null,
                tipo,
                tipo === "avulsa" ? titulo.trim() : null,
            ],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "Cliente ou projeto indisponível." });
            return;
        }

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        if (
            typeof erro === "object" &&
            erro !== null &&
            "code" in erro &&
            erro.code === "23505"
        ) {
            res.status(409).json({ erro: "Este projeto já possui uma conversa." });
            return;
        }

        console.error("Erro ao criar conversa:", erro);
        res.status(500).json({ erro: "Não foi possível criar a conversa." });
    }
});

//admin e cliente: criar proposta
app.post("/api/conversas/:id/propostas", rotaCriarProposta("admin"));
app.post("/api/me/conversas/:id/propostas", rotaCriarProposta("cliente"));

//admin: mandar mensagem
app.post("/api/conversas/:id/mensagens", async (req, res) => {
    const { id } = req.params;
    const { conteudo } = req.body ?? {};

    const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidValido.test(id)) {
        res.status(400).json({ erro: "Conversa inválida." });
        return;
    }

    if (
        typeof conteudo !== "string" ||
        !conteudo.trim() ||
        conteudo.trim().length > 5000
    ) {
        res
            .status(400)
            .json({ erro: "Informe uma mensagem válida de até 5000 caracteres." });
        return;
    }

    try {
        const sessao = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!sessao) {
            res.status(401).json({ erro: "Sessão indisponível." });
            return;
        }

        const resultado = await pool.query(
            `
            WITH conversa_disponivel AS (
                SELECT id
                FROM conversas
                WHERE id = $1
                    AND arquivada_em IS NULL
                FOR UPDATE
            )
            INSERT INTO mensagens (
                conversa_id,
                remetente_id,
                remetente_tipo,
                conteudo, enviada_em
            )
            SELECT id, $2, 'admin', $3, clock_timestamp()
            FROM conversa_disponivel
            RETURNING
                id,
                remetente_tipo AS "remetenteTipo",
                conteudo,
                to_char(enviada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "enviadaEm"
        `,
            [id, sessao.user.id, conteudo.trim()],
        );

        if (resultado.rows.length === 0) {
            const estado = await pool.query(`
                SELECT arquivada_em AS "arquivadaEm"
                FROM conversas
                WHERE id = $1
            `, [id]);

            if (estado.rows[0]?.arquivadaEm) {
                res.status(409).json({
                    erro: "Esta conversa foi arquivada e está disponível somente para consulta.",
                    codigo: "CONVERSA_ARQUIVADA",
                });
                return;
            }

            res.status(404).json({ erro: "Conversa não encontrada ou indisponível." });
            return;
        }

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao enviar mensagem:", erro);
        res.status(500).json({ erro: "Não foi possível enviar a mensagem." });
    }
});

//cliente: pedir reabertura
app.post("/api/me/conversas/:id/reaberturas", async (req, res) => {
    const {id} = req.params;
    if (!uuidConversa.test(id)) {res.status(400).json({erro: "Conversa inválida."}); return;}
    try {
        const pedido = await transacaoConversa(async db => {
            const conversa = await db.query(`SELECT id FROM conversas WHERE id = $1 AND cliente_id = $2
                AND tipo <> 'geral' AND arquivada_em IS NOT NULL FOR UPDATE`, [id, res.locals.cliente.id]);
            if (!conversa.rowCount) throw new ErroConversa(404, "Conversa arquivada não encontrada.");
            const resultado = await db.query(`INSERT INTO conversas_reaberturas (conversa_id, ciclo_arquivamento, solicitada_por)
                SELECT id, arquivada_em, $2 FROM conversas WHERE id = $1
                ON CONFLICT (conversa_id) WHERE status = 'pendente' DO NOTHING
                RETURNING id, status, solicitada_em AS "solicitadaEm", decidida_em AS "decididaEm", justificativa`, [id, res.locals.usuarioId]);
            if (!resultado.rowCount) throw new ErroConversa(409, "Já existe uma solicitação de reabertura pendente.");
            return resultado.rows[0];
        });
        res.status(201).json({reabertura: pedido});
    } catch (erro) {responderErroConversa(res, erro);}
});

//cliente: mandar mensagem
app.post("/api/me/conversas/:id/mensagens", async (req, res) => {
    const { id } = req.params;
    const { conteudo } = req.body ?? {};
    const cliente = res.locals.cliente;

    const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidValido.test(id)) {
        res.status(400).json({ erro: "Conversa inválida." });
        return;
    }

    if (
        typeof conteudo !== "string" ||
        !conteudo.trim() ||
        conteudo.trim().length > 5000
    ) {
        res
            .status(400)
            .json({ erro: "Informe uma mensagem válida de até 5000 caracteres." });
        return;
    }

    try {
        const sessao = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!sessao) {
            res.status(401).json({ erro: "Sessão indisponível." });
            return;
        }

        const resultado = await pool.query(
            `
            WITH conversa_disponivel AS (
                SELECT id
                FROM conversas
                WHERE id = $1
                    AND cliente_id = $2
                    AND arquivada_em IS NULL
                FOR UPDATE
            )
            INSERT INTO mensagens (
                conversa_id,
                remetente_id,
                remetente_tipo,
                conteudo
            )
            SELECT id, $3, 'cliente', $4
            FROM conversa_disponivel
            RETURNING
                id,
                remetente_tipo AS "remetenteTipo",
                conteudo,
                to_char(enviada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "enviadaEm"
        `,
            [id, cliente.id, sessao.user.id, conteudo.trim()],
        );

        if (resultado.rows.length === 0) {
            const estado = await pool.query(`
                SELECT arquivada_em AS "arquivadaEm"
                FROM conversas
                WHERE id = $1 AND cliente_id = $2
            `, [id, cliente.id]);

            if (estado.rows[0]?.arquivadaEm) {
                res.status(409).json({
                    erro: "Esta conversa foi arquivada e está disponível somente para consulta.",
                    codigo: "CONVERSA_ARQUIVADA",
                });
                return;
            }

            res.status(404).json({ erro: "Conversa não encontrada ou indisponível." });
            return;
        }

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao enviar mensagem do cliente:", erro);
        res.status(500).json({ erro: "Não foi possível enviar a mensagem." });
    }
});

//admin: registrar leituras
app.post("/api/conversas/:id/leituras", registrarLeituras("admin"));

//cliente: registrar leituras
app.post("/api/me/conversas/:id/leituras", registrarLeituras("cliente"));

//admin: registrar leituras
app.post("/api/notificacoes/leituras", lerNotificacoes("admin"));

//cliente: registrar leituras
app.post("/api/me/notificacoes/leituras", lerNotificacoes("cliente"));

//rotas PATCH

//admin: editar cliente
app.patch("/api/clientes/:id", async (req, res) => {
    const id = req.params.id;
    const nome = req.body?.nome;
    const email = req.body?.email;

    if (typeof nome !== "string" || nome.trim().length === 0) {
        res.status(400).json({ erro: "Nome obrigatorio" });
        return;
    }

    if (email != null && typeof email !== "string") {
        res.status(400).json({ erro: "Email invalido" });
        return;
    }

    const emailTratado =
        typeof email === "string" && email.trim() ? email.trim() : null;

    try {
        const resultado = await pool.query(
            `UPDATE clientes
            SET nome = $1, email = $2
            WHERE id = $3
            Returning id, nome, email`,
            [nome.trim(), emailTratado, id],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "Clientes não encontra" });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao editar cliente:", erro);
        res.status(500).json({ erro: "Falha ao editar cliente" });
    }
});

//admin: decidir solicitação
app.patch("/api/solicitacoes/:id/status", async (req, res) => {
    const {id} = req.params;
    const {status} = req.body ?? {};

    if (typeof id !== "string" || !uuidConversa.test(id)) {
        res.status(400).json({erro: "Solicitação inválida"});
        return;
    }
    if (status !== "aprovada" && status !== "recusada" && status !== "pendente") {
        res.status(400).json({erro: "Status inválido"});
        return;
    }

    try {
        const dados = await transacaoConversa(async db => {
            const resultado = await db.query(`
                SELECT id, cliente_id, titulo, descricao, status
                FROM solicitacoes WHERE id = $1 FOR UPDATE
            `, [id]);
            const solicitacao = resultado.rows[0];
            if (!solicitacao) throw new ErroConversa(404, "Solicitação não encontrada");

            const permitida = solicitacao.status === "pendente" && (status === "aprovada" || status === "recusada")
                || solicitacao.status === "recusada" && status === "pendente";
            if (!permitida) throw new ErroConversa(409, "Esta decisão não pode ser alterada");

            await db.query(`UPDATE solicitacoes SET status = $1 WHERE id = $2`, [status, id]);

            let projetoId: string | null = null;
            if (status === "aprovada") {
                const existente = await db.query(`SELECT id FROM projetos WHERE solicitacao_id = $1 LIMIT 1`, [id]);
                if (existente.rows.length) throw new ErroConversa(409, "Esta solicitação já possui um projeto");
                const projeto = await db.query(`
                    INSERT INTO projetos (cliente_id, solicitacao_id, titulo, descricao)
                    VALUES ($1, $2, $3, $4) RETURNING id
                `, [solicitacao.cliente_id, id, solicitacao.titulo, solicitacao.descricao]);
                projetoId = projeto.rows[0].id;
            }

            //registrar a decisão
            await db.query(`
                INSERT INTO solicitacoes_decisoes (solicitacao_id, usuario_id, status_anterior, status_novo)
                VALUES ($1, $2, $3, $4)
            `, [id, res.locals.usuarioId, solicitacao.status, status]);
            const historico = await db.query(`
                SELECT id, status_anterior AS anterior, status_novo AS status, criada_em AS "criadaEm"
                FROM solicitacoes_decisoes WHERE solicitacao_id = $1 ORDER BY criada_em, id
            `, [id]);
            return {id, status, projetoId, historico: historico.rows};
        });
        res.json(dados);
    } catch (erro) {
        if (erro instanceof ErroConversa) {
            res.status(erro.status).json({erro: erro.message});
            return;
        }
        console.error("Erro ao alterar solicitação:", erro);
        res.status(500).json({erro: "Não foi possível alterar a decisão"});
    }
});

//admin: alterar status do projeto
app.patch("/api/projetos/:id/status", async (req, res) => {
    const id = req.params.id;
    const status = req.body?.status;

    const statusPermitidos = [
        "planejado",
        "em_andamento",
        "concluido",
        "cancelado",
    ];

    if (!statusPermitidos.includes(status)) {
        res.status(400).json({
            erro: "Status de projeto inválido.",
        });
        return;
    }

    try {
        const resultado = await pool.query(
            `UPDATE projetos
            SET status = $1,
            atualizada_em = NOW()
            WHERE id = $2
            AND arquivada_em IS NULL
            RETURNING
            id,
            status,
            atualizada_em AS "atualizadaEm"`,
            [status, id],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "Projeto não encontrado." });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao atualizar projeto:", erro);
        res.status(500).json({ erro: "Não foi possível atualizar o projeto." });
    }
});

//admin: editar projeto
app.patch("/api/projetos/:id", async (req, res) => {
    const id = req.params.id;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;

    if (
        typeof titulo !== "string" ||
        titulo.trim().length === 0 ||
        typeof descricao !== "string" ||
        descricao.trim().length === 0
    ) {
        res.status(400).json({ erro: "Título e descrição são obrigatórios" });
        return;
    }

    try {
        const resultado = await pool.query(
            `UPDATE projetos
        SET
        titulo = $1,
        descricao = $2,
        atualizada_em = NOW()
        WHERE id = $3
        AND arquivada_em IS NULL
        RETURNING
        id,
        titulo,
        descricao,
        atualizada_em AS "atualizadaEm"`,
            [titulo.trim(), descricao.trim(), id],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "Projeto não encontrado ou arquivado" });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao editar projeto", erro);

        res.status(500).json({ erro: "Não foi possível editar o projeto" });
    }
});

//admin: editar dados comerciais do projeto
app.patch("/api/projetos/:id/comercial", async (req, res) => {
    const {id} = req.params;
    if (typeof id !== "string" || !uuidConversa.test(id)) {
        res.status(400).json({erro: "Projeto inválido"});
        return;
    }
    try {
        const corpo = req.body;
        const campos = ["valorAcordado", "prazoAcordado", "prioridade", "progresso", "tecnologias", "observacoesInternas"];
        if (!corpo || typeof corpo !== "object" || Array.isArray(corpo) || campos.some(campo => !Object.hasOwn(corpo, campo))) {
            throw new ErroConversa(400, "Dados incompletos");
        }
        const dados = dadosComerciaisProjeto(corpo);
        const modo = corpo.modoProgresso ?? "manual";
        if (modo !== "manual" && modo !== "marcos") throw new ErroConversa(400, "Modo de progresso inválido");
        const resultado = await pool.query(`
            UPDATE projetos SET
                valor_acordado = $2,
                prazo_acordado = $3,
                prioridade = $4,
                progresso = $5,
                tecnologias = $6,
                observacoes_internas = $7,
                modo_progresso = $8,
                atualizada_em = NOW()
            WHERE id = $1 AND arquivada_em IS NULL
            RETURNING id, atualizada_em AS "atualizadaEm",
                valor_acordado::text AS "valorAcordado",
                to_char(prazo_acordado, 'YYYY-MM-DD') AS "prazoAcordado",
                prioridade, progresso AS "progressoManual", modo_progresso AS "modoProgresso",
                funilador_progresso_projeto(id, modo_progresso, progresso) AS progresso, tecnologias,
                observacoes_internas AS "observacoesInternas"
        `, [id, ...dados, modo]);
        if (!resultado.rows.length) throw new ErroConversa(404, "Projeto não encontrado ou arquivado");
        res.json(resultado.rows[0]);
    } catch (erro) {
        if (erro instanceof ErroConversa) {
            res.status(erro.status).json({erro: erro.message});
            return;
        }
        console.error("Erro ao editar dados comerciais:", erro);
        res.status(500).json({erro: "Não foi possível salvar os dados"});
    }
});

//admin: ocultar ou exibir marco
app.patch("/api/projetos/:id/marcos/:marcoId/visibilidade", async (req, res) => {
    const {id, marcoId} = req.params;
    const {oculto} = req.body ?? {};
    try {
        if (!uuidConversa.test(marcoId) || typeof oculto !== "boolean") throw new ErroConversa(400, "Marco inválido");
        const resultado = await transacaoConversa(async db => {
            await travarProjetoMarco(db, id);
            const marco = await db.query(`SELECT id FROM projetos_marcos WHERE id = $1 AND projeto_id = $2`, [marcoId, id]);
            if (!marco.rows.length) throw new ErroConversa(404, "Marco não encontrado");
            if (oculto) await db.query(`INSERT INTO marcos_ocultos (marco_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [marcoId, res.locals.usuarioId]);
            else await db.query(`DELETE FROM marcos_ocultos WHERE marco_id = $1 AND usuario_id = $2`, [marcoId, res.locals.usuarioId]);
            return carregarMarcos(db, id, null, res.locals.usuarioId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: cancelar marco ou revisar saldo
app.patch("/api/projetos/:id/marcos/:marcoId/cancelamento", async (req, res) => {
    const {id, marcoId} = req.params;
    const {dispensar, valor, recebido, saldoDispensado, status} = req.body ?? {};
    try {
        if (!uuidConversa.test(marcoId) || typeof dispensar !== "boolean" || typeof saldoDispensado !== "boolean" || typeof status !== "string") throw new ErroConversa(400, "Dados inválidos");
        const valorAnterior = valorComercial(valor);
        const recebidoAnterior = valorComercial(recebido);
        if (recebidoAnterior === null) throw new ErroConversa(400, "Dados inválidos");
        const resultado = await transacaoConversa(async db => {
            await travarProjetoMarco(db, id);
            const marco = await db.query(`SELECT status, saldo_dispensado, (valor IS NOT DISTINCT FROM $3::numeric AND recebido = $4::numeric) AS igual FROM funilador_marcos_resumo WHERE id = $1 AND projeto_id = $2`, [marcoId, id, valorAnterior, recebidoAnterior]);
            if (!marco.rows.length) throw new ErroConversa(404, "Marco não encontrado");
            const atual = marco.rows[0];
            if (!atual.igual || atual.saldo_dispensado !== saldoDispensado || atual.status !== status) throw new ErroConversa(409, "O marco mudou. Atualize e tente novamente");
            await db.query(`UPDATE projetos_marcos SET status = 'cancelado', saldo_dispensado = $3, bloqueia_progresso = FALSE, atualizada_em = NOW() WHERE id = $1 AND projeto_id = $2`, [marcoId, id, dispensar]);
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin e cliente: decidir proposta
app.patch("/api/conversas/:id/propostas/:propostaId", rotaDecidirProposta("admin"));
app.patch("/api/me/conversas/:id/propostas/:propostaId", rotaDecidirProposta("cliente"));

//cliente: validar entrega
app.patch("/api/me/projetos/:id/marcos/:marcoId/validar", async (req, res) => {
    const {id, marcoId} = req.params;
    try {
        const {versao} = req.body ?? {};
        if (!uuidConversa.test(id) || !uuidConversa.test(marcoId) || typeof versao !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(versao)) throw new ErroConversa(400, "Entrega inválida");
        const resultado = await transacaoConversa(async db => {
            const clienteId = res.locals.cliente.id;
            const projeto = await db.query(`SELECT titulo, status FROM projetos WHERE id = $1 AND cliente_id = $2 AND arquivada_em IS NULL FOR UPDATE`, [id, clienteId]);
            if (!projeto.rows.length) throw new ErroConversa(404, "Projeto não encontrado");
            if (projeto.rows[0].status === "cancelado") throw new ErroConversa(409, "Projeto cancelado");
            const marco = await db.query(`UPDATE projetos_marcos SET status = 'concluido', atualizada_em = clock_timestamp() WHERE id = $1 AND projeto_id = $2 AND status = 'aguardando_validacao' AND to_char(atualizada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $3 RETURNING titulo`, [marcoId, id, versao]);
            if (!marco.rows.length) throw new ErroConversa(409, "A entrega mudou. Atualize e confira novamente");
            await db.query(`INSERT INTO marcos_validacoes (marco_id, usuario_id, versao) VALUES ($1,$2,$3)`, [marcoId, res.locals.usuarioId, versao]);
            await db.query(`UPDATE projetos SET atualizada_em = NOW() WHERE id = $1`, [id]);
            await db.query(`INSERT INTO notificacoes (publico,cliente_id,tipo,referencia_id,titulo,resumo) VALUES ('admin',$1,'projeto',$2,'Entrega validada',left($3,180))`, [clienteId, id, `${projeto.rows[0].titulo} · ${marco.rows[0].titulo}`]);
            return carregarMarcos(db, id, clienteId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: editar marco
app.patch("/api/projetos/:id/marcos/:marcoId", async (req, res) => {
    const {id, marcoId} = req.params;
    try {
        if (!uuidConversa.test(marcoId)) throw new ErroConversa(400, "Marco inválido");
        const dados = dadosMarco(req.body);
        const resultado = await transacaoConversa(async db => {
            const statusProjeto = await travarProjetoMarco(db, id);
            const marco = await db.query(`
                SELECT status, (recebido = 0 OR ($3::numeric IS NOT NULL AND $3::numeric >= recebido)) AS valor_valido
                FROM funilador_marcos_resumo WHERE id = $1 AND projeto_id = $2
            `, [marcoId, id, dados[3]]);
            const atual = marco.rows[0];
            if (!atual) throw new ErroConversa(404, "Marco não encontrado");
            if (!atual.valor_valido) throw new ErroConversa(409, "O valor não pode ser menor que o recebido");
            if (statusProjeto === "cancelado" && dados[2] !== "cancelado" && dados[2] !== atual.status) throw new ErroConversa(409, "Projeto cancelado");
            await db.query(`
                UPDATE projetos_marcos SET titulo = $3, descricao = $4, status = $5, valor = $6,
                    prazo_entrega = $7, vencimento = $8, cobranca_iniciada = $9,
                    bloqueia_progresso = $10, saldo_dispensado = $11, atualizada_em = NOW()
                WHERE id = $1 AND projeto_id = $2
            `, [marcoId, id, ...dados]);
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: anular recebimento
app.patch("/api/projetos/:id/marcos/:marcoId/pagamentos/:pagamentoId/anular", async (req, res) => {
    const {id, marcoId, pagamentoId} = req.params;
    try {
        if (!uuidConversa.test(marcoId) || !uuidConversa.test(pagamentoId)) throw new ErroConversa(400, "Pagamento inválido");
        const resultado = await transacaoConversa(async db => {
            await travarProjetoMarco(db, id);
            const pagamento = await db.query(`
                SELECT p.anulado_em FROM marcos_pagamentos p
                JOIN projetos_marcos m ON m.id = p.marco_id
                WHERE p.id = $1 AND m.id = $2 AND m.projeto_id = $3
            `, [pagamentoId, marcoId, id]);
            if (!pagamento.rows.length) throw new ErroConversa(404, "Recebimento não encontrado");
            if (pagamento.rows[0].anulado_em) throw new ErroConversa(409, "Este recebimento já foi anulado");
            await db.query(`UPDATE marcos_pagamentos SET anulado_em = NOW(), anulado_por = $2 WHERE id = $1`, [pagamentoId, res.locals.usuarioId]);
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: arquivar projeto
app.patch("/api/projetos/:id/arquivar", async (req, res) => {
    const id = req.params.id;

    try {
        const resultado = await pool.query(
            `UPDATE projetos
        SET arquivada_em = NOW(),
        atualizada_em = NOW()
        WHERE id = $1
        AND arquivada_em IS NULL
        RETURNING
        id,
        status,
        arquivada_em AS "arquivadaEm",
        atualizada_em AS "atualizadaEm"`,
            [id],
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({ erro: "Projeto não encontrado ou já arquivado" });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao arquivar projeto", erro);

        res.status(500).json({ erro: "Não foi possível arquivar o projeto" });
    }
});

//admin: restaurar projeto
app.patch("/api/projetos/:id/restaurar", async (req, res) => {
    const id = req.params.id;

    try {
        const resultado = await pool.query(
            `UPDATE projetos
        SET arquivada_em = NULL,
        atualizada_em = NOW()
        WHERE id = $1
        AND arquivada_em IS NOT NULL
        RETURNING
        id,
        status,
        arquivada_em AS "arquivadaEm",
        atualizada_em AS "atualizadaEm"`,
            [id],
        );

        if (resultado.rows.length === 0) {
            res
                .status(404)
                .json({ erro: "Projeto não encontrado ou não está arquivado." });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao restaurar projeto:", erro);

        res.status(500).json({ erro: "Não foi possível restaurar o projeto." });
    }
});

//admin: revogar convite
app.patch("/api/convites/:id/revogar", async (req, res) => {
    const id = req.params.id;

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
        res.status(400).json({ erro: "ID do convite inválido." });
        return;
    }

    try {
        const resultado = await pool.query(
            `
            UPDATE convites
            SET revogado_em = NOW()
            WHERE id = $1
                AND usado_em IS NULL
                AND revogado_em IS NULL
                AND expira_em > NOW()

            RETURNING
                id,
                revogado_em AS "revogadoEm"
        `,
            [id],
        );

        if (resultado.rows.length === 0) {
            res
                .status(409)
                .json({
                    erro: "Convite não encontrado ou indisponível para revogação.",
                });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao revogar convite:", erro);
        res.status(500).json({ erro: "Não foi possível revogar o convite." });
    }
});

//admin: renomear conversa
app.patch("/api/conversas/:id", async (req, res) => {
    const { id } = req.params;
    const { titulo } = req.body ?? {};

    const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidValido.test(id)) {
        res.status(400).json({ erro: "Conversa inválida." });
        return;
    }

    if (
        typeof titulo !== "string" ||
        !titulo.trim() ||
        titulo.trim().length > 150
    ) {
        res
            .status(400)
            .json({ erro: "Informe um título válido de até 150 caracteres." });
        return;
    }

    try {
        const resultado = await pool.query(
            `
            UPDATE conversas
            SET titulo = $2
            WHERE id = $1
                AND tipo <> 'geral'
                AND arquivada_em IS NULL
            RETURNING
                id,
                cliente_id AS "clienteId",
                projeto_id AS "projetoId",
                titulo,
                tipo,
                criada_em AS "criadaEm"
        `,
            [id, titulo.trim()],
        );

        if (resultado.rows.length === 0) {
            res
                .status(404)
                .json({ erro: "Conversa não encontrada ou indisponível para edição." });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao renomear conversa:", erro);
        res.status(500).json({ erro: "Não foi possível renomear a conversa." });
    }
});

//admin: arquivar conversa
app.patch("/api/conversas/:id/arquivar", async (req, res) => {
    const { id } = req.params;

    const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidValido.test(id)) {
        res.status(400).json({ erro: "Conversa inválida." });
        return;
    }

    try {
        const resultado = await pool.query(
            `
            UPDATE conversas
            SET arquivada_em = NOW()
            WHERE id = $1
                AND tipo <> 'geral'
                AND arquivada_em IS NULL
            RETURNING id, arquivada_em AS "arquivadaEm"
        `,
            [id],
        );

        if (resultado.rows.length === 0) {
            res
                .status(404)
                .json({ erro: "Conversa indisponível para arquivamento." });
            return;
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao arquivar conversa:", erro);
        res.status(500).json({ erro: "Não foi possível arquivar a conversa." });
    }
});

//admin: decidir reabertura
app.patch("/api/conversas/:id/reaberturas/:pedidoId", async (req, res) => {
    const {id, pedidoId} = req.params;
    const {status, justificativa} = req.body ?? {};
    if (!uuidConversa.test(id) || !uuidConversa.test(pedidoId) || !["aprovada", "recusada"].includes(status) ||
        (justificativa != null && (typeof justificativa !== "string" || justificativa.trim().length > 1000))) {
        res.status(400).json({erro: "Pedido, decisão ou justificativa inválida."}); return;
    }
    try {
        const dados = await transacaoConversa(async db => {
            const conversa = await db.query(`SELECT id FROM conversas WHERE id = $1 AND tipo <> 'geral'
                AND arquivada_em IS NOT NULL FOR UPDATE`, [id]);
            if (!conversa.rowCount) throw new ErroConversa(409, "Conversa já restaurada ou indisponível.");
            const resultado = await db.query(`UPDATE conversas_reaberturas r SET status = $3,
                decidida_por = $4, decidida_em = clock_timestamp(), justificativa = $5
                FROM conversas c WHERE r.id = $2 AND r.conversa_id = $1 AND c.id = r.conversa_id
                AND r.ciclo_arquivamento = c.arquivada_em AND r.status = 'pendente'
                RETURNING r.id, r.status, r.solicitada_em AS "solicitadaEm", r.decidida_em AS "decididaEm", r.justificativa`,
                [id, pedidoId, status, res.locals.usuarioId, justificativa?.trim() || null]);
            if (!resultado.rowCount) throw new ErroConversa(409, "Pedido já decidido ou indisponível.");
            if (status === "aprovada") await db.query("UPDATE conversas SET arquivada_em = NULL WHERE id = $1", [id]);
            return {reabertura: resultado.rows[0], restaurada: status === "aprovada"};
        });
        res.json(dados);
    } catch (erro) {responderErroConversa(res, erro);}
});

//admin: restaurar conversa
app.patch("/api/conversas/:id/restaurar", async (req, res) => {
    const {id} = req.params;
    if (!uuidConversa.test(id)) {res.status(400).json({erro: "Conversa inválida."}); return;}
    try {
        const dados = await transacaoConversa(async db => {
            const conversa = await db.query(`SELECT id FROM conversas WHERE id = $1 AND tipo <> 'geral'
                AND arquivada_em IS NOT NULL FOR UPDATE`, [id]);
            if (!conversa.rowCount) throw new ErroConversa(404, "Conversa indisponível para restauração.");
            await db.query(`UPDATE conversas_reaberturas r SET status = 'aprovada',
                decidida_por = $2, decidida_em = clock_timestamp(), justificativa = 'Restauração administrativa'
                FROM conversas c WHERE c.id = $1 AND r.conversa_id = c.id
                AND r.ciclo_arquivamento = c.arquivada_em AND r.status = 'pendente'`, [id, res.locals.usuarioId]);
            const resultado = await db.query(`UPDATE conversas SET arquivada_em = NULL WHERE id = $1
                RETURNING id, arquivada_em AS "arquivadaEm"`, [id]);
            return resultado.rows[0];
        });
        res.json(dados);
    } catch (erro) {responderErroConversa(res, erro);}
});

//cliente: ocultar conversa
app.patch("/api/me/conversas/:id/ocultar", async (req, res) => {
    const {id} = req.params;
    const {ocultada} = req.body ?? {};
    if (!uuidConversa.test(id) || typeof ocultada !== "boolean") {res.status(400).json({erro: "Preferência inválida."}); return;}
    try {
        await transacaoConversa(async db => {
            const conversa = await db.query(`SELECT id FROM conversas WHERE id = $1 AND cliente_id = $2
                AND tipo <> 'geral' AND arquivada_em IS NULL FOR UPDATE`, [id, res.locals.cliente.id]);
            if (!conversa.rowCount) throw new ErroConversa(404, "Conversa ativa não encontrada.");
            if (ocultada) {
                await db.query(`INSERT INTO conversas_ocultas (conversa_id, usuario_id, ultima_admin_id)
                    VALUES ($1, $2, (SELECT id FROM mensagens WHERE conversa_id = $1 AND remetente_tipo = 'admin'
                        ORDER BY enviada_em DESC, id DESC LIMIT 1))
                    ON CONFLICT (conversa_id, usuario_id) DO UPDATE SET ocultada_em = clock_timestamp(),
                        ultima_admin_id = EXCLUDED.ultima_admin_id`, [id, res.locals.usuarioId]);
            } else {
                await db.query("DELETE FROM conversas_ocultas WHERE conversa_id = $1 AND usuario_id = $2", [id, res.locals.usuarioId]);
            }
        });
        res.json({id, ocultada});
    } catch (erro) {responderErroConversa(res, erro);}
});

//rotas DELETE

//admin: limpar marcos pendentes
app.delete("/api/projetos/:id/marcos", async (req, res) => {
    const {id} = req.params;
    const {ids} = req.body ?? {};
    try {
        if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(v => typeof v !== "string" || !uuidConversa.test(v))) throw new ErroConversa(400, "Selecione até 500 marcos válidos");
        const selecionados = [...new Set(ids)];
        const resultado = await transacaoConversa(async db => {
            await travarProjetoMarco(db, id);
            const excluidos = await db.query(`
                DELETE FROM projetos_marcos m WHERE m.projeto_id = $1 AND m.id = ANY($2::uuid[])
                    AND m.status = 'pendente' AND NOT m.cobranca_iniciada
                    AND NOT EXISTS (SELECT 1 FROM marcos_pagamentos p WHERE p.marco_id = m.id)
                    AND NOT EXISTS (SELECT 1 FROM projetos_propostas pp WHERE pp.marco_id = m.id)
                    AND NOT EXISTS (SELECT 1 FROM marcos_validacoes v WHERE v.marco_id = m.id)
                RETURNING m.id
            `, [id, selecionados]);
            if (excluidos.rowCount !== selecionados.length) throw new ErroConversa(409, "Alguns marcos mudaram. Atualize e tente novamente");
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: excluir marco
app.delete("/api/projetos/:id/marcos/:marcoId", async (req, res) => {
    const {id, marcoId} = req.params;
    try {
        if (!uuidConversa.test(marcoId)) throw new ErroConversa(400, "Marco inválido");
        const resultado = await transacaoConversa(async db => {
            await travarProjetoMarco(db, id);
            const marco = await db.query(`
                SELECT m.status, m.cobranca_iniciada,
                    EXISTS (SELECT 1 FROM marcos_pagamentos p WHERE p.marco_id = m.id) AS tem_pagamentos,
                    EXISTS (SELECT 1 FROM projetos_propostas pp WHERE pp.marco_id = m.id) AS acordado,
                    EXISTS (SELECT 1 FROM marcos_validacoes v WHERE v.marco_id = m.id) AS validado
                FROM projetos_marcos m WHERE m.id = $1 AND m.projeto_id = $2
            `, [marcoId, id]);
            const atual = marco.rows[0];
            if (!atual) throw new ErroConversa(404, "Marco não encontrado");
            if (atual.tem_pagamentos) throw new ErroConversa(409, "Este marco possui pagamentos registrados");
            if (atual.acordado || atual.validado) throw new ErroConversa(409, "Marco com histórico de acordo ou validação. Cancele em vez de excluir");
            if (atual.status !== "pendente" || atual.cobranca_iniciada) throw new ErroConversa(409, "Cancele este marco em vez de excluir");
            await db.query(`DELETE FROM projetos_marcos WHERE id = $1 AND projeto_id = $2`, [marcoId, id]);
            return atualizarProjetoMarco(db, id, res.locals.usuarioId);
        });
        res.json(resultado);
    } catch (erro) {responderErroMarco(res, erro);}
});

//admin: excluir convite
app.delete("/api/convites/:id", async (req, res) => {
    const id = req.params.id;

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
        res.status(400).json({ erro: "ID do convite inválido" });
        return;
    }

    try {
        const resultado = await pool.query(
            `DELETE FROM convites WHERE id = $1 RETURNING id`,
            [id],
        );

        if (resultado.rowCount === 0) {
            res.status(404).json({ erro: "Convite não encontrado" });
            return;
        }

        res.status(204).end();
    } catch (erro) {
        console.error("Erro ao excluir convite:", erro);
        res.status(500).json({ erro: "Não foi possível excluir o convite" });
    }
});

//admin: limpar notificações
app.delete("/api/notificacoes", limparNotificacoes("admin"));

//cliente: limpar notificações
app.delete("/api/me/notificacoes", limparNotificacoes("cliente"));

//acesso a API
app.listen(3001, () => {
    console.log("api disponivel na porta: http://localhost:3001");
});
