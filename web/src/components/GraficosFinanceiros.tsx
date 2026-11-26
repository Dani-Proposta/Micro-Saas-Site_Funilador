import { useState } from "react";
import type { ReactNode } from "react";
import { Card, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { formatarValor } from "../lib/comercial";
import classes from "../styles/Financeiro.module.css";

type MesFinanceiro = {mes:string; recebido:string; previsto?:string};
export type GrupoFinanceiro = {id:string; nome:string; valor:string};
const mesCurto = (mes:string) => `${mes.slice(5,7)}/${mes.slice(2,4)}`;
const numero = (valor?:string) => Math.max(0, Number(valor ?? 0) || 0);
const percentual = (valor:number, total:number) => total > 0 ? Math.min(100,100*valor/total) : 0;

export function GraficoFinanceiro({titulo,subtitulo,meses,previsao=false,controle,onMes}:{titulo:string; subtitulo:string; meses:MesFinanceiro[]; previsao?:boolean; controle?:ReactNode; onMes?:(mes:string)=>void}) {
    const maior = Math.max(1,...meses.map(m=>numero(m.recebido)+(previsao ? numero(m.previsto) : 0)));
    const vazio = meses.every(m=>numero(m.recebido)+(previsao ? numero(m.previsto) : 0)===0);
    return <Card withBorder padding="sm" className={classes.grafico}><Stack gap="sm">
        <Group justify="space-between" align="start" gap={6}><Stack gap={2}><Text fw={600}>{titulo}</Text><Text size="xs" c="dimmed">{subtitulo}</Text></Stack>{controle}</Group>
        <Group gap="sm"><span className={classes.legenda}><i className={classes.recebido}/>Recebido</span>{previsao && <span className={classes.legenda}><i className={classes.previsto}/>A receber</span>}</Group>
        {meses.length > 0 ? <>
            <div className={`${classes.chart} ${meses.length>6 ? classes.chartLongo : ""}`} style={{gridTemplateColumns:`repeat(${meses.length},minmax(0,1fr))`}}>
                {meses.map(m=><button type="button" disabled={!onMes} onClick={()=>onMes?.(m.mes)} key={m.mes} className={`${classes.coluna} ${classes.colunaBotao}`} aria-label={`${previsao ? "Consultar vencimentos" : "Consultar recebimentos"} de ${mesCurto(m.mes)}`} title={`${mesCurto(m.mes)} · Recebido: ${formatarValor(m.recebido)}${previsao ? ` · A receber: ${formatarValor(m.previsto ?? "0")}` : ""}`}>
                    <div className={classes.trilho}>{previsao && <div className={classes.previsto} style={{height:`${percentual(numero(m.previsto),maior)}%`}}/>}<div className={classes.recebido} style={{height:`${percentual(numero(m.recebido),maior)}%`}}/></div>
                    <span>{mesCurto(m.mes)}</span>
                </button>)}
            </div>
            {onMes && <Text size="xs" c="dimmed">{previsao ? "Selecione um mês para consultar os vencimentos não atrasados." : "Selecione um mês para consultar seus recebimentos."}</Text>}
            {vazio && <Text size="xs" c="dimmed">Nenhum valor neste período.</Text>}
            <details className={classes.detalhes}><summary>Consultar valores exatos</summary>
                <div className={classes.valores} data-previsao={previsao}><strong>Mês</strong><strong>Recebido</strong>{previsao && <strong>A receber</strong>}</div>
                {meses.map(m=><div className={classes.valores} data-previsao={previsao} key={m.mes}><span>{mesCurto(m.mes)}</span><span>{formatarValor(m.recebido)}</span>{previsao && <span>{formatarValor(m.previsto ?? "0")}</span>}</div>)}
            </details>
        </> : <Text size="sm" c="dimmed">Dados indisponíveis.</Text>}
        <Text size="xs" c="dimmed">{previsao ? "Recebido por data de pagamento; a receber por vencimento, sem atrasados e valores sem data. Não representa uma previsão histórica." : "Recebimentos efetivos por data de pagamento, sem anulados. Inclui o mês atual."}</Text>
    </Stack></Card>;
}

export function HistoricoFinanceiro({meses,onMes}:{meses?:MesFinanceiro[]; onMes?:(mes:string)=>void}) {
    const [periodo,setPeriodo] = useState("6");
    return <GraficoFinanceiro titulo="Histórico de recebimentos" subtitulo="Período até o mês atual" onMes={onMes} meses={(meses ?? []).slice(-Number(periodo))} controle={<SegmentedControl size="xs" value={periodo} onChange={setPeriodo} data={[{value:"3",label:"3m"},{value:"6",label:"6m"},{value:"12",label:"12m"}]}/>}/>;
}

export function DistribuicaoFinanceira({clientes,projetos,total,historico,onSelecionar}:{clientes?:GrupoFinanceiro[]; projetos?:GrupoFinanceiro[]; total:string; historico:boolean; onSelecionar?:(tipo:"cliente"|"projeto",id:string)=>void}) {
    const [tipo,setTipo] = useState("cliente");
    const grupos = tipo === "cliente" ? clientes : projetos;
    const base = numero(total);
    return <Card withBorder padding="sm" className={classes.distribuicao}><Stack gap="xs">
        <Group justify="space-between" align="start" gap={6}><Stack gap={2}><Text fw={600} size="sm">Distribuição da seleção</Text><Text size="xs" c="dimmed">{historico ? "Recebimentos sem anulados" : "Saldo dos registros selecionados"} · Todas as páginas</Text></Stack><SegmentedControl size="xs" value={tipo} onChange={setTipo} data={[{value:"cliente",label:"Clientes"},{value:"projeto",label:"Projetos"}]}/></Group>
        {!grupos ? <Text size="xs" c="dimmed">Distribuição indisponível. Confira a versão da API.</Text> : grupos.length === 0 ? <Text size="xs" c="dimmed">Não há valores positivos para distribuir.</Text> : <>
            {grupos.map(g=><div key={g.id} className={classes.grupo}><Group justify="space-between" gap={4} wrap="wrap">{onSelecionar && g.id!=="outros" ? <button type="button" className={`${classes.nomeGrupo} ${classes.grupoBotao}`} onClick={()=>onSelecionar(tipo === "cliente" ? "cliente" : "projeto",g.id)}>{g.nome}</button> : <Text size="xs" fw={500} className={classes.nomeGrupo}>{g.nome}</Text>}<Text size="xs" className={classes.valor}>{formatarValor(g.valor)} · {percentual(numero(g.valor),base).toLocaleString("pt-BR",{maximumFractionDigits:1})}%</Text></Group><div className={classes.barraGrupo} aria-hidden="true"><div style={{width:`${percentual(numero(g.valor),base)}%`}}/></div></div>)}
            {grupos.some(g=>g.id==="outros") && <Text size="xs" c="dimmed">Outros reúne todos os grupos fora dos oito maiores.</Text>}
        </>}
    </Stack></Card>;
}
