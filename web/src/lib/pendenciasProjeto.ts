//pagamentos que exigem atenção no portal
export type MarcoPagamento = {id: string; status: string; saldo: string | null; vencimento: string | null; cobrancaIniciada: boolean; bloqueiaProgresso: boolean; saldoDispensado: boolean};
export function hojePortal() {
    return new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
export function pagamentoNecessario(m: MarcoPagamento, cancelado: boolean, hoje = hojePortal()) {
    return Number(m.saldo) > 0 && !m.saldoDispensado && !(cancelado && !m.cobrancaIniciada && !["concluido","cancelado","aguardando_validacao"].includes(m.status)) && (m.cobrancaIniciada || m.bloqueiaProgresso || (m.vencimento !== null && m.vencimento <= hoje));
}
export function caminhoPagamento(projeto: string, marco?: string | null) {
    const params = new URLSearchParams({projeto, pagar:"1"});
    if (marco) params.set("marco",marco);
    return `/portal/projetos?${params}`;
}
