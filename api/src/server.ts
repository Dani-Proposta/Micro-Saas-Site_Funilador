//precisa pra se quer existir
import express from "express";

import type { PoolClient } from "pg";

import { pool } from "./db.ts";

import { randomUUID, randomBytes, createHash } from "node:crypto";

import { Kysely, PostgresDialect, sql } from "kysely";

import { betterAuth } from "better-auth";

import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

import type { Request, Response, NextFunction } from "express";

import type { Solicitacao } from "./solicitacao.ts";

import type { Cliente } from "./cliente.ts";

import { auth } from "./auth.ts";

import { error } from "node:console";

const app = express();

const handlerAuth = toNodeHandler(auth);
//serializar login e troca de credenciais nesta instância
let filaCredenciais: Promise<void> = Promise.resolve();
let operacoesCredenciais = 0;
async function comCredenciais<T>(acao: () => Promise<T>): Promise<T> {
    if (operacoesCredenciais >= 50) throw new ErroConversa(503, "Muitas operações de acesso. Tente novamente.");
    operacoesCredenciais++;
    const anterior = filaCredenciais;
    let liberar!: () => void;
    filaCredenciais = new Promise<void>(resolve => {liberar = resolve;});
    try {await anterior; return await acao();}
    finally {operacoesCredenciais--; liberar();}
}
//apenas os endpoints de autenticação utilizados pelo painel
app.all("/api/auth/*splat", async (req, res) => {
    const permitidos = (req.path === "/api/auth/get-session" && ["GET","POST"].includes(req.method)) ||
        (["/api/auth/sign-in/email","/api/auth/sign-out"].includes(req.path) && req.method === "POST");
    if (!permitidos) {res.status(404).json({erro:"Rota indisponível"}); return;}
    try {
        if (req.path === "/api/auth/sign-in/email") await comCredenciais(async () => {await handlerAuth(req, res);});
        else await handlerAuth(req, res);
    } catch (erro) {if (!res.headersSent) responderErroConversa(res, erro);}
});

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

        const bloqueio = await pool.query(`SELECT 1 FROM usuarios_configuracoes WHERE usuario_id = $1 AND senha_provisoria_ate IS NOT NULL`, [sessao.user.id]);
        if (bloqueio.rows.length) {res.status(403).json({erro: "Escolha uma nova senha para acessar o portal", codigo: "TROCA_SENHA_OBRIGATORIA"}); return;}

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

//conta: acesso do próprio usuário
async function exigirConta(req: Request, res: Response, next: NextFunction) {
    try {
        const sessao = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
        if (!sessao) {res.status(401).json({erro: "Você precisa fazer login"}); return;}
        const papeis = sessao.user.role?.split(",") ?? [];
        const admin = papeis.includes("admin");
        if (!admin && !papeis.includes("user")) {res.status(403).json({erro: "Acesso restrito"}); return;}
        res.locals.usuarioId = sessao.user.id;
        res.locals.contaAdmin = admin;
        res.locals.sessaoId = sessao.session.id;
        if (!admin && !(req.method === "PATCH" && req.path === "/senha")) {
            const bloqueio = await pool.query(`SELECT 1 FROM usuarios_configuracoes WHERE usuario_id = $1 AND senha_provisoria_ate IS NOT NULL`, [sessao.user.id]);
            if (bloqueio.rows.length) {res.status(403).json({erro: "Escolha uma nova senha para acessar o portal", codigo: "TROCA_SENHA_OBRIGATORIA"}); return;}
        }
        next();
    } catch (erro) {
        console.error("Erro ao verificar conta:", erro);
        res.status(500).json({erro: "Não foi possível verificar a conta"});
    }
}

app.use("/api/conta", exigirConta);

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
                        criada_em AS "criadaEm", quantidade, marco_id AS "marcoId",
                        CASE WHEN quantidade > 0 AND (titulo = 'Lembrete de pagamento' OR titulo IN ('Nova solicitação', 'Pedido de reabertura', 'Negociação · Nova proposta', 'Negociação · Contraproposta') OR titulo IN ('Marco aguardando validação', 'Marco aguardando pagamento')) THEN 'importante' ELSE 'normal' END AS prioridade
                    FROM agrupadas WHERE ordem = 1
                ), pagina AS (
                    SELECT * FROM grupos ORDER BY (prioridade = 'importante') DESC, "criadaEm" DESC, id DESC LIMIT 20 OFFSET $4
                )
                SELECT (SELECT COUNT(*)::int FROM grupos WHERE quantidade > 0) AS total,
                    (SELECT COUNT(*)::int FROM grupos) AS "totalGrupos",
                    COALESCE((SELECT json_agg(p ORDER BY (p.prioridade = 'importante') DESC, p."criadaEm" DESC, p.id DESC) FROM pagina p), '[]'::json) AS itens
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
            const {id} = req.params;
            if (typeof id !== "string" || !uuidConversa.test(id)) throw new ErroConversa(400, "Conversa inválida");
            const dados = dadosProposta(req.body);
            const resultado = await transacaoConversa(async db => {
                const projeto = await travarNegociacao(db, id, lado === "cliente" ? res.locals.cliente.id : null);
                return criarProposta(db, id, res.locals.usuarioId, lado, projeto, dados);
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
            if (typeof id !== "string" || !uuidConversa.test(id) || typeof propostaId !== "string" || !uuidConversa.test(propostaId) || !["aceitar", "recusar", "contrapor", "retirar"].includes(acao)) throw new ErroConversa(400, "Decisão inválida");
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

//conta: dados pessoais e preferências
async function carregarConta(db: PoolClient | typeof pool, usuarioId: string, admin: boolean) {
    const resultado = await db.query(`
        SELECT COALESCE(c.nome, u.name) AS nome, u.email, $2::boolean AS admin,
            cfg.tema, CASE WHEN NOT $2::boolean AND cfg.nome_alterado_em + interval '6 hours' > NOW()
                THEN cfg.nome_alterado_em + interval '6 hours' END AS "proximaAlteracaoNome"
        FROM "user" u
        LEFT JOIN clientes c ON c.usuario_id = u.id AND NOT $2::boolean
        LEFT JOIN usuarios_configuracoes cfg ON cfg.usuario_id = u.id
        WHERE u.id = $1 AND ($2::boolean OR c.id IS NOT NULL)
    `, [usuarioId, admin]);
    if (!resultado.rows.length) throw new ErroConversa(404, "Conta não encontrada");
    return resultado.rows[0];
}

function nomeConta(valor: unknown) {
    if (typeof valor !== "string" || !valor.trim() || valor.trim().length > 150) {
        throw new ErroConversa(400, "Informe um nome válido de até 150 caracteres");
    }
    return valor.trim();
}

//recuperação de acesso
function hashRecuperacao(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function senhaValida(valor: unknown): valor is string {
    return typeof valor === "string" && valor.length >= 8 && valor.length <= 128;
}

const tentativasAcesso = new Map<string, {total: number; ate: number}>();
function limitarAcesso(chave: string, limite = 10) {
    const agora = Date.now();
    for (const [id, item] of tentativasAcesso) if (item.ate <= agora) tentativasAcesso.delete(id);
    const item = tentativasAcesso.get(chave);
    if (!item) {
        if (tentativasAcesso.size >= 5000) throw new ErroConversa(429, "Muitas tentativas. Tente novamente mais tarde.");
        tentativasAcesso.set(chave, {total: 1, ate: agora + 600000});
    } else {
        if (item.total >= limite) throw new ErroConversa(429, "Muitas tentativas. Tente novamente mais tarde.");
        item.total++;
    }
}

function exigirJsonAcesso(req: Request) {
    if (!req.is("application/json")) throw new ErroConversa(415, "Envie dados em JSON");
    const origem = req.get("origin");
    const origens = Array.isArray(auth.options.trustedOrigins) ? auth.options.trustedOrigins : [];
    const permitidas = [auth.options.baseURL, ...origens, process.env.BETTER_AUTH_URL].filter((v): v is string => typeof v === "string").map(v => new URL(v).origin);
    if (req.get("sec-fetch-site") === "cross-site" || (origem && !permitidas.includes(origem))) throw new ErroConversa(403, "Origem não autorizada");
}

async function travarUsuarioAcesso(db: PoolClient, usuarioId: string) {
    const usuario = (await db.query(`SELECT id, role FROM "user" WHERE id = $1 FOR UPDATE`, [usuarioId])).rows[0];
    if (!usuario) throw new ErroConversa(404, "Conta não encontrada");
    return usuario;
}

async function contaCredencial(db: PoolClient, usuarioId: string) {
    const dados = await db.query(`SELECT id, password FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential' FOR UPDATE`, [usuarioId]);
    if (dados.rows.length !== 1 || !dados.rows[0].password) throw new ErroConversa(409, "Conta de acesso indisponível");
    return dados.rows[0] as {id: string; password: string};
}

async function confirmarAdminAcesso(db: PoolClient, usuarioId: string, senha: unknown) {
    if (!senhaValida(senha)) throw new ErroConversa(400, "Informe sua senha atual");
    const conta = await contaCredencial(db, usuarioId);
    const contexto = await auth.$context;
    if (!await contexto.password.verify({hash: conta.password, password: senha})) throw new ErroConversa(403, "Senha administrativa incorreta");
}

async function clienteAcesso(db: PoolClient, id: string) {
    if (!uuidConversa.test(id)) throw new ErroConversa(400, "Cliente inválido");
    const cliente = (await db.query(`SELECT usuario_id FROM clientes WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!cliente?.usuario_id) throw new ErroConversa(404, "Cliente sem conta vinculada");
    const usuario = await travarUsuarioAcesso(db, cliente.usuario_id);
    const papeis = String(usuario.role ?? "").split(",");
    if (!papeis.includes("user") || papeis.includes("admin")) throw new ErroConversa(403, "Conta indisponível para recuperação administrativa");
    return cliente.usuario_id as string;
}

async function invalidarRecuperacoes(db: PoolClient, usuarioId: string, tipo: "link" | "provisoria" | null = null) {
    await db.query(`UPDATE usuarios_recuperacoes SET revogada_em = clock_timestamp() WHERE usuario_id = $1 AND tipo IN ('link','provisoria') AND ($2::text IS NULL OR tipo = $2) AND usada_em IS NULL AND revogada_em IS NULL`, [usuarioId, tipo]);
}

async function trocarCredencial(db: PoolClient, usuarioId: string, senha: string, manterSessao: string | null = null) {
    const conta = await contaCredencial(db, usuarioId);
    const contexto = await auth.$context;
    const hash = await contexto.password.hash(senha);
    await db.query(`UPDATE "account" SET password = $2, "updatedAt" = NOW() WHERE id = $1`, [conta.id, hash]);
    await db.query(`DELETE FROM "session" WHERE "userId" = $1 AND ($2::text IS NULL OR id <> $2)`, [usuarioId, manterSessao]);
}

//rotas GET

//verificar conexão com api
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});

//conta: consultar dados pessoais
app.get("/api/conta", async (_req, res) => {
    try {
        const dados = await carregarConta(pool, res.locals.usuarioId, res.locals.contaAdmin);
        res.set("Cache-Control", "no-store").json(dados);
    } catch (erro) {responderErroConversa(res, erro);}
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

//admin: pendências operacionais
app.get("/api/dashboard/pendencias", async (_req, res) => {
    try {
        const resultado = await pool.query(`
            WITH periodo AS (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje),
            ativos AS (
                SELECT p.*, c.nome AS cliente FROM projetos p JOIN clientes c ON c.id = p.cliente_id
                WHERE p.arquivada_em IS NULL AND p.status IN ('planejado','em_andamento')
            ), pagamentos AS (
                SELECT m.id, m.projeto_id, m.titulo, m.vencimento, m.saldo, m.cobranca_iniciada, m.bloqueia_progresso,
                    p.titulo AS projeto, c.nome AS cliente
                FROM funilador_marcos_resumo m JOIN projetos p ON p.id = m.projeto_id JOIN clientes c ON c.id = p.cliente_id
                WHERE m.saldo > 0 AND NOT (p.status = 'cancelado' AND NOT m.cobranca_iniciada
                    AND m.status NOT IN ('concluido','cancelado','aguardando_validacao'))
            ), ultimas AS (
                SELECT cv.id, cv.projeto_id, cv.titulo, c.nome AS cliente, msg.remetente_tipo, msg.enviada_em,
                    COALESCE(msg.enviada_em, cv.criada_em) AS atividade
                FROM conversas cv JOIN clientes c ON c.id = cv.cliente_id
                LEFT JOIN LATERAL (SELECT remetente_tipo, enviada_em FROM mensagens WHERE conversa_id = cv.id
                    ORDER BY enviada_em DESC, id DESC LIMIT 1) msg ON TRUE
                WHERE cv.arquivada_em IS NULL
            ), pendencias AS (
                SELECT 'pagamento_atrasado'::text AS categoria, m.titulo AS titulo, m.projeto || ' · ' || m.cliente AS subtitulo,
                    m.projeto_id AS projeto_id, m.id AS marco_id, NULL::uuid AS conversa_id, m.vencimento AS data,
                    m.saldo::text AS valor, 'Pagamento vencido'::text AS detalhe
                FROM pagamentos m CROSS JOIN periodo WHERE m.vencimento < hoje
                UNION ALL
                SELECT 'pagamento_pendente', m.titulo, m.projeto || ' · ' || m.cliente, m.projeto_id, m.id, NULL, m.vencimento,
                    m.saldo::text, CASE WHEN m.bloqueia_progresso THEN 'Aguardando pagamento para prosseguir' ELSE 'Cobrança iniciada' END
                FROM pagamentos m CROSS JOIN periodo WHERE (m.cobranca_iniciada OR m.bloqueia_progresso) AND (m.vencimento IS NULL OR m.vencimento >= hoje)
                UNION ALL
                SELECT CASE WHEN p.prazo_acordado < hoje THEN 'entrega_atrasada' ELSE 'entrega_proxima' END,
                    p.titulo, p.cliente, p.id, NULL, NULL, p.prazo_acordado, NULL, 'Prazo do projeto'
                FROM ativos p CROSS JOIN periodo WHERE p.prazo_acordado <= hoje + 7
                UNION ALL
                SELECT CASE WHEN m.prazo_entrega < hoje THEN 'entrega_atrasada' ELSE 'entrega_proxima' END,
                    m.titulo, p.titulo || ' · ' || p.cliente, p.id, m.id, NULL, m.prazo_entrega, NULL, 'Prazo do marco'
                FROM projetos_marcos m JOIN ativos p ON p.id = m.projeto_id CROSS JOIN periodo
                WHERE m.status IN ('pendente','em_andamento') AND m.prazo_entrega <= hoje + 7
                UNION ALL
                SELECT 'prioridade_alta', p.titulo, p.cliente, p.id, NULL, NULL, p.prazo_acordado, NULL, 'Prioridade alta'
                FROM ativos p WHERE p.prioridade = 'alta'
                UNION ALL
                SELECT 'sem_atualizacao', p.titulo, p.cliente, p.id, NULL, NULL,
                    (p.atualizada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Sem atualização há pelo menos 7 dias'
                FROM ativos p WHERE p.status = 'em_andamento' AND p.atualizada_em <= NOW() - interval '7 days'
                UNION ALL
                SELECT 'aguardando_resposta', u.titulo, u.cliente, u.projeto_id, NULL, u.id,
                    (u.enviada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Cliente aguarda resposta há pelo menos 24 horas'
                FROM ultimas u WHERE u.remetente_tipo = 'cliente' AND u.enviada_em <= NOW() - interval '24 hours'
                UNION ALL
                SELECT 'conversa_inativa', u.titulo, u.cliente, p.id, NULL, u.id,
                    (u.atividade AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Sem mensagens há pelo menos 7 dias'
                FROM ultimas u JOIN ativos p ON p.id = u.projeto_id
                WHERE p.status = 'em_andamento' AND u.atividade <= NOW() - interval '7 days'
                    AND NOT (COALESCE(u.remetente_tipo,'') = 'cliente' AND u.enviada_em <= NOW() - interval '24 hours')
                UNION ALL
                SELECT 'proposta_pendente', n.titulo, p.titulo || ' · ' || p.cliente, p.id, NULL, cv.id,
                    (n.criada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL,
                    CASE WHEN n.autor_tipo = 'cliente' THEN 'Aguardando sua resposta' ELSE 'Aguardando resposta do cliente' END
                FROM projetos_propostas n JOIN conversas cv ON cv.id = n.conversa_id JOIN ativos p ON p.id = cv.projeto_id
                WHERE n.status = 'pendente' AND cv.arquivada_em IS NULL
                UNION ALL
                SELECT 'validacao_pendente', m.titulo, p.titulo || ' · ' || p.cliente, p.id, m.id, NULL,
                    (m.atualizada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Aguardando validação do cliente'
                FROM projetos_marcos m JOIN ativos p ON p.id = m.projeto_id WHERE m.status = 'aguardando_validacao'
                UNION ALL
                SELECT 'reabertura_pendente', cv.titulo, c.nome, cv.projeto_id, NULL, cv.id,
                    (rr.solicitada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Solicitação de reabertura'
                FROM conversas_reaberturas rr JOIN conversas cv ON cv.id = rr.conversa_id JOIN clientes c ON c.id = cv.cliente_id
                WHERE rr.status = 'pendente' AND cv.arquivada_em IS NOT NULL
            ), ordenadas AS (
                SELECT *, COUNT(*) OVER (PARTITION BY categoria)::int AS total,
                    SUM(valor::numeric) OVER (PARTITION BY categoria)::text AS total_valor,
                    ROW_NUMBER() OVER (PARTITION BY categoria ORDER BY data NULLS LAST, titulo, projeto_id, marco_id, conversa_id) AS ordem
                FROM pendencias
            )
            SELECT categoria, titulo, subtitulo, projeto_id AS "projetoId", marco_id AS "marcoId", conversa_id AS "conversaId",
                to_char(data,'YYYY-MM-DD') AS data, valor, detalhe, total, total_valor AS "totalValor"
            FROM ordenadas WHERE ordem <= 100 ORDER BY categoria, ordem
        `);
        res.set("Cache-Control", "no-store");
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao carregar pendências:", erro);
        res.status(500).json({erro: "Não foi possível carregar as pendências"});
    }
});

//admin: resumo financeiro
app.get("/api/dashboard/financeiro", async (_req, res) => {
    try {
        const resultado = await pool.query(`
            WITH periodo AS (
                SELECT hoje, date_trunc('month', hoje::timestamp)::date AS inicio,
                    (date_trunc('month', hoje::timestamp) + interval '1 month')::date AS proximo,
                    (date_trunc('month', hoje::timestamp) + interval '6 months')::date AS limite
                FROM (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje) d
            ), recebimentos AS (
                SELECT pg.id, pg.valor, pg.recebido_em, m.projeto_id, m.titulo AS marco,
                    p.titulo AS projeto, c.nome AS cliente
                FROM marcos_pagamentos pg JOIN projetos_marcos m ON m.id = pg.marco_id
                JOIN projetos p ON p.id = m.projeto_id JOIN clientes c ON c.id = p.cliente_id
                WHERE pg.anulado_em IS NULL
            ), pagos AS (
                SELECT m.id, COALESCE(SUM(pg.valor) FILTER (WHERE pg.anulado_em IS NULL), 0) AS recebido
                FROM projetos_marcos m LEFT JOIN marcos_pagamentos pg ON pg.marco_id = m.id GROUP BY m.id
            ), marcos AS (
                SELECT m.id, m.projeto_id, m.titulo AS marco, p.titulo AS projeto, c.nome AS cliente,
                    m.vencimento, m.cobranca_iniciada, m.bloqueia_progresso,
                    p.arquivada_em IS NOT NULL AS arquivado,
                    CASE WHEN m.saldo_dispensado THEN pg.recebido ELSE COALESCE(m.valor,0) END AS distribuido,
                    CASE WHEN m.saldo_dispensado OR (p.status = 'cancelado' AND NOT m.cobranca_iniciada
                        AND m.status NOT IN ('concluido','cancelado','aguardando_validacao')) THEN 0
                        ELSE GREATEST(COALESCE(m.valor,0) - pg.recebido, 0) END AS saldo
                FROM projetos_marcos m JOIN pagos pg ON pg.id = m.id
                JOIN projetos p ON p.id = m.projeto_id JOIN clientes c ON c.id = p.cliente_id
            ), pendentes AS (
                SELECT m.*, CASE WHEN vencimento IS NULL THEN 'sem_data'
                    WHEN vencimento < hoje THEN 'atrasado'
                    WHEN vencimento < proximo THEN 'mes' ELSE 'futuro' END AS categoria
                FROM marcos m CROSS JOIN periodo WHERE saldo > 0
            ), distribuicao AS (
                SELECT projeto_id, SUM(distribuido) AS total FROM marcos GROUP BY projeto_id
            ), meses AS (
                SELECT g::date AS mes FROM periodo, LATERAL generate_series(inicio::timestamp, (limite - interval '1 month')::timestamp, interval '1 month') g
            )
            SELECT to_char(hoje,'YYYY-MM-DD') AS hoje,
                COALESCE((SELECT SUM(valor) FROM recebimentos WHERE recebido_em >= inicio AND recebido_em < proximo),0)::text AS "recebidoMes",
                COALESCE((SELECT SUM(saldo) FROM pendentes WHERE categoria = 'mes'),0)::text AS "aReceberMes",
                (COALESCE((SELECT SUM(valor) FROM recebimentos WHERE recebido_em >= inicio AND recebido_em < proximo),0) + COALESCE((SELECT SUM(saldo) FROM pendentes WHERE categoria = 'mes'),0))::text AS "totalMes",
                COALESCE((SELECT SUM(saldo) FROM pendentes WHERE categoria = 'futuro'),0)::text AS futuro,
                COALESCE((SELECT SUM(saldo) FROM pendentes WHERE categoria = 'atrasado'),0)::text AS atrasado,
                COALESCE((SELECT SUM(saldo) FROM pendentes WHERE categoria = 'sem_data'),0)::text AS "semData",
                COALESCE((SELECT SUM(saldo) FROM pendentes),0)::text AS "totalPendente",
                COALESCE((SELECT SUM(saldo) FROM pendentes WHERE vencimento >= limite),0)::text AS "aposPrevisao",
                COALESCE((SELECT SUM(GREATEST(p.valor_acordado - COALESCE(d.total,0),0)) FROM projetos p LEFT JOIN distribuicao d ON d.projeto_id = p.id
                    WHERE p.status IN ('planejado','em_andamento','concluido') AND p.arquivada_em IS NULL AND p.valor_acordado IS NOT NULL),0)::text AS "naoDistribuido",
                COALESCE((SELECT SUM(GREATEST(COALESCE(d.total,0) - p.valor_acordado,0)) FROM projetos p LEFT JOIN distribuicao d ON d.projeto_id = p.id
                    WHERE p.status <> 'cancelado' AND p.arquivada_em IS NULL AND p.valor_acordado IS NOT NULL),0)::text AS excedente,
                (SELECT COUNT(*)::int FROM pendentes) AS "quantidadePendentes",
                (SELECT COUNT(*)::int FROM recebimentos WHERE recebido_em >= inicio AND recebido_em < proximo) AS "quantidadeRecebimentos",
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('mes',to_char(mes,'YYYY-MM'),
                    'recebido',COALESCE((SELECT SUM(valor) FROM recebimentos WHERE recebido_em >= mes AND recebido_em < mes + interval '1 month'),0)::text,
                    'previsto',COALESCE((SELECT SUM(saldo) FROM pendentes WHERE categoria IN ('mes','futuro') AND vencimento >= mes AND vencimento < mes + interval '1 month'),0)::text) ORDER BY mes),'[]'::jsonb) FROM meses) AS meses,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'projetoId',projeto_id,'projeto',projeto,'marco',marco,'cliente',cliente,
                    'vencimento',to_char(vencimento,'YYYY-MM-DD'),'saldo',saldo::text,'categoria',categoria,'arquivado',arquivado,
                    'cobrancaIniciada',cobranca_iniciada,'bloqueiaProgresso',bloqueia_progresso) ORDER BY vencimento NULLS LAST,id),'[]'::jsonb)
                    FROM (SELECT * FROM (SELECT pendentes.*, ROW_NUMBER() OVER (PARTITION BY categoria ORDER BY vencimento NULLS LAST,id) AS ordem FROM pendentes) por_categoria WHERE ordem <= 100) itens) AS pendencias,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'projetoId',projeto_id,'projeto',projeto,'marco',marco,'cliente',cliente,
                    'valor',valor::text,'data',to_char(recebido_em,'YYYY-MM-DD')) ORDER BY recebido_em DESC,id DESC),'[]'::jsonb)
                    FROM (SELECT * FROM recebimentos WHERE recebido_em >= inicio AND recebido_em < proximo ORDER BY recebido_em DESC,id DESC LIMIT 100) itens) AS recebimentos
            FROM periodo
        `);
        res.set("Cache-Control", "no-store");
        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao carregar financeiro:", erro);
        res.status(500).json({erro: "Não foi possível carregar o financeiro"});
    }
});

//admin: consultar registros financeiros
app.get("/api/dashboard/financeiro/detalhes", async (req, res) => {
    try {
        const {categoria = "todos", mes, cliente, projeto, pagina = "1"} = req.query;
        if (typeof categoria !== "string" || !["todos", "atrasado", "mes", "futuro", "sem_data", "cobrados", "nao_cobrados", "recebidos", "cancelados"].includes(categoria)) throw new ErroConversa(400, "Categoria inválida");
        if (mes !== undefined && (typeof mes !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mes))) throw new ErroConversa(400, "Mês inválido");
        if (cliente !== undefined && (typeof cliente !== "string" || !uuidConversa.test(cliente))) throw new ErroConversa(400, "Cliente inválido");
        if (projeto !== undefined && (typeof projeto !== "string" || !uuidConversa.test(projeto))) throw new ErroConversa(400, "Projeto inválido");
        if (typeof pagina !== "string" || !/^[1-9]\d{0,5}$/.test(pagina)) throw new ErroConversa(400, "Página inválida");
        const resultado = await pool.query(`
            WITH periodo AS (
                SELECT hoje, (date_trunc('month', hoje::timestamp) + interval '1 month')::date AS proximo,
                    COALESCE($2::date, date_trunc('month', hoje::timestamp)::date) AS inicio
                FROM (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje) d
            ), base AS (
                SELECT m.id, m.projeto_id, m.titulo AS marco, p.titulo AS projeto, c.nome AS cliente,
                    c.id AS cliente_id, m.status, p.status AS projeto_status, p.arquivada_em IS NOT NULL AS arquivado,
                    m.vencimento, m.valor, m.recebido, m.cobranca_iniciada, m.bloqueia_progresso, m.saldo_dispensado,
                    CASE WHEN m.saldo_dispensado OR (p.status = 'cancelado' AND NOT m.cobranca_iniciada
                        AND m.status NOT IN ('concluido','cancelado','aguardando_validacao')) THEN 0
                        ELSE COALESCE(m.saldo,0) END AS saldo
                FROM funilador_marcos_resumo m JOIN projetos p ON p.id = m.projeto_id JOIN clientes c ON c.id = p.cliente_id
                WHERE ($3::uuid IS NULL OR c.id = $3) AND ($4::uuid IS NULL OR p.id = $4)
            ), marcos AS (
                SELECT b.*, CASE WHEN vencimento IS NULL THEN 'sem_data' WHEN vencimento < hoje THEN 'atrasado'
                    WHEN vencimento < proximo THEN 'mes' ELSE 'futuro' END AS categoria
                FROM base b CROSS JOIN periodo
            ), registros AS (
                SELECT m.id, m.id AS marco_id, m.projeto_id, m.cliente_id, m.marco, m.projeto, m.cliente,
                    m.vencimento AS data, m.saldo AS valor, m.categoria, m.arquivado, m.cobranca_iniciada,
                    m.bloqueia_progresso, m.status, m.projeto_status, m.saldo_dispensado, NULL::timestamptz AS anulado_em,
                    m.valor AS valor_marco, m.recebido
                FROM marcos m WHERE $1 <> 'recebidos' AND (
                    ($1 = 'cancelados' AND (m.status = 'cancelado' OR m.projeto_status = 'cancelado')) OR
                    (m.saldo > 0 AND ($1 = 'todos' OR $1 = m.categoria OR
                        ($1 = 'cobrados' AND m.cobranca_iniciada) OR ($1 = 'nao_cobrados' AND NOT m.cobranca_iniciada))))
                UNION ALL
                SELECT pg.id, m.id, m.projeto_id, m.cliente_id, m.marco, m.projeto, m.cliente,
                    pg.recebido_em, pg.valor, 'recebidos', m.arquivado, m.cobranca_iniciada,
                    m.bloqueia_progresso, m.status, m.projeto_status, m.saldo_dispensado, pg.anulado_em, m.valor, m.recebido
                FROM marcos_pagamentos pg JOIN marcos m ON m.id = pg.marco_id CROSS JOIN periodo
                WHERE $1 = 'recebidos' AND pg.recebido_em >= inicio AND pg.recebido_em < inicio + interval '1 month'
            ), itens AS (
                SELECT * FROM registros ORDER BY CASE WHEN $1 = 'recebidos' THEN data END DESC NULLS LAST,
                    CASE WHEN $1 <> 'recebidos' THEN data END ASC NULLS LAST, id LIMIT 25 OFFSET $5
            )
            SELECT (SELECT COUNT(*)::int FROM registros) AS quantidade,
                COALESCE((SELECT SUM(valor) FROM registros WHERE anulado_em IS NULL),0)::text AS total,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'marcoId',marco_id,'projetoId',projeto_id,'clienteId',cliente_id,
                    'marco',marco,'projeto',projeto,'cliente',cliente,'data',to_char(data,'YYYY-MM-DD'),'valor',valor::text,
                    'categoria',categoria,'arquivado',arquivado,'cobrancaIniciada',cobranca_iniciada,'bloqueiaProgresso',bloqueia_progresso,
                    'status',status,'projetoStatus',projeto_status,'saldoDispensado',saldo_dispensado,'anuladoEm',anulado_em,
                    'valorMarco',valor_marco::text,'recebido',recebido::text,
                    'ultimoLembrete',(SELECT MAX(n.criada_em) FROM notificacoes n WHERE n.marco_id = itens.marco_id AND n.titulo = 'Lembrete de pagamento' AND n.publico = 'cliente')) ORDER BY CASE WHEN $1 = 'recebidos' THEN data END DESC NULLS LAST,
                    CASE WHEN $1 <> 'recebidos' THEN data END ASC NULLS LAST,id),'[]'::jsonb) FROM itens) AS itens,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('value',id,'label',nome) ORDER BY nome,id),'[]'::jsonb) FROM clientes) AS clientes,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('value',p.id,'label',p.titulo || ' · ' || c.nome,'clienteId',c.id) ORDER BY p.titulo,p.id),'[]'::jsonb)
                    FROM projetos p JOIN clientes c ON c.id = p.cliente_id) AS projetos,
                (SELECT to_char(inicio,'YYYY-MM') FROM periodo) AS mes
        `, [categoria, mes ? `${mes}-01` : null, cliente ?? null, projeto ?? null, (Number(pagina) - 1) * 25]);
        res.set("Cache-Control", "no-store");
        res.json(resultado.rows[0]);
    } catch (erro) {responderErroMarco(res, erro);}
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

//cliente: pendências dos próprios projetos
app.get("/api/me/dashboard/pendencias", async (_req, res) => {
    try {
        const resultado = await pool.query(`
            WITH periodo AS (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje),
            proprios AS (SELECT id, titulo, status FROM projetos WHERE cliente_id = $1 AND arquivada_em IS NULL),
            pendencias AS (
                SELECT CASE WHEN m.vencimento < hoje THEN 'pagamento_atrasado' ELSE 'pagamento_pendente' END AS categoria,
                    m.titulo AS titulo, p.titulo AS subtitulo, p.id AS projeto_id, m.id AS marco_id, NULL::uuid AS conversa_id,
                    m.vencimento AS data, m.saldo::text AS valor,
                    CASE WHEN m.bloqueia_progresso AND p.status <> 'cancelado' AND m.status <> 'cancelado' THEN 'Aguardando pagamento para prosseguir'
                        WHEN m.vencimento < hoje THEN 'Pagamento vencido' ELSE 'Pagamento necessário' END AS detalhe
                FROM funilador_marcos_resumo m JOIN proprios p ON p.id = m.projeto_id CROSS JOIN periodo
                WHERE m.saldo > 0 AND NOT (p.status = 'cancelado' AND NOT m.cobranca_iniciada
                    AND m.status NOT IN ('concluido','cancelado','aguardando_validacao'))
                    AND (m.cobranca_iniciada OR m.bloqueia_progresso OR m.vencimento <= hoje)
                UNION ALL
                SELECT 'validacao_pendente', m.titulo, p.titulo, p.id, m.id, NULL,
                    (m.atualizada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Entrega aguardando sua validação'
                FROM projetos_marcos m JOIN proprios p ON p.id = m.projeto_id
                WHERE m.status = 'aguardando_validacao' AND p.status <> 'cancelado'
                UNION ALL
                SELECT 'proposta_pendente', n.titulo, p.titulo, p.id, NULL, cv.id,
                    (n.criada_em AT TIME ZONE 'America/Sao_Paulo')::date, NULL, 'Proposta aguardando sua resposta'
                FROM projetos_propostas n JOIN conversas cv ON cv.id = n.conversa_id JOIN proprios p ON p.id = cv.projeto_id
                WHERE n.status = 'pendente' AND n.autor_tipo = 'admin' AND cv.cliente_id = $1
                    AND cv.arquivada_em IS NULL AND p.status IN ('planejado','em_andamento')
            ), ordenadas AS (
                SELECT *, COUNT(*) OVER (PARTITION BY categoria)::int AS total,
                    SUM(valor::numeric) OVER (PARTITION BY categoria)::text AS total_valor,
                    ROW_NUMBER() OVER (PARTITION BY categoria ORDER BY data NULLS LAST, titulo, projeto_id, marco_id, conversa_id) AS ordem
                FROM pendencias
            )
            SELECT categoria, titulo, subtitulo, projeto_id AS "projetoId", marco_id AS "marcoId", conversa_id AS "conversaId",
                to_char(data,'YYYY-MM-DD') AS data, valor, detalhe, total, total_valor AS "totalValor"
            FROM ordenadas WHERE ordem <= 100 ORDER BY categoria, ordem
        `, [res.locals.cliente.id]);
        res.set("Cache-Control", "no-store");
        res.json(resultado.rows);
    } catch (erro) {
        console.error("Erro ao carregar pendências do cliente:", erro);
        res.status(500).json({erro: "Não foi possível carregar suas pendências"});
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
            funilador_progresso_projeto(id, modo_progresso, progresso) AS progresso,
            CASE WHEN status = 'cancelado' THEN 0 ELSE (
                SELECT COUNT(*)::int FROM projetos_marcos m
                WHERE m.projeto_id = projetos.id AND m.status = 'aguardando_validacao'
            ) END AS "entregasPendentes"
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

//admin: consultar gerenciamento de acesso
app.get("/api/clientes/:id/acesso", async (req, res) => {
    try {
        const {id} = req.params;
        if (!uuidConversa.test(id)) throw new ErroConversa(400, "Cliente inválido");
        const dados = await pool.query(`SELECT u.email, u.id AS "usuarioId", cfg.senha_provisoria_ate AS "senhaProvisoriaAte",
            COALESCE((SELECT jsonb_agg(h ORDER BY h."criadaEm" DESC,h.id DESC) FROM (
                SELECT r.id, r.tipo, r.criada_em AS "criadaEm", r.expira_em AS "expiraEm",
                    CASE WHEN r.revogada_em IS NOT NULL THEN 'revogado' WHEN r.usada_em IS NOT NULL THEN 'utilizado'
                        WHEN r.expira_em <= clock_timestamp() THEN 'expirado' ELSE 'ativo' END AS estado,
                    a.name AS administrador
                FROM usuarios_recuperacoes r LEFT JOIN "user" a ON a.id = r.administrador_id
                WHERE r.usuario_id = u.id ORDER BY r.criada_em DESC,r.id DESC LIMIT 30
            ) h),'[]'::jsonb) AS historico
            FROM clientes c LEFT JOIN "user" u ON u.id = c.usuario_id
            LEFT JOIN usuarios_configuracoes cfg ON cfg.usuario_id = u.id WHERE c.id = $1`, [id]);
        if (!dados.rows.length) throw new ErroConversa(404, "Cliente não encontrado");
        res.set("Cache-Control", "no-store").json(dados.rows[0]);
    } catch (erro) {responderErroConversa(res, erro);}
});

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
            RETURNING id, usuario_id AS "usuarioId", nome, email`,
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

//admin: lembrar pagamento do marco
app.post("/api/projetos/:id/marcos/:marcoId/lembretes", async (req, res) => {
    const {id, marcoId} = req.params;
    try {
        if (typeof id !== "string" || typeof marcoId !== "string" || !uuidConversa.test(id) || !uuidConversa.test(marcoId)) throw new ErroConversa(400, "Marco inválido");
        const resultado = await transacaoConversa(async db => {
            //travar conversa antes do projeto, como na negociação
            const conversa = await db.query(`SELECT id FROM conversas WHERE projeto_id = $1 AND tipo = 'projeto' AND arquivada_em IS NULL FOR UPDATE`, [id]);
            const statusProjeto = await travarProjetoMarco(db, id);
            const dados = await db.query(`SELECT m.titulo, m.status, m.saldo::text AS saldo, m.saldo > 0 AS pendente,
                m.cobranca_iniciada, m.bloqueia_progresso, m.vencimento <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS vencido,
                to_char(m.vencimento,'DD/MM/YYYY') AS vencimento, p.cliente_id, p.titulo AS projeto
                FROM funilador_marcos_resumo m JOIN projetos p ON p.id = m.projeto_id WHERE m.id = $1 AND p.id = $2`, [marcoId,id]);
            const m = dados.rows[0];
            if (!m) throw new ErroConversa(404, "Marco não encontrado");
            if (!m.pendente || (statusProjeto === "cancelado" && !m.cobranca_iniciada && !["concluido","cancelado","aguardando_validacao"].includes(m.status))) throw new ErroConversa(409, "Não há saldo para cobrar");
            if (!m.cobranca_iniciada && !m.bloqueia_progresso && !m.vencido) throw new ErroConversa(409, "Inicie a cobrança antes de enviar o lembrete");
            const recente = await db.query(`SELECT 1 FROM notificacoes WHERE marco_id = $1 AND publico = 'cliente' AND titulo = 'Lembrete de pagamento' AND criada_em > NOW() - interval '24 hours' LIMIT 1`, [marcoId]);
            if (recente.rows.length) throw new ErroConversa(409, "Já foi enviado um lembrete nas últimas 24 horas");
            const valor = Number(m.saldo).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
            const texto = `Lembrete de pagamento: ${m.titulo} · Saldo: ${valor}${m.vencimento ? ` · Vencimento: ${m.vencimento}` : ""}.`;
            let mensagemId: string | null = null;
            if (conversa.rows.length) {
                const mensagem = await db.query(`INSERT INTO mensagens (conversa_id,remetente_id,remetente_tipo,conteudo,enviada_em) VALUES ($1,$2,'admin',$3,clock_timestamp()) RETURNING id`, [conversa.rows[0].id,res.locals.usuarioId,texto]);
                mensagemId = mensagem.rows[0].id;
                //usar a notificação do lembrete em vez de duplicar a de mensagem
                const evento = await db.query(`UPDATE notificacoes SET tipo = 'projeto', referencia_id = $2, titulo = 'Lembrete de pagamento', resumo = left($3,180), marco_id = $4 WHERE mensagem_id = $1`, [mensagemId,id,`${m.projeto} · ${texto}`,marcoId]);
                if (evento.rowCount !== 1) throw new ErroConversa(500, "Não foi possível registrar o lembrete");
            } else {
                await db.query(`INSERT INTO notificacoes (publico,cliente_id,tipo,referencia_id,titulo,resumo,marco_id) VALUES ('cliente',$1,'projeto',$2,'Lembrete de pagamento',left($3,180),$4)`, [m.cliente_id,id,`${m.projeto} · ${texto}`,marcoId]);
            }
            return {enviado:true, conversa: mensagemId !== null};
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

//admin: gerar recuperação ou encerrar sessões
app.post("/api/clientes/:id/acesso", async (req, res) => {
    try {
        exigirJsonAcesso(req);
        const {id} = req.params;
        const {acao, validade, senhaAdmin} = req.body ?? {};
        if (!["link","provisoria","sessoes"].includes(acao) || (acao !== "sessoes" && ![15,60,1440].includes(validade))) throw new ErroConversa(400, "Operação inválida");
        const admin = res.locals.usuarioId as string;
        limitarAcesso(`admin:${admin}`);
        const resultado = await comCredenciais(() => transacaoConversa(async db => {
            await confirmarAdminAcesso(db, admin, senhaAdmin);
            const usuario = await clienteAcesso(db, id);
            await contaCredencial(db, usuario);
            if (acao === "sessoes") {
                await db.query(`DELETE FROM "session" WHERE "userId" = $1`, [usuario]);
                await db.query(`INSERT INTO usuarios_recuperacoes (usuario_id,administrador_id,tipo,usada_em) VALUES ($1,$2,'sessoes',clock_timestamp())`, [usuario,admin]);
                return {acao};
            }
            const segredo = randomBytes(32).toString("base64url");
            await invalidarRecuperacoes(db, usuario, acao === "link" ? "link" : null);
            const registro = await db.query(`INSERT INTO usuarios_recuperacoes (usuario_id,administrador_id,tipo,token_hash,expira_em)
                VALUES ($1,$2,$3,$4,clock_timestamp() + $5::int * interval '1 minute') RETURNING id,expira_em AS "expiraEm"`,
                [usuario,admin,acao,acao === "link" ? hashRecuperacao(segredo) : null,validade]);
            if (acao === "provisoria") {
                await trocarCredencial(db, usuario, segredo);
                await db.query(`INSERT INTO usuarios_configuracoes (usuario_id,senha_provisoria_ate) VALUES ($1,$2)
                    ON CONFLICT (usuario_id) DO UPDATE SET senha_provisoria_ate = EXCLUDED.senha_provisoria_ate`, [usuario,registro.rows[0].expiraEm]);
            }
            return {acao, ...registro.rows[0], segredo};
        }));
        res.set("Cache-Control", "no-store").status(201).json(resultado);
    } catch (erro) {responderErroConversa(res, erro);}
});

//cliente: redefinir senha por link de uso único
app.post("/api/recuperacao", async (req, res) => {
    try {
        exigirJsonAcesso(req);
        limitarAcesso(`publico:${req.ip ?? "local"}`, 30);
        const {token, senha} = req.body ?? {};
        if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) || !senhaValida(senha)) throw new ErroConversa(400, "Código ou senha inválidos");
        const hash = hashRecuperacao(token);
        await comCredenciais(() => transacaoConversa(async db => {
            const invalido = () => new ErroConversa(410, "Link inválido, expirado ou já utilizado. Solicite outro ao administrador.");
            const referencia = (await db.query(`SELECT usuario_id FROM usuarios_recuperacoes WHERE token_hash = $1 AND tipo = 'link' AND usada_em IS NULL AND revogada_em IS NULL AND expira_em > clock_timestamp()`, [hash])).rows[0];
            if (!referencia) throw invalido();
            const usuario = await travarUsuarioAcesso(db, referencia.usuario_id);
            const papeis = String(usuario.role ?? "").split(",");
            if (!papeis.includes("user") || papeis.includes("admin")) throw invalido();
            //não tornar a senha provisória uma credencial definitiva
            const cfg = (await db.query(`SELECT senha_provisoria_ate IS NOT NULL AS provisoria FROM usuarios_configuracoes WHERE usuario_id = $1`, [usuario.id])).rows[0];
            if (cfg?.provisoria) {
                const conta = await contaCredencial(db, usuario.id);
                const contexto = await auth.$context;
                if (await contexto.password.verify({hash: conta.password, password: senha})) throw new ErroConversa(400, "Escolha uma senha diferente da provisória");
            }
            const registro = await db.query(`UPDATE usuarios_recuperacoes SET usada_em = clock_timestamp() WHERE token_hash = $1 AND usuario_id = $2 AND usada_em IS NULL AND revogada_em IS NULL AND expira_em > clock_timestamp() RETURNING id`, [hash,usuario.id]);
            if (!registro.rows.length) throw invalido();
            await trocarCredencial(db, usuario.id, senha);
            await invalidarRecuperacoes(db, usuario.id);
            await db.query(`UPDATE usuarios_configuracoes SET senha_provisoria_ate = NULL WHERE usuario_id = $1`, [usuario.id]);
        }));
        res.set("Cache-Control", "no-store").json({mensagem: "Senha redefinida. Entre novamente."});
    } catch (erro) {responderErroConversa(res, erro);}
});

//rotas PATCH

//admin: revogar link de recuperação
app.patch("/api/clientes/:id/acesso/:recuperacaoId/revogar", async (req, res) => {
    try {
        exigirJsonAcesso(req);
        const {id, recuperacaoId} = req.params;
        if (!uuidConversa.test(recuperacaoId)) throw new ErroConversa(400, "Link inválido");
        const admin = res.locals.usuarioId as string;
        limitarAcesso(`admin:${admin}`);
        await transacaoConversa(async db => {
            await confirmarAdminAcesso(db, admin, req.body?.senhaAdmin);
            const usuario = await clienteAcesso(db, id);
            const resultado = await db.query(`UPDATE usuarios_recuperacoes SET revogada_em = clock_timestamp() WHERE id = $1 AND usuario_id = $2 AND tipo = 'link' AND usada_em IS NULL AND revogada_em IS NULL AND expira_em > clock_timestamp() RETURNING id`, [recuperacaoId,usuario]);
            if (!resultado.rows.length) throw new ErroConversa(409, "Link indisponível");
        });
        res.json({revogado: true});
    } catch (erro) {responderErroConversa(res, erro);}
});

//conta: alterar senha atual ou provisória
app.patch("/api/conta/senha", async (req, res) => {
    try {
        exigirJsonAcesso(req);
        const {atual, nova, provisoria: solicitarTrocaProvisoria} = req.body ?? {};
        if (!senhaValida(nova)) throw new ErroConversa(400, "A nova senha deve possuir de 8 a 128 caracteres");
        const usuario = res.locals.usuarioId as string;
        limitarAcesso(`senha:${usuario}`);
        const provisoria = await comCredenciais(() => transacaoConversa(async db => {
            const contaUsuario = await travarUsuarioAcesso(db, usuario);
            const sessao = await db.query(`SELECT 1 FROM "session" WHERE id = $1 AND "userId" = $2 AND "expiresAt" > clock_timestamp() FOR UPDATE`, [res.locals.sessaoId,usuario]);
            if (!sessao.rows.length) throw new ErroConversa(401, "Sessão indisponível. Entre novamente");
            const cfg = (await db.query(`SELECT senha_provisoria_ate IS NOT NULL AS provisoria, senha_provisoria_ate <= clock_timestamp() AS expirada FROM usuarios_configuracoes WHERE usuario_id = $1`, [usuario])).rows[0];
            if (cfg?.expirada) throw new ErroConversa(410, "Senha provisória expirada. Solicite uma nova recuperação");
            const conta = await contaCredencial(db, usuario);
            const contexto = await auth.$context;
            if (solicitarTrocaProvisoria === true) {
                const papeis = String(contaUsuario.role ?? "").split(",");
                if (!cfg?.provisoria || !papeis.includes("user") || papeis.includes("admin")) throw new ErroConversa(403, "Não há troca de senha provisória disponível");
                //a sessão deve ter sido criada após a emissão da senha provisória vigente
                const autorizada = await db.query(`SELECT r.id FROM usuarios_recuperacoes r
                    JOIN usuarios_configuracoes cfg ON cfg.usuario_id = r.usuario_id AND cfg.senha_provisoria_ate = r.expira_em
                    JOIN "session" s ON s."userId" = r.usuario_id AND s.id = $2
                    WHERE r.usuario_id = $1 AND r.tipo = 'provisoria' AND r.usada_em IS NULL AND r.revogada_em IS NULL
                        AND r.expira_em > clock_timestamp() AND s."expiresAt" > clock_timestamp()
                        AND s."createdAt" >= date_trunc('milliseconds', r.criada_em) AND s."createdAt" < r.expira_em
                    FOR UPDATE OF r`, [usuario,res.locals.sessaoId]);
                if (!autorizada.rows.length) throw new ErroConversa(403, "Sessão de recuperação indisponível. Entre novamente com a senha provisória ou solicite outra recuperação");
                if (await contexto.password.verify({hash: conta.password,password: nova})) throw new ErroConversa(400, "Escolha uma senha diferente da provisória");
                await trocarCredencial(db, usuario, nova);
                await db.query(`UPDATE usuarios_recuperacoes SET usada_em = clock_timestamp() WHERE id = $1`, [autorizada.rows[0].id]);
            } else {
                if (cfg?.provisoria) throw new ErroConversa(403, "Utilize a tela de troca de senha provisória");
                if (!senhaValida(atual)) throw new ErroConversa(400, "Informe sua senha atual");
                if (!await contexto.password.verify({hash: conta.password,password: atual})) throw new ErroConversa(403, "Senha atual incorreta");
                if (atual === nova) throw new ErroConversa(400, "A nova senha deve ser diferente da senha atual");
                await trocarCredencial(db, usuario, nova, res.locals.sessaoId);
            }
            await invalidarRecuperacoes(db, usuario);
            await db.query(`UPDATE usuarios_configuracoes SET senha_provisoria_ate = NULL WHERE usuario_id = $1`, [usuario]);
            return !!cfg?.provisoria;
        }));
        res.set("Cache-Control", "no-store").json({alterada: true, entrarNovamente: provisoria});
    } catch (erro) {responderErroConversa(res, erro);}
});

//conta: alterar próprio nome
app.patch("/api/conta/nome", async (req, res) => {
    try {
        if (!req.is("application/json")) throw new ErroConversa(415, "Envie dados em JSON");
        const nome = nomeConta(req.body?.nome);
        const usuarioId = res.locals.usuarioId;
        const admin = res.locals.contaAdmin;
        const dados = await transacaoConversa(async db => {
            //travar cliente antes do usuário, como na edição administrativa
            const cliente = admin ? null : (await db.query(`SELECT id, nome FROM clientes WHERE usuario_id = $1 FOR UPDATE`, [usuarioId])).rows[0];
            if (!admin && !cliente) throw new ErroConversa(404, "Cliente não encontrado");
            const usuario = (await db.query(`SELECT name FROM "user" WHERE id = $1 FOR UPDATE`, [usuarioId])).rows[0];
            if (!usuario) throw new ErroConversa(404, "Conta não encontrada");
            if (usuario.name === nome && (admin || cliente.nome === nome)) return carregarConta(db, usuarioId, admin);
            if (!admin) {
                const intervalo = await db.query(`
                    SELECT nome_alterado_em + interval '6 hours' AS proxima
                    FROM usuarios_configuracoes WHERE usuario_id = $1
                        AND nome_alterado_em + interval '6 hours' > clock_timestamp()
                `, [usuarioId]);
                if (intervalo.rows.length) throw new ErroConversa(429, "Você pode alterar seu nome novamente após " +
                    new Date(intervalo.rows[0].proxima).toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}));
            }
            await db.query(`UPDATE "user" SET name = $2, "updatedAt" = NOW() WHERE id = $1`, [usuarioId, nome]);
            if (!admin) {
                await db.query(`UPDATE clientes SET nome = $2 WHERE id = $1`, [cliente.id, nome]);
                await db.query(`
                    INSERT INTO usuarios_configuracoes (usuario_id, nome_alterado_em) VALUES ($1, clock_timestamp())
                    ON CONFLICT (usuario_id) DO UPDATE SET nome_alterado_em = EXCLUDED.nome_alterado_em
                `, [usuarioId]);
            }
            return carregarConta(db, usuarioId, admin);
        });
        res.json(dados);
    } catch (erro) {responderErroConversa(res, erro);}
});

//conta: salvar preferência de tema
app.patch("/api/conta/preferencias", async (req, res) => {
    try {
        if (!req.is("application/json")) throw new ErroConversa(415, "Envie dados em JSON");
        const tema = req.body?.tema;
        if (tema !== "light" && tema !== "dark" && tema !== "auto") throw new ErroConversa(400, "Tema inválido");
        const usuarioId = res.locals.usuarioId;
        const admin = res.locals.contaAdmin;
        const dados = await transacaoConversa(async db => {
            await carregarConta(db, usuarioId, admin);
            await db.query(`
                INSERT INTO usuarios_configuracoes (usuario_id, tema) VALUES ($1,$2)
                ON CONFLICT (usuario_id) DO UPDATE SET tema = EXCLUDED.tema
            `, [usuarioId, tema]);
            return carregarConta(db, usuarioId, admin);
        });
        res.json(dados);
    } catch (erro) {responderErroConversa(res, erro);}
});


//admin: editar cliente
app.patch("/api/clientes/:id", async (req, res) => {
    const id = req.params.id;
    try {
        if (typeof id !== "string" || !uuidConversa.test(id)) throw new ErroConversa(400, "Cliente inválido");
        const nome = nomeConta(req.body?.nome);
        const email = req.body?.email;
        if (email != null && (typeof email !== "string" || email.trim().length > 254 ||
            (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))) {
            throw new ErroConversa(400, "E-mail de contato inválido");
        }
        const emailTratado = typeof email === "string" ? email.trim() || null : null;
        const dados = await transacaoConversa(async db => {
            const atual = (await db.query(`SELECT usuario_id FROM clientes WHERE id = $1 FOR UPDATE`, [id])).rows[0];
            if (!atual) throw new ErroConversa(404, "Cliente não encontrado");
            if (atual.usuario_id) {
                await db.query(`UPDATE "user" SET name = $2, "updatedAt" = NOW() WHERE id = $1 AND name IS DISTINCT FROM $2`, [atual.usuario_id, nome]);
            }
            const resultado = await db.query(`
                UPDATE clientes SET nome = $1, email = $2 WHERE id = $3
                RETURNING id, usuario_id AS "usuarioId", nome, email
            `, [nome, emailTratado, id]);
            return resultado.rows[0];
        });
        res.json(dados);
    } catch (erro) {responderErroConversa(res, erro);}
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

//admin: iniciar cobrança do marco
app.patch("/api/projetos/:id/marcos/:marcoId/cobranca", async (req, res) => {
    const {id, marcoId} = req.params;
    try {
        if (!uuidConversa.test(marcoId)) throw new ErroConversa(400, "Marco inválido");
        const resultado = await transacaoConversa(async db => {
            const statusProjeto = await travarProjetoMarco(db, id);
            const marco = await db.query(`SELECT status, cobranca_iniciada, saldo > 0 AS pendente, saldo_dispensado
                FROM funilador_marcos_resumo WHERE id = $1 AND projeto_id = $2`, [marcoId, id]);
            const atual = marco.rows[0];
            if (!atual) throw new ErroConversa(404, "Marco não encontrado");
            if (!atual.pendente || atual.saldo_dispensado) throw new ErroConversa(409, "Não há saldo para cobrar");
            if (statusProjeto === "cancelado" && !["concluido", "cancelado", "aguardando_validacao"].includes(atual.status) && !atual.cobranca_iniciada) throw new ErroConversa(409, "A previsão deste marco foi suspensa");
            if (!atual.cobranca_iniciada) {
                await db.query(`UPDATE projetos_marcos SET cobranca_iniciada = TRUE, atualizada_em = NOW() WHERE id = $1 AND projeto_id = $2`, [marcoId, id]);
                return atualizarProjetoMarco(db, id, res.locals.usuarioId);
            }
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
