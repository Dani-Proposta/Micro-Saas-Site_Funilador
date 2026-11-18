//a tipagem de solicitações ficaram aqui
export type StatusSolicitacao = "pendente" | "aprovado" | "recusada";


//dados do pedido anotado no sistema
export type Solicitacao = {
    //propriedades de um pedido
    id: string; //id do pedido
    clienteId: string; //id do cliente q pediu
    titulo: string; //titulo principal do pedido
    descricao: string; //breve descrição do pedido
    status: StatusSolicitacao; //estado da solicitação, se foi aceita, recusada ou pendente
    criadoEm: string; //data de criação do pedido

};