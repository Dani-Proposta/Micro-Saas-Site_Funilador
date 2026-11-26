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
//rotas de solicitação
//verificar conexão com api
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/me", (_req, res) => {
    res.json(res.locals.cliente);
});
//solicitar pedidos do DB
//solicitação do dashboard para pegar os numeros das tabelas, o total, e outras coisas relacionadas
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

//dashboard do cliente
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

//Pedir pro DB as solicitações mais recentes com info de cada cliente
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
            s.criada_em AS "criadaEm"
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

//solicitação do client side
app.get("/api/me/solicitacoes", async (_req, res) => {
    const clienteId = res.locals.cliente.id;

    try {
        const resultado = await pool.query(
            `
            SELECT
                id,
                titulo,
                descricao,
                status,
                criada_em AS "criadaEm"
            FROM solicitacoes
            WHERE cliente_id = $1
            ORDER BY criada_em DESC
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

//solicitar clienteS no plural, a lista de todos eles
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

//solicitar clientes do DB por id especifico
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

//solicitar os projetos do db
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

//painel individual dos projetos
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
            p.arquivada_em AS "arquivadaEm"
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

//solicitar projeto do cliente
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
            atualizada_em AS "atualizadaEm"
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

//solicitar convites do DB
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

//listar conversas
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

// Histórico paginado: o cursor é resolvido no próprio banco, com precisão integral.
// Os únicos fragmentos SQL dinâmicos são operadores/direções definidos pelo servidor.
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
            // Sem estado/cursor, preserva a resposta em array dos pacotes anteriores.
            res.json(req.query.estado === "true" || cursor !== null ? conversa : conversa.mensagens);
        } catch (erro) {
            console.error("Erro ao buscar histórico:", erro);
            res.status(500).json({erro: "Não foi possível carregar as mensagens."});
        }
    };
}

app.get("/api/conversas/:id/mensagens", rotaHistorico("admin"));

//cliente carregar conversas
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

// Histórico do cliente: o middleware e o filtro de propriedade permanecem obrigatórios.
app.get("/api/me/conversas/:id/mensagens", rotaHistorico("cliente"));

// Contadores globais e recibos individuais de leitura.
// Cada rota já passa pelo middleware correspondente; nunca confia em IDs de usuário do JSON.
function rotasLeitura(prefixo: string, lado: "admin" | "cliente") {
    const recebidoDe = lado === "admin" ? "cliente" : "admin";

    app.get(`${prefixo}/nao-lidas`, async (_req, res) => {
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
    });

    app.post(`${prefixo}/:id/leituras`, async (req, res) => {
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
            // A autorização, seleção e gravação acontecem na mesma instrução SQL.
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
    });
}

rotasLeitura("/api/conversas", "admin");
rotasLeitura("/api/me/conversas", "cliente");

//rotas de atualização ou pedido ou criação

// criar solicitação
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
        const resultado = await pool.query(
            `INSERT INTO solicitacoes (cliente_id, titulo, descricao)   
            VALUES ($1, $2, $3) 
            RETURNING 
            id,
            cliente_id AS "clienteId",
            titulo,
            descricao,
            status,
            criada_em AS "criadaEm"`,
            [clienteId, titulo.trim(), descricao.trim()],
        );
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao criar solicitação:", erro);

        res.status(500).json({ erro: "Dessa vez não foi sua culpa" });
    }
});

//atualizar status do pedido da solicitação
app.patch("/api/solicitacoes/:id/status", async (req, res) => {
    const id = req.params.id;
    const status = req.body?.status;

    if (status !== "aprovada" && status !== "recusada") {
        res.status(400).json({ erro: "tem coisa errada nesses status ai" });
        return;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const resultado = await client.query(
            `SELECT id, cliente_id, titulo, descricao, status
            FROM solicitacoes
            WHERE id = $1
            FOR UPDATE`,
            [id],
        );
        const solicitacao = resultado.rows[0];

        if (!solicitacao) {
            await client.query("ROLLBACK");
            res.status(404).json({ erro: "Solicitação não encontrada." });
            return;
        }

        if (solicitacao.status !== "pendente") {
            await client.query("ROLLBACK");
            res.status(409).json({
                erro: "Esta solicitação já foi decidida.",
            });
            return;
        }

        await client.query(
            `UPDATE solicitacoes
            SET status = $1
            WHERE id = $2`,
            [status, id],
        );
        if (status === "aprovada") {
            await client.query(
                `INSERT INTO projetos
                (cliente_id, solicitacao_id, titulo, descricao)
                VALUES ($1,$2,$3,$4)`,
                [
                    solicitacao.cliente_id,
                    solicitacao.id,
                    solicitacao.titulo,
                    solicitacao.descricao,
                ],
            );
        }
        await client.query("COMMIT");

        res.json({ id, status });
    } catch (erro) {
        await client.query("ROLLBACK");
        console.error("Não deu pra decidir o pedido", erro);
        res.status(500).json({ erro: "Falha na atu da solicitação" });
    } finally {
        client.release();
    }
});

//solciitação do cliente
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
        const resultado = await pool.query(
            `
            WITH criada AS (
                INSERT INTO solicitacoes (cliente_id, titulo, descricao, status)
                VALUES ($1, $2, $3, 'pendente')
                RETURNING id, cliente_id, titulo, descricao, status, criada_em
            ), notificada AS (
                INSERT INTO notificacoes (publico, cliente_id, tipo, referencia_id, titulo, resumo)
                SELECT 'admin', s.cliente_id, 'solicitacao', s.id, 'Nova solicitação',
                    left(c.nome || ' · ' || s.titulo, 180)
                FROM criada s JOIN clientes c ON c.id = s.cliente_id
            )
            SELECT id, titulo, descricao, status, criada_em AS "criadaEm" FROM criada
        `,
            [clienteId, titulo.trim(), descricao.trim()],
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao criar solicitação do cliente:", erro);
        res.status(500).json({ erro: "Não foi possível criar sua solicitação." });
    }
});

//cadastrar cliente
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

//atualizar dados do cliente
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

//criar projeto direto
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

//atualizar projetos
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

//atualizar projeto por completo
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

//arquivamento de projetos
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

//restaurar projeto arquivado
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

//criar convites
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

//revogar convite
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

//deletar convites
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

//criar conversas por projeto
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

//alterar nome da conversa
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

//mandar mensagem como admin
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

//arquivar conversas
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

// Todas as mudanças de reabertura bloqueiam a conversa antes de consultar o pedido.
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

// Cliente: pedir reabertura da própria conversa arquivada.
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

// Admin: decidir um pedido específico. Aprovação e restauração são atômicas.
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

// Restauração manual também resolve um pedido pendente, sem deixá-lo órfão.
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

// Preferência pessoal do cliente; nunca altera arquivada_em.
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

//cliente mandar mensagem
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

// Notificações persistentes: visibilidade por papel e cliente autenticado.
// Cada conversa é um grupo de mensagens; outros eventos mantêm histórico individual.
for (const lado of ["admin", "cliente"] as const) {
    const prefixo = lado === "admin" ? "/api/notificacoes" : "/api/me/notificacoes";

    app.get(prefixo, async (req, res) => {
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
                                -- Eventos anteriores à migração não possuem ID exato.
                                -- Conservador: só baixam quando as mensagens recebidas até o evento forem lidas.
                                SELECT 1 FROM mensagens m
                                WHERE m.conversa_id = n.referencia_id
                                    AND m.remetente_tipo = CASE WHEN n.publico = 'admin' THEN 'cliente' ELSE 'admin' END
                                    AND m.enviada_em <= n.criada_em
                                    AND NOT EXISTS (SELECT 1 FROM mensagens_leituras ml WHERE ml.mensagem_id = m.id AND ml.usuario_id = $3)
                            )
                        END
                    ) AS nao_lida,
                        CASE WHEN n.tipo = 'mensagem' THEN 'm:' || n.referencia_id::text ELSE 'e:' || n.id::text END AS grupo
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
    });

    // Limpa a central somente para o usuário autenticado, incluindo eventos não lidos.
    app.delete(prefixo, async (_req, res) => {
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
    });

    app.post(`${prefixo}/leituras`, async (req, res) => {
        const {id, todas} = req.body ?? {};
        const marcarTodas = todas === true;
        if (!marcarTodas && (typeof id !== "string" || !uuidConversa.test(id))) {
            res.status(400).json({erro: "Notificação inválida."}); return;
        }
        const clienteId = lado === "cliente" ? res.locals.cliente.id : null;
        try {
            // A âncora é verificada no mesmo escopo de autorização da leitura.
            // Novas mensagens posteriores à âncora não são marcadas por este clique.
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
                            a.tipo = 'mensagem' AND n.tipo = 'mensagem' AND n.referencia_id = a.referencia_id
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
    });
}

//acesso a API
app.listen(3001, () => {
    console.log("api disponivel na porta: http://localhost:3001");
});
