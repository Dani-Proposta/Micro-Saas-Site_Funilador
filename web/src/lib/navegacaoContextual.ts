// Destinos de retorno internos e explicitamente permitidos.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function destinoRetorno(state: unknown, padrao: string): string {
    if (!state || typeof state !== "object" || !("voltarPara" in state)) return padrao;
    const destino = state.voltarPara;
    if (typeof destino !== "string" || !destino.startsWith("/") || destino.startsWith("//")) return padrao;
    try {
        const url = new URL(destino, "https://funilador.invalid");
        if (url.origin !== "https://funilador.invalid") return padrao;
        const partes = url.pathname.split("/");
        if (["/", "/clientes", "/projetos", "/portal", "/portal/projetos"].includes(url.pathname) ||
            (partes.length === 3 && ["clientes", "projetos"].includes(partes[1] ?? "") && uuid.test(partes[2] ?? ""))) {
            return url.pathname + url.search;
        }
    } catch { /* destino inválido */ }
    return padrao;
}

export function caminhoMensagens(clienteId: string, projetoId?: string): string {
    const params = new URLSearchParams({cliente: clienteId});
    if (projetoId) params.set("projeto", projetoId);
    return `/mensagens?${params}`;
}

export const statusProjetos = [
    {value: "planejado", label: "Planejado"},
    {value: "em_andamento", label: "Em andamento"},
    {value: "concluido", label: "Concluído"},
    {value: "cancelado", label: "Cancelado"},
];
export const statusSolicitacoes = [
    {value: "pendente", label: "Pendente"},
    {value: "aprovada", label: "Aprovada"},
    {value: "recusada", label: "Recusada"},
];
export function filtroStatus(params: URLSearchParams, opcoes: {value: string}[]): string {
    const valor = params.get("status");
    return opcoes.some(opcao => opcao.value === valor) ? valor! : "todos";
}
export function comStatus(params: URLSearchParams, valor: string | null): URLSearchParams {
    const proximo = new URLSearchParams(params);
    if (!valor || valor === "todos") proximo.delete("status");
    else proximo.set("status", valor);
    return proximo;
}

// Preserva a cadeia de origem sem aceitar destinos externos ou cadeias ilimitadas.
export type EstadoRetorno = {voltarPara: string; estadoAnterior?: EstadoRetorno};
export function estadoRetorno(state: unknown, profundidade = 0): EstadoRetorno | undefined {
    if (profundidade >= 8) return undefined;
    const voltarPara = destinoRetorno(state, "");
    if (!voltarPara || !state || typeof state !== "object") return undefined;
    const anterior = "estadoAnterior" in state ? estadoRetorno(state.estadoAnterior, profundidade + 1) : undefined;
    return anterior ? {voltarPara, estadoAnterior: anterior} : {voltarPara};
}
export function registrarOrigem(caminho: string, state: unknown): EstadoRetorno {
    const anterior = estadoRetorno(state);
    return anterior ? {voltarPara: caminho, estadoAnterior: anterior} : {voltarPara: caminho};
}
