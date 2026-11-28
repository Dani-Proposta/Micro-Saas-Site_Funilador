// Somente categorias fixas; nunca enviar título ou resumo originais.
export function categoriaPush(tipo: string, titulo: string): string {
    if (titulo === 'Lembrete de pagamento') return 'lembrete_pagamento';
    if (titulo === 'Marco aguardando pagamento') return 'aguardando_pagamento';
    if (titulo === 'Pagamento registrado' || titulo === 'Recebimento anulado') return 'pagamento_atualizado';
    if (titulo === 'Marco concluído') return 'marco_concluido';
    if (titulo === 'Marco aguardando validação') return 'aguardando_validacao';
    if (titulo === 'Entrega validada') return 'entrega_validada';
    if (titulo === 'Negociação · Nova proposta' || titulo === 'Negociação · Contraproposta') return 'nova_proposta';
    if (titulo.startsWith('Negociação · ')) return 'negociacao_atualizada';
    if (tipo === 'mensagem') return 'nova_mensagem';
    if (tipo === 'solicitacao') return titulo === 'Nova solicitação' ? 'nova_solicitacao' : 'solicitacao_atualizada';
    if (tipo === 'reabertura') return 'reabertura';
    if (tipo === 'projeto') return 'projeto_atualizado';
    if (tipo === 'conversa') return 'conversa_atualizada';
    return 'novidade';
}
