import { useCallback, useState } from "react";
import { Alert, Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, Title, Tooltip } from "@mantine/core";
import classes from "../styles/Estrutura.module.css";
import { useNavigate } from "react-router";
import { formatarValor } from "../lib/comercial";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Resumo = {
    hoje: string; recebidoMes: string; aReceberMes: string; totalMes: string; futuro: string; atrasado: string; semData: string;
    totalPendente: string; aposPrevisao: string; naoDistribuido: string; excedente: string;
    meses: {mes: string; recebido: string; previsto: string}[];
};

export function FinanceiroDashboard({completo = false, onSelecionar, revisao = 0, esconderAlerta = false}: {completo?: boolean; esconderAlerta?: boolean; onSelecionar?: (categoria: string) => void; revisao?: number}) {
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
    const maior = Math.max(1, ...(dados?.meses.map(m => Number(m.recebido) + Number(m.previsto)) ?? []));
    const mes = (valor: string) => valor.split("-").reverse().join("/");

    return <Stack gap="md">
        {!completo && !esconderAlerta && dados && Number(dados.atrasado) > 0 && <Alert color="red" title="Pagamentos atrasados">
            <Group justify="space-between" align="center"><Text fw={600}>{formatarValor(dados.atrasado)}</Text><Button size="xs" color="red" variant="light" onClick={() => selecionar("atrasado")}>Ver cobranças</Button></Group>
        </Alert>}
        <Group justify="space-between" align="center">
            <Stack gap={2}><Title order={3}>{completo ? "Resumo geral" : "Resumo do mês"}</Title><Text size="sm" c="dimmed">{dados ? mes(dados.hoje.slice(0,7)) : "Recebimentos e previsão"}</Text></Stack>
            {completo ? <Button size="xs" variant="subtle" onClick={atualizar}>Atualizar</Button> : <Button size="xs" variant="light" onClick={() => navigate("/financeiro")}>Financeiro completo</Button>}
        </Group>
        {erro && <Alert color="red">{erro}{dados && " · Exibindo a última consulta disponível."}</Alert>}
        {!dados && !erro && <Text size="sm" c="dimmed">Carregando financeiro...</Text>}
        {dados && <>
            {consulta?.revisao !== revisao && <Text size="xs" c="dimmed">Atualizando valores...</Text>}
            <SimpleGrid cols={{base: 1, xs: 2, lg: completo ? 4 : 3}} spacing="md">
                {[{nome: "Recebido no mês", valor: dados.recebidoMes, cor: "green", categoria: "recebidos", ajuda: "Pagamentos registrados neste mês, sem os anulados."},
                  {nome: "A receber no mês", valor: dados.aReceberMes, cor: undefined, categoria: "mes", ajuda: "Saldos com vencimento de hoje até o fim do mês."},
                  {nome: "Total estimado do mês", valor: dados.totalMes, cor: undefined, categoria: null, ajuda: "Recebido mais previsto no mês. Não inclui atrasados."},
                  ...(completo ? [{nome: "Pagamentos atrasados", valor: dados.atrasado, cor: Number(dados.atrasado) > 0 ? "red" : undefined, categoria: "atrasado", ajuda: "Saldos com vencimento ultrapassado."}] : [])].map(item =>
                    <Card key={item.nome} withBorder padding="md" className={classes.metric}><Group gap={5}><Text size="sm" c="dimmed">{item.nome}</Text><Tooltip label={item.ajuda} multiline w={240} events={{hover:true,focus:true,touch:true}}><Button size="compact-xs" variant="subtle" color="gray" aria-label={item.ajuda}>?</Button></Tooltip></Group><Text className={classes.metricValue} size="xl" fw={700} c={item.cor}>{formatarValor(item.valor)}</Text>{item.categoria && <Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={() => selecionar(item.categoria!)}>Consultar</Button>}</Card>)}
            </SimpleGrid>
            {completo && <Card withBorder padding="md"><Stack gap="md">
                <Group justify="space-between"><Text fw={600}>Previsão de recebimentos</Text><Text size="xs" c="dimmed">Este mês + 5 meses</Text></Group>
                <Group gap="md"><Badge variant="light" color="green">Recebido</Badge><Badge variant="light" color="violet">Previsto</Badge></Group>
                {dados.meses.map(m => <Stack key={m.mes} gap={4}>
                    <Group justify="space-between"><Text size="sm" fw={500}>{mes(m.mes)}</Text><Group gap="xs"><Text size="xs" c="green">{formatarValor(m.recebido)}</Text><Text size="xs" c="violet">{formatarValor(m.previsto)}</Text></Group></Group>
                    <Progress.Root size="md" aria-label={`Recebido e previsto em ${mes(m.mes)}`}><Progress.Section color="green" value={100 * Number(m.recebido) / maior}/><Progress.Section color="violet" value={100 * Number(m.previsto) / maior}/></Progress.Root>
                </Stack>)}
                <SimpleGrid cols={{base: 1, sm: 2, lg: 3}}>
                    {[{nome:"Recebimentos futuros",valor:dados.futuro,categoria:"futuro"},{nome:"Total pendente",valor:dados.totalPendente,categoria:"todos"},{nome:"Sem vencimento definido",valor:dados.semData,categoria:"sem_data"},{nome:"Após o período exibido",valor:dados.aposPrevisao},{nome:"Valor acordado não distribuído",valor:dados.naoDistribuido}].map(item => <Stack key={item.nome} gap={2}><Text size="xs" c="dimmed">{item.nome}</Text><Text fw={600}>{formatarValor(item.valor)}</Text>{item.categoria && <Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={() => selecionar(item.categoria!)}>Consultar</Button>}</Stack>)}
                </SimpleGrid>
                {Number(dados.excedente) > 0 && <Alert color="yellow" title="Marcos acima do valor acordado">{formatarValor(dados.excedente)} de excedente. Revise os acordos dos projetos.</Alert>}
                <Text size="xs" c="dimmed">Previsão baseada nos vencimentos. Atrasados, valores sem data, propostas pendentes e saldos dispensados não entram no total estimado do mês.</Text>
            </Stack></Card>}
        </>}
    </Stack>;
}
