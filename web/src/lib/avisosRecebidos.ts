// A API agrupa eventos e retorna o ID e a data do evento mais recente de cada grupo.
// A primeira consulta estabelece a referência, sem anunciar o histórico.
type Evento = {id:string; criadaEm:string; quantidade:number};
export type ReferenciaAvisos = {instante:number; ids:string[]};
export function detectarNovidades<T extends Evento>(anterior:ReferenciaAvisos|null, itens:T[]) {
    const validos=itens.filter(n=>Number.isFinite(Date.parse(n.criadaEm)));
    const instante=validos.reduce((max,n)=>Math.max(max,Date.parse(n.criadaEm)),anterior?.instante??-Infinity);
    const ids=new Set(instante===anterior?.instante ? anterior.ids : []);
    for(const n of validos) if(Date.parse(n.criadaEm)===instante) ids.add(n.id);
    const novos=anterior===null ? [] : validos.filter(n=>n.quantidade>0 && (Date.parse(n.criadaEm)>anterior.instante || (Date.parse(n.criadaEm)===anterior.instante && !anterior.ids.includes(n.id))));
    return {referencia:{instante,ids:[...ids]},novos};
}

type Pendencia = {categoria:string; projetoId:string|null; marcoId:string|null; conversaId:string|null; titulo:string};
export function detectarUrgencias<T extends Pendencia>(anterior:ReadonlySet<string>|null, itens:T[]) {
    const atuais=itens.filter(p=>p.categoria==='pagamento_atrasado'||p.categoria==='entrega_atrasada');
    const chave=(p:T)=>JSON.stringify([p.categoria,p.projetoId,p.marcoId,p.conversaId,p.marcoId||p.projetoId||p.conversaId?null:p.titulo]);
    const referencia=new Set(atuais.map(chave));
    const novos=atuais.filter(p=>!anterior?.has(chave(p)));
    return {referencia,novos};
}
