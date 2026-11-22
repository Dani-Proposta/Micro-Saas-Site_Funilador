//precisa pra se quer existir
import express from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./db.ts";

import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response, NextFunction } from "express";

//funcionalidades importantes
import type { Solicitacao } from "./solicitacao.ts";
import type { Cliente } from "./cliente.ts";
import { toNodeHandler } from "better-auth/node";
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

//aqui eu protego oq só adm pode solicitar

app.use(
  ["/api/clientes", "/api/solicitacoes", "/api/projetos", "/api/dashboard"],
  exigirAdmin
);




//rotas de solicitação
//verificar conexão com api
app.get("/api/health", (_req, res) =>{
    res.json({status: "ok"});
    
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

//solicitar clienteS no plural, a lista de todos eles
app.get("/api/clientes/", async (_req, res) => {
    try{
        const resultado = await pool.query(
            'SELECT id, nome, email FROM clientes'
        );
        res.json(resultado.rows);
    }catch(erro){
        console.error("Erro na DB:", erro);
        res.status(500).json({erro: "Erro no banco de dados"});
    }
});

//solicitar clientes do DB por id especifico
app.get('/api/clientes/:id', async (req, res) => {

    try{
        const resultado = await pool.query(
            'SELECT id, nome, email FROM clientes WHERE id = $1', [req.params.id]
        );

        const cliente = resultado.rows[0];

        if(!cliente){
            res.status(404).json({erro: "esse caba n existe",});
            return;
        }
        res.json(cliente);
    }
    catch(erro){
        console.error("Erro no DB", erro);
        res.status(500).json({erro: "Erro la no banco",});
    }
});

//solicitar os projetos do db 
app.get("/api/projetos", async(req, res) => {

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
            WHERE p.arquivada_em IS NULL
            ORDER BY p.criada_em DESC

        `);
        res.json(resultado.rows)
    }catch(erro){
        console.error("Erro ao procurar os projetos", erro);
        res.status(500).json({erro:"Não foi possivel carregas os projetos"});
    }
});


//rotas de atualização ou pedido ou criação


// criar solicitação
app.post("/api/solicitacoes", async (req, res) =>{
    const clienteId = req.body?.clienteId;
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;
    //se n tiver preenchido nem vai fodase
    if( typeof typeof   typeof clienteId !== 'string' || clienteId.trim().length === 0 || 
                        typeof titulo !== "string" || titulo.trim().length === 0 ||  
                        typeof descricao !== "string" || descricao.trim().length === 0){
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


//acesso a API
app.listen(3001, () =>{
    console.log("api disponivel na porta: http://localhost:3001");
    
})
