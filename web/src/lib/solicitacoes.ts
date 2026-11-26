export type StatusSolicitacao = "pendente" | "aprovada" | "recusada";

export type DecisaoSolicitacao = {
    id: string;
    anterior: StatusSolicitacao;
    status: StatusSolicitacao;
    criadaEm: string;
};

export type SolicitacaoDetalhada = {
    id: string;
    titulo: string;
    descricao: string;
    status: StatusSolicitacao;
    criadaEm: string;
    clienteNome?: string;
    projetoId?: string | null;
    historico?: DecisaoSolicitacao[];
};

export const statusSolicitacao = {
    pendente: {label: "Pendente", color: "yellow"},
    aprovada: {label: "Aprovada", color: "green"},
    recusada: {label: "Recusada", color: "red"},
};

