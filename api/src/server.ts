//precisa pra se quer existir
import express from "express";
import { randomUUID } from 'node:crypto';

//funcionalidades importantes
import type { Solicitacao } from './solicitacao.ts';
import type { Cliente } from './cliente.ts';


const app = express();
app.use(express.json());


//rotas de solicitação
app.get("/api/health", (_req, res) =>{
    res.json({status: "ok"});
    
});

app.get("/api/solicitacoes", (_req, res) =>{
    res.json(solicitacoes);
});

app.get('/api/clientes/:id', (req, res) => {
    const cliente = clientes.find((numero) => numero.id === req.params.id);
    if(!cliente){
        res.status(404).json({erro: "tem niguem não zé"});
        return;
    }
    res.json(clientes);
});

//rotas de atualização ou pedido

app.post("/api/solicitacoes", (req, res) =>{
    const titulo = req.body?.titulo;
    const descricao = req.body?.descricao;

    const clienteId = "cliente-011"

    const clienteExiste = clientes.some((cliente) => cliente.id === clienteId);
    if(!clienteExiste){
        res.status(400).json({erro: "esse caba n existe",});
        return;
    }


    if(typeof titulo !== "string" || titulo.trim().length === 0 || typeof descricao !== "string" || descricao.trim().length === 0){
        res.status(400).json({erro: "Titulo e descrição são obrigatórios por favor né!"});
        return;
    }

    const novaSolicitacao: Solicitacao = {
        id: randomUUID(),
        clienteId,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        status: "pendente",
        criadoEm: new Date().toISOString(),
    };

    solicitacoes.push(novaSolicitacao);
    res.status(201).json(novaSolicitacao);
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