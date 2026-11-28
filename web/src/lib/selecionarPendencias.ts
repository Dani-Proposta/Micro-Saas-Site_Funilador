import { caminhoPagamento } from "./pendenciasProjeto";

// uma cobrança atrasada também pode ser necessária; na lista geral aparece uma vez
export function selecionarPendencias<T extends {categoria: string; projetoId: string | null; marcoId: string | null}>(itens: T[], filtro: string): T[] {
    if (filtro !== "todos") return itens;
    const vencidos = new Set(itens.filter(p => p.categoria === "pagamento_atrasado" && p.projetoId && p.marcoId).map(p => `${p.projetoId}:${p.marcoId}`));
    return itens.filter(p => p.categoria !== "pagamento_pendente" || !p.projetoId || !p.marcoId || !vencidos.has(`${p.projetoId}:${p.marcoId}`));
}

// pagamentos e validações levam diretamente à ação, mesmo quando existe uma conversa
export function caminhoPendencia(lado: "admin" | "cliente", item: {categoria: string; projetoId: string | null; marcoId: string | null; conversaId: string | null}): string | null {
    if (lado === "cliente" && item.projetoId) {
        if (item.categoria.startsWith("pagamento_")) return caminhoPagamento(item.projetoId,item.marcoId);
        if (item.categoria === "validacao_pendente") {
            const params = new URLSearchParams({projeto:item.projetoId, validar:"1"});
            if (item.marcoId) params.set("marco",item.marcoId);
            return `/portal/projetos?${params}`;
        }
    }
    if (item.conversaId) return `${lado === "admin" ? "" : "/portal"}/mensagens?conversa=${encodeURIComponent(item.conversaId)}`;
    if (!item.projetoId) return null;
    const id = encodeURIComponent(item.projetoId);
    if (lado === "admin") return `/projetos/${id}${item.marcoId ? `?marco=${encodeURIComponent(item.marcoId)}` : ""}`;
    return `/portal/projetos?projeto=${id}`;
}

// A mesma coleção do Dashboard alimenta o destaque, sem outra consulta ou regra de cobrança.
export function resumirPendenciasProjeto<T extends {categoria: string; projetoId: string | null; marcoId: string | null; total: number}>(dados: T[] | null, projetoId: string) {
    const categorias = ["pagamento_atrasado", "pagamento_pendente", "validacao_pendente", "proposta_pendente"];
    const elegiveis = (dados ?? []).filter(p => categorias.includes(p.categoria));
    const itens = selecionarPendencias(elegiveis.filter(p => p.projetoId === projetoId), "todos")
        .sort((a,b) => categorias.indexOf(a.categoria) - categorias.indexOf(b.categoria));
    // A API limita a quantidade de registros retornados por categoria. Não declare ausência de pendências se a consulta for parcial.
    const parcial = categorias.some(c => {
        const grupo = elegiveis.filter(p => p.categoria === c);
        return grupo.some(p => p.total > grupo.length);
    });
    const prioridade = itens.some(p => p.categoria === "pagamento_atrasado") ? "red" : itens.length ? "yellow" : undefined;
    return {itens, prioridade, parcial};
}
