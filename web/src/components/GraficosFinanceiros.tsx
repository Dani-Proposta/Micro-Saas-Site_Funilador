import { lazy, Suspense } from "react";
import { useExpressivo } from "../lib/contextoAparencia";
import { TransicaoConteudo } from "./InteracaoModerna";
import { IconeModerno } from "./AcabamentoModerno";
import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";
import { IconArrowUpRight, IconCalendarDue, IconReceipt } from "@tabler/icons-react";
import { Button, Card, Group, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import { formatarValor } from "../lib/comercial";
import classes from "../styles/Financeiro.module.css";

const SerieExpressiva = lazy(()=>import("./expressivo/GraficosExpressivos").then(m=>({default:m.SerieExpressiva})));
const DistribuicaoExpressiva = lazy(()=>import("./expressivo/GraficosExpressivos").then(m=>({default:m.DistribuicaoExpressiva})));
type MesFinanceiro = {mes:string; recebido:string; previsto?:string};
export type GrupoFinanceiro = {id:string; nome:string; valor:string};
const mesCurto = (mes:string) => `${mes.slice(5,7)}/${mes.slice(2,4)}`;
const numero = (valor?:string) => Math.max(0, Number(valor ?? 0) || 0);
const rotuloValor = (v:number) => new Intl.NumberFormat("pt-BR",v<10000 ? {maximumFractionDigits:2} : {notation:"compact",maximumFractionDigits:1}).format(v);
const percentual = (valor:number, total:number) => total > 0 ? Math.min(100,100*valor/total) : 0;

export function GraficoFinanceiro({titulo,subtitulo,meses,previsao=false,controle,onMes,onRecebido,mesAtual,className}:{titulo:string; subtitulo:string; meses:MesFinanceiro[]; previsao?:boolean; controle?:ReactNode; onMes?:(mes:string)=>void; onRecebido?:(mes:string)=>void; mesAtual?:string; className?:string}) {
    const {aparencia} = useAparencia();

    const reduzir = useMovimentoReduzido();
    const moderno = aparencia.estilo === "moderno";
    const expressivo = useExpressivo();
    const maior = Math.max(1,...meses.map(m=>numero(m.recebido)+(previsao ? numero(m.previsto) : 0)));
    const vazio = meses.every(m=>numero(m.recebido)+(previsao ? numero(m.previsto) : 0)===0);
    if(expressivo)return <Suspense fallback={<Text size="sm">Carregando análise...</Text>}><SerieExpressiva className={className} titulo={titulo} meses={meses} previsao={previsao} controle={controle} onMes={onMes} onRecebido={onRecebido} mesAtual={mesAtual}/></Suspense>;
    return <Card withBorder padding="sm" className={`${classes.grafico} ${className ?? ""}`}><Stack gap="sm">
        <Group justify="space-between" align="start" gap={6}><Stack gap={2}><Text fw={600} className="funilador-grafico-titulo"><IconeModerno nome="grafico" tamanho={20}/>{titulo}</Text><Text size="xs" c="dimmed">{subtitulo}</Text></Stack>{controle}</Group>
        <Group gap="sm"><span className={classes.legenda}><i className={classes.recebido}/>Recebido</span>{previsao && <span className={classes.legenda}><i className={classes.previsto}/>A receber</span>}</Group>
        {meses.length > 0 ? <>
            <motion.div layout={moderno && !reduzir ? "size" : false} className={`${classes.chart} ${meses.length>6 ? classes.chartLongo : ""} ${moderno ? "funilador-grafico-unificado" : ""}`} style={{gridTemplateColumns:`repeat(${meses.length},minmax(0,1fr))`}}>
                {meses.map(m => {
                    const podeReceber = !!onRecebido && (!mesAtual || m.mes <= mesAtual);
                    const abrirRecebido = moderno && podeReceber && numero(m.recebido)>0;
                    const acao = abrirRecebido ? onRecebido : onMes;
                    const destino = abrirRecebido || !previsao ? "recebimentos" : "vencimentos";
                    if (!moderno) return <button type="button" disabled={!onMes} onClick={()=>onMes?.(m.mes)} key={m.mes} className={`${classes.coluna} ${classes.colunaBotao}`} aria-label={`${previsao ? "Consultar vencimentos" : "Consultar recebimentos"} de ${mesCurto(m.mes)}`} title={`${mesCurto(m.mes)} · Recebido: ${formatarValor(m.recebido)}${previsao ? ` · A receber: ${formatarValor(m.previsto ?? "0")}` : ""}`}>
                        <div className={classes.trilho}>{previsao && <div className={classes.previsto} style={{height:`${percentual(numero(m.previsto),maior)}%`}}/>}<div className={classes.recebido} style={{height:`${percentual(numero(m.recebido),maior)}%`}}/></div><span>{mesCurto(m.mes)}</span>
                    </button>;
                    const rotulo = `${mesCurto(m.mes)} · Recebido: ${formatarValor(m.recebido)}${previsao ? ` · A receber: ${formatarValor(m.previsto ?? "0")}` : ""}`;
                    return <Tooltip key={m.mes} className={classes.tooltipGrafico} withinPortal multiline w={240} position="top" events={{hover:true,focus:true,touch:false}} openDelay={90} label={<Stack gap={4}><Text fw={700} size="sm">{mesCurto(m.mes)}</Text><Text size="xs">Recebido: {formatarValor(m.recebido)}</Text>{previsao && <Text size="xs">Previsto: {formatarValor(m.previsto ?? "0")}</Text>}{acao && <Text size="xs" fw={600}>Abrir {destino} ↗</Text>}</Stack>}>
                        <motion.button layout={reduzir ? false : "position"} whileTap={reduzir ? undefined : {scale:.97}} type="button" disabled={!acao} onClick={()=>acao?.(m.mes)} className={`${classes.coluna} ${classes.colunaBotao} ${classes.colunaModerna}`} data-mes-atual={m.mes===mesAtual} aria-label={`${rotulo}${acao ? `; abrir ${destino}` : ""}`}>
                            <div className={classes.trilho}>
                                <span className="funilador-rotulo-barra" style={{bottom:`${Math.min(100,percentual(numero(m.recebido)+(previsao?numero(m.previsto):0),maior))}%`}} aria-hidden="true">{rotuloValor(numero(m.recebido)+(previsao?numero(m.previsto):0))}</span>
                                {previsao && <motion.div className={classes.previsto} initial={reduzir ? false : {height:0}} animate={{height:`${percentual(numero(m.previsto),maior)}%`}} transition={{duration:reduzir?0:.55,ease:"easeOut"}}/>}
                                <motion.div className={classes.recebido} initial={reduzir ? false : {height:0}} animate={{height:`${percentual(numero(m.recebido),maior)}%`}} transition={{duration:reduzir?0:.55,ease:"easeOut"}}/>
                            </div><span>{mesCurto(m.mes)} {acao && <IconArrowUpRight size={12} aria-hidden="true"/>}</span>
                        </motion.button>
                    </Tooltip>;
                })}
            </motion.div>
            {moderno && <Text size="xs" c="dimmed">Valores em R$ (total das barras; valores abreviados quando necessário).</Text>}
            {onMes && <Text size="xs" c="dimmed">{moderno && previsao && onRecebido ? "Clique no mês para abrir recebimentos (quando houver) ou vencimentos. Em valores exatos, escolha qualquer uma das duas consultas." : previsao ? "Selecione um mês para consultar os vencimentos não atrasados." : "Selecione um mês para consultar seus recebimentos."}</Text>}
            {vazio && <Text size="xs" c="dimmed">Nenhum valor neste período.</Text>}
            <details className={classes.detalhes}><summary>Consultar valores exatos</summary>
                <div className={classes.valores} data-previsao={previsao}><strong>Mês</strong><strong>Recebido</strong>{previsao && <strong>A receber</strong>}</div>
                {meses.map(m=><div className={classes.valores} data-previsao={previsao} key={m.mes}><span>{mesCurto(m.mes)}</span><span>{moderno && onRecebido && (!mesAtual || m.mes<=mesAtual) ? <Button size="compact-xs" variant="subtle" leftSection={<IconReceipt size={13}/>} onClick={()=>onRecebido(m.mes)} aria-label={`Recebimentos de ${mesCurto(m.mes)}`}>{formatarValor(m.recebido)}</Button> : formatarValor(m.recebido)}</span>{previsao && <span>{moderno && onMes ? <Button size="compact-xs" variant="subtle" leftSection={<IconCalendarDue size={13}/>} onClick={()=>onMes(m.mes)} aria-label={`Vencimentos de ${mesCurto(m.mes)}`}>{formatarValor(m.previsto ?? "0")}</Button> : formatarValor(m.previsto ?? "0")}</span>}</div>)}
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
    const expressivo = useExpressivo();
    const grupos = tipo === "cliente" ? clientes : projetos;
    const base = numero(total);
    return <Card withBorder padding="sm" className={`${classes.distribuicao} funilador-distribuicao`}><Stack gap="xs">
        <Group justify="space-between" align="start" gap={6}><Stack gap={2}><Text fw={600} size="sm">Distribuição da seleção</Text><Text size="xs" c="dimmed">{historico ? "Recebimentos sem anulados" : "Saldo dos registros selecionados"} · Todas as páginas</Text></Stack><SegmentedControl size="xs" value={tipo} onChange={setTipo} data={[{value:"cliente",label:"Clientes"},{value:"projeto",label:"Projetos"}]}/></Group>
        {expressivo && grupos && <Suspense fallback={<Text size="sm">Carregando distribuição...</Text>}><DistribuicaoExpressiva key={tipo} tipo={tipo === "cliente" ? "cliente" : "projeto"} grupos={grupos} selecionar={onSelecionar ? id=>onSelecionar(tipo === "cliente" ? "cliente" : "projeto",id) : undefined}/></Suspense>}
        <TransicaoConteudo identidade={tipo}>{!grupos ? <Text size="xs" c="dimmed">Distribuição indisponível. Confira a versão da API.</Text> : grupos.length === 0 ? <Text size="xs" c="dimmed">Não há valores positivos para distribuir.</Text> : <>
            {grupos.map(g=><div key={g.id} className={classes.grupo}><Group justify="space-between" gap={4} wrap="wrap">{onSelecionar && g.id!=="outros" ? <button type="button" className={`${classes.nomeGrupo} ${classes.grupoBotao}`} onClick={()=>onSelecionar(tipo === "cliente" ? "cliente" : "projeto",g.id)}>{g.nome}</button> : <Text size="xs" fw={500} className={classes.nomeGrupo}>{g.nome}</Text>}<Text size="xs" className={classes.valor}>{formatarValor(g.valor)} · {percentual(numero(g.valor),base).toLocaleString("pt-BR",{maximumFractionDigits:1})}%</Text></Group><div className={classes.barraGrupo} aria-hidden="true"><div style={{width:`${percentual(numero(g.valor),base)}%`}}/></div></div>)}
            {grupos.some(g=>g.id==="outros") && <Text size="xs" c="dimmed">Outros reúne todos os grupos fora dos oito maiores.</Text>}
        </>}</TransicaoConteudo>
    </Stack></Card>;
}
