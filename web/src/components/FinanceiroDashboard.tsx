import { useCallback, useState } from "react";
import { Alert, Badge, Button, Card, Group, Progress, Select, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useNavigate } from "react-router";
import { formatarPrazo, formatarValor } from "../lib/comercial";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Categoria = "atrasado" | "mes" | "futuro" | "sem_data";
type Pendencia = {id: string; projetoId: string; projeto: string; marco: string; cliente: string; vencimento: string | null; saldo: string; categoria: Categoria; arquivado: boolean; cobrancaIniciada: boolean; bloqueiaProgresso: boolean};
type Recebimento = {id: string; projetoId: string; projeto: string; marco: string; cliente: string; valor: string; data: string};
type Financeiro = {
    hoje: string; recebidoMes: string; aReceberMes: string; totalMes: string; futuro: string; atrasado: string; semData: string;
    totalPendente: string; aposPrevisao: string; naoDistribuido: string; excedente: string;
    quantidadePendentes: number; quantidadeRecebimentos: number;
    meses: {mes: string; recebido: string; previsto: string}[];
    pendencias: Pendencia[]; recebimentos: Recebimento[];
};

const categorias: Record<Categoria, string> = {atrasado: "Atrasado", mes: "Neste mês", futuro: "Futuro", sem_data: "Sem data"};
const filtros = [{value: "todos", label: "Todas as pendências"}, ...Object.entries(categorias).map(([value,label]) => ({value,label})), {value: "recebidos", label: "Recebidos neste mês"}];

function nomeMes(mes: string) {
    const [ano, numero] = mes.split("-");
    return `${numero}/${ano}`;
}

export function FinanceiroDashboard() {
    const navigate = useNavigate();
    const [dados, setDados] = useState<Financeiro | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [filtro, setFiltro] = useState("todos");
    const [expandido, setExpandido] = useState(false);
    const carregar = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/dashboard/financeiro", {signal, cache: "no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar o financeiro");
            const resultado: Financeiro = await resposta.json();
            if (!signal.aborted) {setDados(resultado); setErro(null);}
        } catch {
            if (!signal.aborted) setErro("Não foi possível atualizar o financeiro");
        }
    }, []);
    const atualizar = useAtualizacaoPeriodica(carregar, 30000);
    const abrirProjeto = (id: string) => navigate(`/projetos/${id}`, {state: {voltarPara: "/"}});
    const selecionar = (valor: string) => {setFiltro(valor); setExpandido(true);};
    const maior = Math.max(1, ...(dados?.meses.map(m => Number(m.recebido) + Number(m.previsto)) ?? []));
    const pendencias = dados?.pendencias.filter(p => filtro === "todos" || p.categoria === filtro) ?? [];

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Stack gap={2}>
                    <Title order={3}>Resumo financeiro</Title>
                    <Text size="sm" c="dimmed">{dados ? nomeMes(dados.hoje.slice(0,7)) : "Recebimentos e previsão"}</Text>
                </Stack>
                <Button size="xs" variant="subtle" onClick={atualizar}>Atualizar</Button>
            </Group>
            {erro && <Alert color="red">{erro}{dados && " · Exibindo a última consulta disponível."}</Alert>}
            {!dados && !erro && <Text size="sm" c="dimmed">Carregando financeiro...</Text>}
            {dados && <>
                <SimpleGrid cols={{base: 1, xs: 2, lg: 4}} spacing="md">
                    {[{nome: "Recebido no mês", valor: dados.recebidoMes, cor: "green", filtro: "recebidos"}, {nome: "A receber no mês", valor: dados.aReceberMes, cor: undefined, filtro: "mes"}, {nome: "Recebimentos futuros", valor: dados.futuro, cor: undefined, filtro: "futuro"}, {nome: "Pagamentos atrasados", valor: dados.atrasado, cor: Number(dados.atrasado) > 0 ? "red" : undefined, filtro: "atrasado"}].map(item => (
                        <Card key={item.filtro} withBorder padding="md" component="button" type="button" onClick={() => selecionar(item.filtro)} style={{textAlign: "left", cursor: "pointer"}}>
                            <Text size="sm" c="dimmed">{item.nome}</Text>
                            <Text size="xl" fw={700} c={item.cor}>{formatarValor(item.valor)}</Text>
                        </Card>
                    ))}
                </SimpleGrid>
                <Card withBorder padding="md">
                    <Stack gap="md">
                        <Group justify="space-between"><Text fw={600}>Previsão de recebimentos</Text><Text size="xs" c="dimmed">Este mês + 5 meses</Text></Group>
                        <Group gap="md"><Badge variant="light" color="green">Recebido</Badge><Badge variant="light" color="violet">Previsto</Badge></Group>
                        {dados.meses.map(m => <Stack key={m.mes} gap={4}>
                            <Group justify="space-between" wrap="wrap">
                                <Text size="sm" fw={500}>{nomeMes(m.mes)}</Text>
                                <Group gap="xs"><Text size="xs" c="green">{formatarValor(m.recebido)}</Text><Text size="xs" c="violet">{formatarValor(m.previsto)}</Text></Group>
                            </Group>
                            <Progress.Root size="md" aria-label={`Recebido e previsto em ${nomeMes(m.mes)}`}>
                                <Progress.Section color="green" value={100 * Number(m.recebido) / maior}/>
                                <Progress.Section color="violet" value={100 * Number(m.previsto) / maior}/>
                            </Progress.Root>
                        </Stack>)}
                        <SimpleGrid cols={{base: 1, sm: 2}} spacing="sm">
                            <Stack gap={2}><Text size="xs" c="dimmed">Total do mês (recebido + previsto)</Text><Text fw={600}>{formatarValor(dados.totalMes)}</Text></Stack>
                            <Stack gap={2}><Text size="xs" c="dimmed">Total pendente (todas as datas)</Text><Text fw={600}>{formatarValor(dados.totalPendente)}</Text></Stack>
                            <UnstyledButton onClick={() => selecionar("sem_data")}><Stack gap={2}><Text size="xs" c="dimmed">Sem vencimento definido ›</Text><Text fw={600}>{formatarValor(dados.semData)}</Text></Stack></UnstyledButton>
                            <Stack gap={2}><Text size="xs" c="dimmed">Após o período exibido</Text><Text fw={600}>{formatarValor(dados.aposPrevisao)}</Text></Stack>
                            <Stack gap={2}><Text size="xs" c="dimmed">Valor acordado não distribuído</Text><Text fw={600}>{formatarValor(dados.naoDistribuido)}</Text></Stack>
                        </SimpleGrid>
                        {Number(dados.excedente) > 0 && <Alert color="yellow" title="Marcos acima do valor acordado">{formatarValor(dados.excedente)} de excedente. Revise os acordos dos projetos.</Alert>}
                        <Text size="xs" c="dimmed">Previsão baseada nos vencimentos dos marcos. Atrasados e valores sem data ficam separados do total do mês. Propostas pendentes, saldos dispensados e valores não distribuídos não entram na previsão.</Text>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" fw={500}>Detalhes financeiros</Text>
                            <Button variant="light" size="xs" onClick={() => setExpandido(v => !v)}>{expandido ? "Recolher" : "Consultar"}</Button>
                        </Group>
                        {expandido && <Stack gap="sm">
                            <Select aria-label="Filtrar detalhes financeiros" data={filtros} value={filtro} onChange={v => setFiltro(v ?? "todos")} allowDeselect={false}/>
                            {filtro === "recebidos" ? <>
                                {dados.recebimentos.length === 0 && <Text size="sm" c="dimmed">Nenhum recebimento neste mês.</Text>}
                                {dados.quantidadeRecebimentos > dados.recebimentos.length && <Text size="xs" c="dimmed">Mostrando os 100 recebimentos mais recentes. Os totais incluem todos.</Text>}
                                {dados.recebimentos.map(r => <Card key={r.id} withBorder padding="sm" component="button" type="button" onClick={() => abrirProjeto(r.projetoId)} style={{textAlign: "left", cursor: "pointer"}}>
                                    <Group justify="space-between" align="start" wrap="wrap"><Stack gap={2}><Text fw={500} size="sm">{r.marco}</Text><Text size="xs" c="dimmed">{r.projeto} · {r.cliente}</Text><Text size="xs" c="dimmed">{formatarPrazo(r.data)}</Text></Stack><Text fw={600} c="green">{formatarValor(r.valor)} ›</Text></Group>
                                </Card>)}
                            </> : <>
                                {dados.quantidadePendentes > dados.pendencias.length && <Text size="xs" c="dimmed">Mostrando até 100 pendências por categoria, por ordem de vencimento. Os totais incluem todos os registros.</Text>}
                                {pendencias.length === 0 && <Text size="sm" c="dimmed">Nenhuma pendência nesta seleção.</Text>}
                                {pendencias.map(p => <Card key={p.id} withBorder padding="sm" component="button" type="button" onClick={() => abrirProjeto(p.projetoId)} style={{textAlign: "left", cursor: "pointer"}}>
                                    <Group justify="space-between" align="start" wrap="wrap">
                                        <Stack gap={3}><Text fw={500} size="sm">{p.marco}</Text><Text size="xs" c="dimmed">{p.projeto} · {p.cliente}</Text><Text size="xs" c="dimmed">{p.vencimento ? `Vencimento: ${formatarPrazo(p.vencimento)}` : "Sem vencimento"}</Text><Group gap={4}><Badge size="xs" color={p.categoria === "atrasado" ? "red" : "gray"} variant="light">{categorias[p.categoria]}</Badge>{p.arquivado && <Badge size="xs" color="gray">Arquivado</Badge>}{p.bloqueiaProgresso && <Badge size="xs" color="orange">Aguardando pagamento</Badge>}{!p.cobrancaIniciada && <Badge size="xs" color="gray" variant="outline">Não cobrado</Badge>}</Group></Stack>
                                        <Text fw={600}>{formatarValor(p.saldo)} ›</Text>
                                    </Group>
                                </Card>)}
                            </>}
                        </Stack>}
                    </Stack>
                </Card>
            </>}
        </Stack>
    );
}
