import { Carregamento } from "../components/Carregamento";
import { PendenciasDashboard } from "../components/PendenciasDashboard";
import { IndicadorDashboard } from "../components/IndicadorDashboard";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { formatarPrazo } from "../lib/comercial";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Dashboard.module.css";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";

type Resumo = {projetosPlanejados: number; projetosEmAndamento: number; projetosConcluidos: number; solicitacoesPendentes: number};
type Cliente = {id: string; nome: string; email: string | null};
type Projeto = {id: string; titulo: string; status: string; prazoAcordado: string | null};

export function DashboardCliente({cliente, mensagensNaoLidas = null}: {cliente: Cliente; mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [projetos, setProjetos] = useState<Projeto[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [erroProjetos, setErroProjetos] = useState(false);
    const [mostrarZerados, setMostrarZerados] = useState(false);
    const outrosZerados = mensagensNaoLidas === 0 || !!resumo && Object.values(resumo).some(v => v === 0);
    const carregar = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/me/dashboard", {signal, cache:"no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar os indicadores");
            const dados: Resumo = await resposta.json();
            if (!signal.aborted) {setResumo(dados); setErro(null);}
        } catch {
            if (!signal.aborted) setErro("Não foi possível atualizar os indicadores.");
        }
    }, []);
    const carregarProjetos = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/me/projetos", {signal, cache:"no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar os projetos");
            const dados: Projeto[] = await resposta.json();
            if (!signal.aborted) {setProjetos(dados.filter(p => p.status === "planejado")); setErroProjetos(false);}
        } catch {
            if (!signal.aborted) setErroProjetos(true);
        }
    }, []);
    useAtualizacaoPeriodica(carregar, 30000);
    const atualizarProjetos = useAtualizacaoPeriodica(carregarProjetos, 30000);
    const planejarVisivel = mostrarZerados || (projetos?.length ?? 0) > 0 || (resumo?.projetosPlanejados ?? 0) > 0;
    const mostrar = (valor: number | null) => mostrarZerados || valor !== 0;
    const temIndicadores = !!resumo && (mostrarZerados || Object.values(resumo).some(v => v !== 0) || mensagensNaoLidas !== 0);
    return <Stack className={`${estrutura.dashboard} ${classes.pagina}`}>
        <Stack gap={4}><Title order={1} className={estrutura.heading}>Olá, {cliente.nome}!</Title><Text c="dimmed" size="sm">Acompanhe seus projetos e solicitações.</Text></Stack>
        <PendenciasDashboard lado="cliente" mostrarZerados={mostrarZerados} onMostrarZerados={setMostrarZerados} outrosZerados={outrosZerados}/>
        {(planejarVisivel || erroProjetos) && <Stack gap="xs">
            <Group justify="space-between" wrap="wrap"><Title order={3}>Projetos planejados</Title><Button variant="light" size="xs" onClick={() => navigate("/portal/projetos?status=planejado")}>Ver todos{projetos ? ` (${projetos.length})` : ""}</Button></Group>
            {erroProjetos && <Alert color="red">Não foi possível atualizar os projetos.{projetos && " Exibindo a última consulta."}<Button variant="subtle" size="xs" onClick={atualizarProjetos}>Tentar novamente</Button></Alert>}
            {!projetos && !erroProjetos && <Carregamento tipo="indicadores" quantidade={2} texto="Carregando projetos planejados..."/>}
            {projetos && projetos.length === 0 && <Text c="dimmed" size="sm">Nenhum projeto planejado.</Text>}
            {projetos && projetos.length > 0 && <div className={classes.projetos}>{projetos.slice(0,3).map(p => <Card withBorder padding="sm" component="button" type="button" key={p.id} className={classes.projeto} onClick={() => navigate(`/portal/projetos?projeto=${encodeURIComponent(p.id)}&status=planejado`)}>
                <Group justify="space-between" gap={4} wrap="wrap"><Badge color="violet" variant="light" size="sm">Planejado</Badge><Text size="xs" c="dimmed">↗</Text></Group>
                <Text fw={600} size="sm" style={{overflowWrap:"anywhere"}}>{p.titulo}</Text>
                <Text size="xs" c="dimmed">{p.prazoAcordado ? `Prazo: ${formatarPrazo(p.prazoAcordado)}` : "Prazo a definir"}</Text>
            </Card>)}</div>}
        </Stack>}
        {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
        {!resumo && !erro && <Carregamento tipo="indicadores" texto="Carregando indicadores..."/>}
        {temIndicadores && resumo && <Stack gap="xs">
            <Title order={3}>Acompanhamento geral</Title>
            <div className={classes.grade}>
                {mostrar(resumo.projetosPlanejados) && <IndicadorDashboard titulo="Projetos planejados" valor={resumo.projetosPlanejados} icone="projetos" cor="violet" abrir={() => navigate("/portal/projetos?status=planejado")}/>}
                {mostrar(resumo.projetosEmAndamento) && <IndicadorDashboard titulo="Em andamento" valor={resumo.projetosEmAndamento} icone="projetos" abrir={() => navigate("/portal/projetos?status=em_andamento")}/>}
                {mostrar(resumo.projetosConcluidos) && <IndicadorDashboard titulo="Projetos concluídos" valor={resumo.projetosConcluidos} icone="projetos" cor="green" abrir={() => navigate("/portal/projetos?status=concluido")}/>}
                {mostrar(resumo.solicitacoesPendentes) && <IndicadorDashboard titulo="Solicitações pendentes" valor={resumo.solicitacoesPendentes} icone="solicitacoes" abrir={() => navigate("/portal/solicitacoes?status=pendente")}/>}
                {mostrar(mensagensNaoLidas) && <IndicadorDashboard titulo="Mensagens não lidas" valor={mensagensNaoLidas} icone="mensagens" cor={mensagensNaoLidas ? "red" : undefined} abrir={() => navigate("/portal/mensagens")}/>}
            </div>
        </Stack>}
        {resumo && !temIndicadores && <Text size="sm" c="dimmed">Nenhum indicador geral com movimentação.</Text>}
    </Stack>;
}
