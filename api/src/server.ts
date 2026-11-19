//precisa pra se quer existir
import express from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./db.ts";
//funcionalidades importantes
import type { Solicitacao } from "./solicitacao.ts";
import type { Cliente } from "./cliente.ts";


const app = express();
app.use(express.json());


//rotas de solicitação
app.get("/api/health", (_req, res) =>{
    res.json({status: "ok"});
    
});

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



//rotas de atualização ou pedido
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
    //teste local com cliente ficticio

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


app.patch("/api/solicitacoes/:id/status", async (req, res) => {
    const id = req.params.id;
    const status = req.body?.status;


    if(
        status !== "pendente" &&
        status !== "aprovada" &&
        status !== "recusada"
    ){
        res.status(400).json({erro:"tem coisa errada nesses status ai",});
        return;
    }

    try{
        const resultado = await pool.query(
            `UPDATE solicitacoes
            SET status = $1
            WHERE id = $2
            RETURNING id, status`,
            [status,id]
        );

        if(resultado.rows.length === 0){
            res.status(404).json({erro:"Solicitação não encontrada bixo"});
            return;
        }

        res.json(resultado.rows[0]);
    }catch(erro){
        console.error("Não deu pra atualizar a solicitação",erro);
        res.status(500).json({erro:"Falha na atu da solicitação"})
    }

});













//acesso a API
app.listen(3001, () =>{
    console.log("api disponivel na porta: http://localhost:3001");
    
})



//referente aos pedidos de clientes e informações importantes
const solicitacoes: Solicitacao[] = [
];

const clientes: Cliente[] = [
  {
    id: 'cliente-001',
    nome: 'Cliente de teste',
  },
];