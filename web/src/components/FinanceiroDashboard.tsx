import { Carregamento } from "./Carregamento";
import { useCallback, useState } from "react";
import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title, Tooltip } from "@mantine/core";
import classes from "../styles/Estrutura.module.css";
import { SaudeRecebiveis } from "./SaudeRecebiveis";
import { GraficoFinanceiro, HistoricoFinanceiro } from "./GraficosFinanceiros";
import fin from "../styles/Financeiro.module.css";
import visual from "../styles/Dashboard.module.css";
import { useNavigate } from "react-router";
import { formatarValor } from "../lib/comercial";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Resumo = {
    hoje: string; recebidoMes: string; aReceberMes: string; totalMes: string; futuro: string; atrasado: string; semData: string;
    totalPendente: string; aposPrevisao: string; naoDistribuido: string; excedente: string;
    meses: {mes: string; recebido: string; previsto: string}[];
    proximos7?:string; atraso7?:string; atraso15?:string; atraso30?:string; atrasoMaior30?:string;
    historico?: {mes: string; recebido: string}[];
};

export function FinanceiroDashboard({completo = false, onSelecionar, revisao = 0, esconderAlerta = false}: {completo?: boolean; esconderAlerta?: boolean; onSelecionar?: (categoria: string, periodo?:{mes?:string;inicio?:string;fim?:string}) => void; revisao?: number}) {
    const navigate = useNavigate();
    const [consulta, setConsulta] = useState<{dados: Resumo; revisao: number} | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const dados = consulta?.dados;
    const carregar = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/dashboard/financeiro", {signal, cache: "no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar o financeiro");
            const resultado: Resumo = await resposta.json();
            if (!signal.aborted) {setConsulta({dados: resultado, revisao}); setErro(null);}
        } catch {
            if (!signal.aborted) setErro("Não foi possível atualizar o financeiro");
        }
    }, [revisao]);
    const atualizar = useAtualizacaoPeriodica(carregar, 30000);
    const selecionar = (categoria: string) => onSelecionar ? onSelecionar(categoria) : navigate(`/financeiro?categoria=${categoria}`);
    function selecionarMes(mes:string, previsao:boolean) {
        if (!previsao) {onSelecionar?.("recebidos",{mes});return;}
        const [ano,numeroMes] = mes.split("-").map(Number);
        const ultimoDia = new Date(Date.UTC(ano,numeroMes,0)).getUTCDate();
        onSelecionar?.("agenda",{inicio:`${mes}-01`,fim:`${mes}-${String(ultimoDia).padStart(2,"0")}`});
    }
    const maior = Math.max(1, ...(dados?.meses.map(m => Number(m.recebido) + Number(m.previsto)) ?? []));
    const mes = (valor: string) => valor.split("-").reverse().join("/");

    return <Stack gap="md">
        {!completo && !esconderAlerta && dados && Number(dados.atrasado) > 0 && <Alert color="red" title="Pagamentos atrasados">
            <Group justify="space-between" align="center"><Text fw={600}>{formatarValor(dados.atrasado)}</Text><Button size="xs" color="red" variant="light" onClick={() => selecionar("atrasado")}>Ver cobranças</Button></Group>
        </Alert>}
        <Group justify="space-between" align="center" gap="xs" wrap="wrap" className={classes.sectionHeader}>
            <Stack gap={2} className={classes.sectionHeading}><Title order={3}>{completo ? "Resumo geral" : "Resumo do mês"}</Title><Text size="sm" c="dimmed">{dados ? mes(dados.hoje.slice(0,7)) : "Recebimentos e previsão"}</Text></Stack>
            {completo ? <Button size="xs" variant="subtle" onClick={atualizar}>Atualizar</Button> : <Button size="xs" variant="light" onClick={() => navigate("/financeiro")}>Financeiro completo</Button>}
        </Group>
        {erro && <Alert color="red">{erro}{dados && " · Exibindo a última consulta disponível."}</Alert>}
        {!dados && !erro && <Carregamento tipo="indicadores" texto="Carregando financeiro..."/>}
        {dados && <>
            {consulta?.revisao !== revisao && <Text size="xs" c="dimmed">Atualizando valores...</Text>}
            {!completo ? <div className={visual.financeiro}>
                <div className={visual.resumo}>
                    <Card withBorder padding="sm" className={`${visual.financeCard} ${visual.destaque}`}>
                        <Text size="xs" fw={500}>Total estimado do mês</Text>
                        <Text fw={700} className={visual.numero}>{formatarValor(dados.totalMes)}</Text>
                        <Text size="xs" c="dimmed">Recebido + previsto no mês, sem atrasados</Text>
                    </Card>
                    {[{nome:"Recebido no mês",valor:dados.recebidoMes,cor:"green",categoria:"recebidos"},{nome:"A receber no mês",valor:dados.aReceberMes,cor:undefined,categoria:"mes"}].map(item => <Card withBorder padding="sm" className={visual.financeCard} key={item.categoria}>
                        <Text size="xs" c="dimmed">{item.nome}</Text>
                        <Text fw={700} c={item.cor} className={visual.numero}>{formatarValor(item.valor)}</Text>
                        <Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={() => selecionar(item.categoria)}>Consultar</Button>
                    </Card>)}
                </div>
                <Card withBorder padding="sm" className={visual.grafico}><Stack gap="xs">
                    <Group justify="space-between" wrap="wrap" gap={4}><Text fw={600} size="sm">Previsão de recebimentos</Text><Text size="xs" c="dimmed">Este mês + 5 meses</Text></Group>
                    <Group gap={6} wrap="wrap"><Badge color="teal" variant="light" size="sm">Recebido</Badge><Badge color="violet" variant="light" size="sm">Previsto</Badge></Group>
                    {dados.meses.length ? <>
                        <div className={visual.barras} aria-hidden="true">{dados.meses.map(m => <div key={m.mes} title={`${mes(m.mes)} · Recebido: ${formatarValor(m.recebido)} · Previsto: ${formatarValor(m.previsto)}`} className={`${visual.coluna} ${m.mes === dados.hoje.slice(0,7) ? visual.colunaAtual : ""}`}>
                            <div className={visual.trilho}><div className={visual.previsto} style={{height:`${Math.max(0,100 * Number(m.previsto) / maior)}%`}}/><div className={visual.recebido} style={{height:`${Math.max(0,100 * Number(m.recebido) / maior)}%`}}/></div>
                            <span className={visual.rotuloMes}>{mes(m.mes).slice(0,2)}/{m.mes.slice(2,4)}</span>
                        </div>)}</div>
                        {dados.meses.every(m => Number(m.recebido) === 0 && Number(m.previsto) === 0) && <Text size="xs" c="dimmed">Sem recebimentos ou previsões neste período.</Text>}
                        <details className={visual.detalhesGrafico}><summary>Valores por mês</summary>
                            <div className={visual.linhaGrafico}><strong>Mês</strong><strong>Recebido</strong><strong>Previsto</strong></div>
                            {dados.meses.map(m => <div key={m.mes} className={visual.linhaGrafico}><span>{mes(m.mes)}</span><span>{formatarValor(m.recebido)}</span><span>{formatarValor(m.previsto)}</span></div>)}
                        </details>
                    </> : <Text size="xs" c="dimmed">Nenhuma previsão disponível.</Text>}
                    <Text size="xs" c="dimmed">Recebido por data de pagamento; previsto por vencimento, sem atrasados ou valores sem data.</Text>
                </Stack></Card>
            </div> : (
                <SimpleGrid cols={{base: 1, xs: 2, lg: 4}} spacing="xs" className={classes.safeGrid}>
                {[{nome: "Recebido no mês", valor: dados.recebidoMes, cor: "green", categoria: "recebidos", ajuda: "Pagamentos registrados neste mês, sem os anulados."},
                  {nome: "A receber no mês", valor: dados.aReceberMes, cor: undefined, categoria: "mes", ajuda: "Saldos com vencimento de hoje até o fim do mês."},
                  {nome: "Total estimado do mês", valor: dados.totalMes, cor: undefined, categoria: null, ajuda: "Recebido mais previsto no mês. Não inclui atrasados."},
                  {nome: "Pagamentos atrasados", valor: dados.atrasado, cor: Number(dados.atrasado) > 0 ? "red" : undefined, categoria: "atrasado", ajuda: "Saldos com vencimento ultrapassado."}].map(item =>
                    <Card key={item.nome} withBorder padding="sm" className={classes.metric}><Group gap={5}><Text size="sm" c="dimmed">{item.nome}</Text><Tooltip label={item.ajuda} multiline w={240} events={{hover:true,focus:true,touch:true}}><Button size="compact-xs" variant="subtle" color="gray" aria-label={item.ajuda}>?</Button></Tooltip></Group><Text className={classes.metricValue} size="xl" fw={700} c={item.cor}>{formatarValor(item.valor)}</Text>{item.categoria && <Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={() => selecionar(item.categoria!)}>Consultar</Button>}</Card>)}
            </SimpleGrid>
            )}
            {completo && <>
                <div className={fin.graficos}>
                    <GraficoFinanceiro titulo="Previsão de recebimentos" subtitulo="Este mês + 5 meses" meses={dados.meses} previsao onMes={onSelecionar ? m=>selecionarMes(m,true) : undefined}/>
                    <HistoricoFinanceiro meses={dados.historico} onMes={onSelecionar ? m=>selecionarMes(m,false) : undefined}/>
                </div>
                <SaudeRecebiveis dados={dados} onAgenda={()=>selecionar("agenda")} onAtrasados={()=>selecionar("atrasado")}/>
                <Card withBorder padding="sm"><Stack gap="sm">
                <Text fw={600}>Composição e valores fora da previsão</Text>
                <SimpleGrid cols={{base: 1, sm: 2, lg: 3}}>
                    {[{nome:"Recebimentos futuros",valor:dados.futuro,categoria:"futuro"},{nome:"Total pendente",valor:dados.totalPendente,categoria:"todos"},{nome:"Sem vencimento definido",valor:dados.semData,categoria:"sem_data"},{nome:"Após o período exibido",valor:dados.aposPrevisao},{nome:"Valor acordado não distribuído",valor:dados.naoDistribuido}].map(item => <Stack key={item.nome} gap={2}><Text size="xs" c="dimmed">{item.nome}</Text><Text fw={600}>{formatarValor(item.valor)}</Text>{item.categoria && <Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={() => selecionar(item.categoria!)}>Consultar</Button>}</Stack>)}
                </SimpleGrid>
                {Number(dados.excedente) > 0 && <Alert color="yellow" title="Marcos acima do valor acordado">{formatarValor(dados.excedente)} de excedente. Revise os acordos dos projetos.</Alert>}
                <Text size="xs" c="dimmed">Previsão baseada nos vencimentos. Atrasados, valores sem data, propostas pendentes e saldos dispensados não entram no total estimado do mês.</Text>
            </Stack></Card></>}
        </>}
    </Stack>;
}
