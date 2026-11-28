type ConversaOrdenavel = {id: string; tipo: string; criadaEm: string; naoLidas?: number; ultimaAtividadeEm?: string};
export function totalNaoLidas(conversas: ConversaOrdenavel[]) {
    return conversas.reduce((total, conversa) => total + (conversa.naoLidas ?? 0), 0);
}
export function atividadeMaisRecente(conversas: ConversaOrdenavel[]) {
    return conversas.reduce((data, conversa) => Math.max(data, Date.parse(conversa.ultimaAtividadeEm ?? conversa.criadaEm) || 0), 0);
}
export function ordenarConversas<T extends ConversaOrdenavel>(conversas: T[]): T[] {
    return [...conversas].sort((a, b) =>
        Number(b.tipo === "geral") - Number(a.tipo === "geral") ||
        Number((b.naoLidas ?? 0) > 0) - Number((a.naoLidas ?? 0) > 0) ||
        atividadeMaisRecente([b]) - atividadeMaisRecente([a]) || a.id.localeCompare(b.id)
    );
}
