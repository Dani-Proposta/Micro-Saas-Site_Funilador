import express from "express";
import type { Solicitacao } from './solicitacao.ts';


const app = express();

//rotas e pedidos
app.get("/api/health", (_req, res) =>{

    res.json({status: "ok"});
    
});

app.get("/api/solicitacoes", (_req, res) =>{
    res.json(solicitacoes);
});


//acesso a API
app.listen(3001, () =>{
    console.log("api disponivel na porta: http://localhost:3001");
    
})



//referente aos pedidos de clientes e informações importantes
const solicitacoes: Solicitacao[] = [
];