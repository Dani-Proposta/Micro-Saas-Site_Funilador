import { useCallback, useState } from "react";
import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useNavigate } from "react-router";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { formatarPrazo, formatarValor } from "../lib/comercial";
import { caminhoPagamento } from "../lib/pendenciasProjeto";

const categorias = [
    {id: "pagamento_atrasado", nome: "Pagamentos atrasados", cor: "red", ajuda: "Saldos com vencimento ultrapassado."},
    {id: "entrega_atrasada", nome: "Entregas atrasadas", cor: "red", ajuda: "Prazos de projetos ou marcos não concluídos já vencidos."},
    {id: "pagamento_pendente", nome: "Pagamentos necessários", cor: "yellow", ajuda: "Cobranças em andamento ou pagamentos necessários para prosseguir; inclui vencimentos de hoje no portal."},
    {id: "entrega_proxima", nome: "Entregas próximas", cor: "yellow", ajuda: "Prazos de hoje até os próximos 7 dias."},
    {id: "aguardando_resposta", nome: "Clientes aguardando resposta", cor: "yellow", ajuda: "Última mensagem do cliente há pelo menos 24 horas, sem resposta posterior."},
    {id: "prioridade_alta", nome: "Prioridade alta", cor: "violet", ajuda: "Projetos ativos classificados com prioridade alta."},
    {id: "proposta_pendente", nome: "Propostas pendentes", cor: "yellow", ajuda: "Negociações ativas aguardando resposta."},
    {id: "validacao_pendente", nome: "Entregas para validar", cor: "yellow", ajuda: "Marcos aguardando a confirmação do cliente."},
    {id: "reabertura_pendente", nome: "Reaberturas pendentes", cor: "yellow", ajuda: "Conversas arquivadas com solicitação de reabertura."},
    {id: "sem_atualizacao", nome: "Projetos sem atualização", cor: "gray", ajuda: "Projetos em andamento sem alterações há pelo menos 7 dias."},
    {id: "conversa_inativa", nome: "Conversas inativas", cor: "gray", ajuda: "Conversas de projetos em andamento sem mensagens há pelo menos 7 dias."},
] as const;
type Categoria = typeof categorias[number]["id"];
type Pendencia = {categoria: Categoria; titulo: string; subtitulo: string; projetoId: string | null; marcoId: string | null; conversaId: string | null; data: string | null; valor: string | null; detalhe: string; total: number; totalValor: string | null};
const categoriasCliente: Categoria[] = ["pagamento_atrasado", "pagamento_pendente", "validacao_pendente", "proposta_pendente"];

export function PendenciasDashboard({lado}: {lado: "admin" | "cliente"}) {
    const navigate = useNavigate();
    const [dados, setDados] = useState<Pendencia[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<Categoria | "todos">("todos");
    const [limite, setLimite] = useState(6);
    const [mostrarZerados, setMostrarZerados] = useState(false);
    const carregar = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch(lado === "admin" ? "/api/dashboard/pendencias" : "/api/me/dashboard/pendencias", {signal, cache: "no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar as pendências");
            const itens: Pendencia[] = await resposta.json();
            if (!signal.aborted) {setDados(itens); setErro(null);}
        } catch {
            if (!signal.aborted) setErro("Não foi possível atualizar as pendências.");
        }
    }, [lado]);
    const atualizar = useAtualizacaoPeriodica(carregar, 30000);
    const disponiveis = categorias.filter(c => lado === "admin" || categoriasCliente.includes(c.id));
    const quantidade = (id: Categoria) => dados?.find(p => p.categoria === id)?.total ?? 0;
    const selecionados = disponiveis.filter(c => filtro === "todos" || filtro === c.id);
    const visiveis = selecionados.flatMap(c => (dados ?? []).filter(p => p.categoria === c.id));
    const selecionar = (id: Categoria | "todos") => {setFiltro(id); setLimite(6);};

    function abrir(item: Pendencia) {
        const origem = lado === "admin" ? "/" : "/portal";
        if (item.conversaId) {
            navigate(`${lado === "admin" ? "/mensagens" : "/portal/mensagens"}?conversa=${encodeURIComponent(item.conversaId)}`, {state: {voltarPara: origem}});
        } else if (item.projetoId) {
            const id = encodeURIComponent(item.projetoId);
            if (lado === "admin") navigate(`/projetos/${id}${item.marcoId ? `?marco=${encodeURIComponent(item.marcoId)}` : ""}`, {state: {voltarPara: origem}});
            else if (item.categoria === "pagamento_atrasado" || item.categoria === "pagamento_pendente") navigate(caminhoPagamento(item.projetoId,item.marcoId), {state:{voltarPara:origem}});
            else navigate(`/portal/projetos?projeto=${id}${item.categoria === "validacao_pendente" ? `&validar=1${item.marcoId ? `&marco=${encodeURIComponent(item.marcoId)}` : ""}` : ""}`, {state: {voltarPara: origem}});
        }
    }

    return <Stack gap="sm">
        <Group justify="space-between" align="center">
            <Stack gap={2}><Title order={3}>Precisam de atenção</Title><Text c="dimmed" size="sm">{lado === "admin" ? "Organize o que precisa fazer primeiro." : "Ações pendentes dos seus projetos."}</Text></Stack>
            <Button size="xs" variant="subtle" onClick={atualizar}>Atualizar</Button>
        </Group>
        {erro && <Alert color="red">{erro}{dados && " Exibindo a última consulta."}</Alert>}
        {!dados && !erro && <Text c="dimmed" size="sm">Carregando pendências...</Text>}
        {dados && <>
            <SimpleGrid cols={{base: 1, xs: 2, lg: 3}} spacing="xs">
                {disponiveis.filter(c => quantidade(c.id) > 0 || filtro === c.id || (lado === "admin" && mostrarZerados)).map(c => <Card key={c.id} withBorder padding="sm">
                    <Group justify="space-between" wrap="nowrap"><Text size="sm" fw={500}>{c.nome}</Text><Tooltip label={c.ajuda} multiline w={240} events={{hover: true, focus: true, touch: true}}><Button size="compact-xs" variant="subtle" color="gray" aria-label={c.ajuda}>?</Button></Tooltip></Group>
                    <Group justify="space-between" align="center"><Stack gap={0}><Text size="xl" fw={700} c={quantidade(c.id) ? c.cor : "dimmed"}>{quantidade(c.id)}</Text>{dados.find(p => p.categoria === c.id)?.totalValor != null && <Text size="sm" fw={600}>{formatarValor(dados.find(p => p.categoria === c.id)?.totalValor)}</Text>}</Stack><Button size="compact-xs" variant={filtro === c.id ? "filled" : "light"} aria-pressed={filtro === c.id} onClick={() => selecionar(c.id)}>Consultar</Button></Group>
                </Card>)}
            </SimpleGrid>
            {lado === "admin" && disponiveis.some(c => quantidade(c.id) === 0) && <Button variant="subtle" size="xs" style={{alignSelf: "flex-start"}} onClick={() => setMostrarZerados(v => !v)}>{mostrarZerados ? "Ocultar indicadores zerados" : "Mostrar indicadores zerados"}</Button>}
            <Group justify="space-between"><Text fw={600} size="sm">{filtro === "todos" ? "Pendências" : disponiveis.find(c => c.id === filtro)?.nome}</Text>{filtro !== "todos" && <Button size="compact-xs" variant="subtle" onClick={() => selecionar("todos")}>Mostrar todas</Button>}</Group>
            {visiveis.length === 0 && <Text c="dimmed" size="sm">Nenhuma pendência neste filtro.</Text>}
            {visiveis.slice(0, limite).map((item, i) => {
                const cat = disponiveis.find(c => c.id === item.categoria);
                return <Card key={`${item.categoria}-${item.projetoId}-${item.marcoId}-${item.conversaId}-${i}`} withBorder padding="sm"><Group justify="space-between" align="center" wrap="wrap">
                    <Stack gap={3} style={{flex: 1, minWidth: 0}}><Text fw={600} style={{overflowWrap: "anywhere"}}>{item.titulo}</Text><Text size="xs" c="dimmed" style={{overflowWrap: "anywhere"}}>{item.subtitulo}</Text><Group gap={5} wrap="wrap"><Badge size="sm" variant="light" color={cat?.cor}>{cat?.nome}</Badge><Text size="xs" c="dimmed">{item.detalhe}{item.data ? ` · ${formatarPrazo(item.data)}` : ""}</Text></Group>{item.valor !== null && <Text fw={600}>{formatarValor(item.valor)}</Text>}</Stack>
                    <Button size="xs" variant="light" onClick={() => abrir(item)}>{item.conversaId ? "Abrir conversa" : lado === "cliente" && item.categoria === "validacao_pendente" ? "Validar entregas" : lado === "cliente" && item.categoria.startsWith("pagamento_") ? "Ver pagamento" : "Abrir projeto"}</Button>
                </Group></Card>;
            })}
            {visiveis.length > limite && <Button size="xs" variant="subtle" onClick={() => setLimite(n => n + 10)}>Mostrar mais ({visiveis.length - limite})</Button>}
            {selecionados.some(c => quantidade(c.id) > 100) && <Text size="xs" c="dimmed">Exibindo até 100 registros por categoria. Os indicadores contabilizam todos.</Text>}
            {lado === "admin" && quantidade("pagamento_atrasado") > 0 && <Button variant="subtle" size="xs" style={{alignSelf: "flex-start"}} onClick={() => navigate("/financeiro?categoria=atrasado")}>Ver cobranças atrasadas no financeiro</Button>}
        </>}
    </Stack>;
}
