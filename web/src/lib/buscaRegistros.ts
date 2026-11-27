//pesquisa local sem incluir dados na url
function normalizar(valor: string) {
    return valor.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

export function correspondeBusca(busca: string, ...campos: (string | null | undefined)[]) {
    const texto = normalizar(campos.filter(Boolean).join(" "));
    return normalizar(busca).split(/\s+/).every(termo => texto.includes(termo));
}
