export type DadosSolicitacao = {
    orcamentoEsperado: string | null;
    prazoEsperado: string | null;
};

export type DadosProjeto = {
    valorAcordado: string | null;
    prazoAcordado: string | null;
    tecnologias: string[];
    progresso: number | null;
    modoProgresso: "manual" | "marcos";
};

export type DadosProjetoAdmin = DadosProjeto & {
    progressoManual: number | null;
    prioridade: "baixa" | "normal" | "alta" | null;
    observacoesInternas: string | null;
};

export const prioridades = [{value: "baixa", label: "Baixa"}, {value: "normal", label: "Normal"}, {value: "alta", label: "Alta"}];

//formatar valor e prazo
export function formatarValor(valor: string | null | undefined) {
    return valor == null ? "Não definido" : new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"}).format(Number(valor));
}

export function formatarPrazo(prazo: string | null | undefined) {
    return prazo ? prazo.split("-").reverse().join("/") : "Não definido";
}
