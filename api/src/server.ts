//precisa pra se quer existir
import express from "express";
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
async function exigirAdmin(req: Request, res: Response, next: NextFunction){
    try{
        const sessao = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if(!sessao){
            res.status(401).json({erro:"Você precisa fazer login"});
            return;
        }

        const papeis = sessao.user.role?.split(",") ?? [];

        if(!papeis.includes("admin")){
            res.status(403).json({erro:"Acesso restrito"});
            return;
        }

        next();
    }catch(erro){
        console.error("Erro ao verificar acesso:", erro);
        res.status(500).json({erro: "Falha ao verificar autenticação"});
    }
}

//precisa ser clientep para acessar essa area
async function exigirCliente(req: Request, res: Response, next: NextFunction) {
    try {
        const sessao = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!sessao) {
            res.status(401).json({erro: "Você precisa fazer login"});
            return;
        }

        const papeis = sessao.user.role?.split(",") ?? [];

        if (!papeis.includes("user") || papeis.includes("admin")) {
            res.status(403).json({erro: "Acesso restrito aos clientes"});
            return;
        }

        const resultado = await pool.query(`
            SELECT id, nome, email
            FROM clientes
            WHERE usuario_id = $1
        `, [sessao.user.id]);

        if (resultado.rows.length === 0) {
            res.status(403).json({erro: "Nenhum cliente vinculado à conta"});
            return;
        }

        res.locals.cliente = resultado.rows[0];

        next();

    } catch (erro) {
        console.error("Erro ao verificar cliente:", erro);
        res.status(500).json({erro: "Falha ao verificar autenticação"});
    }
}

//aqui eu protego oq só adm pode solicitar ou acessar
app.use(
  ["/api/clientes", "/api/solicitacoes", "/api/projetos", "/api/dashboard","/api/convites",],
  exigirAdmin
);

//apenas cliente logado ve
app.use("/api/me", exigirCliente);


const dbCadastro = new Kysely({
    dialect: new PostgresDialect({pool}),
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
app.get("/api/health", (_req, res) =>{
    res.json({status: "ok"});
    
});

app.get("/api/me", (_req, res) => {
    res.json(res.locals.cliente);
});
//solicitar pedidos do DB
//solicitação do dashboard para pegar os numeros das tabelas, o total, e outras coisas relacionadas
app.get("/api/dashboard", async (req, res) =>{
    try{
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
            AND arquivada_em IS NULL) AS "projetosConcluidos"`
        );

        res.json(resultado.rows[0]);
    }catch(erro){
        console.error("não foi possivel pegar os dados pro dashboard",erro)

        res.status(500).json({erro: "não foi possivel carregar os dados do dashboard",});
    }
});


//Pedir pro DB as solicitações mais recentes com info de cada cliente
app.get("/api/solicitacoes", async (_req, res) =>{
    try{
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
            
            ORDER by s.criada_em DESC`
        );

        res.json(resultado.rows);
    }catch(erro){
        console.error("Erro ao buscar as solicitações:", erro);

        res.status(500).json({erro:"Não foi possivel carregar as solicitações.",});
    }
});

//solicitação do client side
app.get("/api/me/solicitacoes", async (_req, res) => {
    const clienteId = res.locals.cliente.id;

    try {
        const resultado = await pool.query(`
            SELECT
                id,
                titulo,
                descricao,
                status,
                criada_em AS "criadaEm"
            FROM solicitacoes
            WHERE cliente_id = $1
            ORDER BY criada_em DESC
        `, [clienteId]);

        res.json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao buscar solicitações do cliente:", erro);
        res.status(500).json({erro: "Não foi possível carregar suas solicitações."});
    }
});

//solicitar clienteS no plural, a lista de todos eles
app.get("/api/clientes", async (_req, res) => {
    try{
        const resultado = await pool.query(
            'SELECT id, usuario_id AS "usuarioId", nome, email FROM clientes'
        );
        res.json(resultado.rows);
    }catch(erro){
        console.error("Erro na DB:", erro);
        res.status(500).json({erro: "Erro no banco de dados"});
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
        [id]
    );

        if (resultadoCliente.rows.length === 0) {
            res.status(404).json({erro: "Cliente não encontrado.",});
            return;
        }

        const [resultadoProjetos, resultadoSolicitacoes] = await Promise.all([ pool.query(
            `SELECT
            id,
            titulo,
            status,
            arquivada_em AS "arquivadaEm"
            FROM projetos
            WHERE cliente_id = $1
            ORDER BY criada_em DESC`,
            [id]
        ),

        pool.query(
            `SELECT
            id,
            titulo,
            status
            FROM solicitacoes
            WHERE cliente_id = $1
            ORDER BY criada_em DESC`,
            [id]
        ),
    ]);

        res.json({
            ...resultadoCliente.rows[0],
            projetos: resultadoProjetos.rows,
            solicitacoes: resultadoSolicitacoes.rows,
        });
    }catch (erro) {
        console.error("Erro ao buscar cliente:", erro);

        res.status(500).json({erro: "Não foi possível carregar o cliente.",});
    }
});


//solicitar os projetos do db 
app.get("/api/projetos", async(req, res) => {
    const arquivados = req.query.arquivados === "true";

    try{
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
            
            `,[arquivados]);
        res.json(resultado.rows)
    }catch(erro){
        console.error("Erro ao procurar os projetos", erro);
        res.status(500).json({erro:"Não foi possivel carregas os projetos"});
    }
});

//painel individual dos projetos
app.get("/api/projetos/:id", async(req, res) => {
    const id = req.params.id;

    try{
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
            [id]
        );

        if(resultado.rows.length === 0){
            res.status(404).json({erro: "projeto não encontrado", });
            return;
        }

        res.json(resultado.rows[0]);
    }catch(erro){
        console.error("Erro ao buscar projeto:", erro);
        res.status(500).json({erro: "Não foi possível carregar o projeto.",});
    }
});

//solicitar projeto do cliente
app.get("/api/me/projetos", async (_req, res) => {
    const clienteId = res.locals.cliente.id;

    try {
        const resultado = await pool.query(`
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
        `, [clienteId]);

        res.json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao buscar projetos do cliente:", erro);
        res.status(500).json({erro: "Não foi possível carregar seus projetos."});
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
        const resultado = await pool.query(`
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
        `, [token]);

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



//rotas de atualização ou pedido ou criação


// criar solicitação
app.post("/api/solicitacoes", async (req, res) =>{
    const clienteId = req.body?.clienteId;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;
    //se n tiver preenchido nem vai fodase
    if( typeof clienteId !== 'string' || clienteId.trim().length === 0 || 
        typeof titulo !== "string" || titulo.trim().length === 0 ||  
        typeof descricao !== "string" || descricao.trim().length === 0
    ){
        res.status(400).json({erro: "Titulo e descrição necessario, por favor ne!"});
        return;
    }

    try{
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
            [clienteId, titulo.trim(), descricao.trim()]
        );
        res.status(201).json(resultado.rows[0]);
    }catch(erro) {
        console.error("Erro ao criar solicitação:", erro);

        res.status(500).json({erro:"Dessa vez não foi sua culpa"});
    }
});

//atualizar status do pedido da solicitação
app.patch("/api/solicitacoes/:id/status", async (req, res) => {
    const id = req.params.id;
    const status = req.body?.status;


    if(status !== "aprovada" && status !== "recusada"){
        res.status(400).json({erro:"tem coisa errada nesses status ai",});
        return;
    }

    const client = await pool.connect();

    try{
        await client.query("BEGIN");

        const resultado = await client.query(
            `SELECT id, cliente_id, titulo, descricao, status
            FROM solicitacoes
            WHERE id = $1
            FOR UPDATE`,
            [id]
        );
        const solicitacao = resultado.rows[0];
        
        if (!solicitacao) {
            await client.query("ROLLBACK");
            res.status(404).json({ erro: "Solicitação não encontrada." });
            return;
        }
        
        if(solicitacao.status !== "pendente"){
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
            [status,id]
        );
        if(status === "aprovada"){
            await client.query(`INSERT INTO projetos
                (cliente_id, solicitacao_id, titulo, descricao)
                VALUES ($1,$2,$3,$4)`,
                [solicitacao.cliente_id, solicitacao.id, solicitacao.titulo, solicitacao.descricao],
            );
        }
        await client.query("COMMIT");
        
        res.json({id, status});
        }catch(erro){
            await client.query("ROLLBACK");
            console.error("Não deu pra decidir o pedido",erro);
            res.status(500).json({erro:"Falha na atu da solicitação",});
        }finally{
            client.release();
        }

});

//cadastrar cliente
app.post("/api/clientes", async(req, res) =>{
    const nome = req.body?.nome;
    const email = req.body?.email;

    if(typeof nome !== "string" || nome.trim().length === 0){
        res.status(400).json({erro: "Nome é obrigatório"});
        return;
    }

    if(email != null && typeof email !== "string"){
        res.status(400).json({erro:"E-mail invalido"});
        return;
    }

    const emailTratado = typeof email === "string" && email.trim() ? email.trim() : null;

    try{
        const resultado = await pool.query(
            `INSERT INTO clientes (nome,email)
            VALUES ($1, $2)
            RETURNING id, nome, email`,
            [nome.trim(), emailTratado]
        );

        res.status(201).json(resultado.rows[0]);
    }catch(erro){
        console.error("Erro ao cadastrar cliente", erro);
        res.status(500).json({erro: "Falha ao cadastrar cliente"});
    }
});

//atualizar dados do cliente
app.patch("/api/clientes/:id", async (req,res) => {
    const id = req.params.id;
    const nome = req.body?.nome;
    const email = req.body?.email;

    if (typeof nome !== "string" || nome.trim().length === 0){
        res.status(400).json({erro: "Nome obrigatorio"});
        return;
    }

    if(email != null && typeof email !== "string"){
        res.status(400).json({erro: "Email invalido"});
        return;
    }
    
    const emailTratado = typeof email === "string" && email.trim() ? email.trim() : null;

    try{
        const resultado = await pool.query(
            `UPDATE clientes
            SET nome = $1, email = $2
            WHERE id = $3
            Returning id, nome, email`,
            [nome.trim(), emailTratado, id]
        );

        if(resultado.rows.length === 0){
            res.status(404).json({erro:"Clientes não encontra"});
            return;
        }

        res.json(resultado.rows[0]);


    }catch(erro){
        console.error("Erro ao editar cliente:", erro);
        res.status(500).json({erro: "Falha ao editar cliente"});
    }

});

//criar projeto direto
app.post("/api/projetos", async (req, res) => {
    const clienteId = req.body?.clienteId;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;

    if (
        typeof clienteId !== "string" || clienteId.trim().length === 0 ||
        typeof titulo !== "string" || titulo.trim().length === 0 ||
        typeof descricao !== "string" || descricao.trim().length === 0
    )   {
        res.status(400).json({
        erro: "Cliente, título e descrição são obrigatórios.",
    });
        return;
    }
    try{
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
            [clienteId,titulo.trim(), descricao.trim()]
        );

        res.status(201).json(resultado.rows[0]);
    }catch(erro){
        console.error("Deu ruim ao criar o projeto", erro);
        res.status(500).json({erro: "Não deu pra criar o projeto",});
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
            [status, id]
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({erro: "Projeto não encontrado.",});
            return;
        }

        res.json(resultado.rows[0]);
        }catch (erro) {
            console.error("Erro ao atualizar projeto:", erro);
            res.status(500).json({erro: "Não foi possível atualizar o projeto.",});
        }
    });

//atualizar projeto por completo
app.patch("/api/projetos/:id", async (req, res) => {
    const id = req.params.id;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;

    if (typeof titulo !== "string" || titulo.trim().length === 0 ||typeof descricao !== "string" || descricao.trim().length === 0) {
        res.status(400).json({erro: "Título e descrição são obrigatórios",});
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
        [titulo.trim(), descricao.trim(), id]
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({erro: "Projeto não encontrado ou arquivado",});
            return;
        }

        res.json(resultado.rows[0]);
    }catch (erro) {
        console.error("Erro ao editar projeto", erro);

        res.status(500).json({erro: "Não foi possível editar o projeto",});
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
        [id]
    );

        if (resultado.rows.length === 0) {
            res.status(404).json({erro: "Projeto não encontrado ou já arquivado",});
            return; 
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error("Erro ao arquivar projeto", erro);

        res.status(500).json({erro: "Não foi possível arquivar o projeto",});
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
        [id]
        );

        if (resultado.rows.length === 0) {
            res.status(404).json({erro: "Projeto não encontrado ou não está arquivado.",});
            return;
        }

        res.json(resultado.rows[0]);
    }catch (erro) {
        console.error("Erro ao restaurar projeto:", erro);

        res.status(500).json({erro: "Não foi possível restaurar o projeto.",});
    }
});

//criar convites
app.post("/api/convites", async (req, res) => {
    const clienteId = req.body?.clienteId ?? null;

    const validadeHoras = req.body?.validadeHoras ?? 48;

    if (![24, 48, 168].includes(validadeHoras)) {
        res.status(400).json({erro: "Prazo de validade inválido."});
        return;
    }

    if (clienteId !== null && (typeof clienteId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId))) {
        res.status(400).json({ erro: "ID do cliente inválido." });
        return;
    }

    try {
        if (clienteId !== null) {
            const cliente = await pool.query(
                `SELECT id, usuario_id
                FROM clientes
                WHERE id = $1`,
                [clienteId]
            );

            if (cliente.rows.length === 0) {
                res.status(404).json({ erro: "Cliente não encontrado." });
                return;
            }

            if (cliente.rows[0].usuario_id !== null) {
                res.status(409).json({ erro: "Este cliente já possui uma conta vinculada." });
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
            [clienteId, token, validadeHoras]
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

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        res.status(400).json({ erro: "ID do convite inválido." });
        return;
    }

    try {
        const resultado = await pool.query(`
            UPDATE convites
            SET revogado_em = NOW()
            WHERE id = $1
                AND usado_em IS NULL
                AND revogado_em IS NULL
                AND expira_em > NOW()

            RETURNING
                id,
                revogado_em AS "revogadoEm"
        `, [id]);

        if (resultado.rows.length === 0) {
            res.status(409).json({ erro: "Convite não encontrado ou indisponível para revogação." });
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

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        res.status(400).json({ erro: "ID do convite inválido" });
        return;
    }

    try {
        const resultado = await pool.query(
            `DELETE FROM convites WHERE id = $1 RETURNING id`,
            [id]
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
        res.status(404).json({erro: "Convite não encontrado."});
        return;
    }

    if (typeof nome !== "string" || !nome.trim() || nome.length > 150) {
        res.status(400).json({erro: "Informe um nome válido."});
        return;
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) {
        res.status(400).json({erro: "Informe um e-mail válido."});
        return;
    }

    if (typeof senha !== "string" || senha.length < 8 || senha.length > 128) {
        res.status(400).json({erro: "A senha deve possuir entre 8 e 128 caracteres."});
        return;
    }

    const emailNormalizado = email.trim().toLowerCase();

    try {
        await dbCadastro.transaction().execute(async (trx) => {

            const resultado = await sql<{id: string; cliente_id: string | null}>`
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
                const resultadoCliente = await sql<{nome: string; usuario_id: string | null}>`
                    SELECT nome, usuario_id
                    FROM clientes
                    WHERE id = ${clienteId}
                    FOR UPDATE
                `.execute(trx);

                const cliente = resultadoCliente.rows[0];

                if (!cliente) throw new ErroCadastro(404, "Cliente não encontrado.");
                if (cliente.usuario_id !== null) throw new ErroCadastro(409, "Este cliente já possui acesso.");

                nomeUsuario = cliente.nome;
            }

            const emailExistente = await sql`
                SELECT id
                FROM "user"
                WHERE LOWER(email) = ${emailNormalizado}
            `.execute(trx);

            if (emailExistente.rows.length > 0) {
                throw new ErroCadastro(409, "Este e-mail já está associado a uma conta.");
            }

            const authCadastro = betterAuth({
                ...auth.options,
                database: {db: trx, type: "postgres", transaction: false},
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
                const novoCliente = await sql<{id: string}>`
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

        res.status(201).json({mensagem: "Conta criada com sucesso."});

    } catch (erro) {
        if (erro instanceof ErroCadastro) {
            res.status(erro.status).json({erro: erro.message});
            return;
        }

        if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "23505") {
            res.status(409).json({erro: "Já existe um cadastro conflitante."});
            return;
        }

        console.error("Falha na aceitação do convite.", erro);
        res.status(500).json({erro: "Não foi possível concluir o cadastro."});
    }
});


//acesso a API
app.listen(3001, () =>{
    console.log("api disponivel na porta: http://localhost:3001");
    
})
