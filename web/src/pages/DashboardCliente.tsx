import { ProjetoDestaqueCliente, type ProjetoDestaque } from "../components/ProjetoDestaqueCliente";
import { useModerno } from "../hooks/useInteracaoModerna";
import { Carregamento } from "../components/Carregamento";
import { PendenciasDashboard } from "../components/PendenciasDashboard";
import { IndicadorDashboard } from "../components/IndicadorDashboard";
import { BentoDashboard } from "../components/BentoDashboard";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { formatarPrazo } from "../lib/comercial";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Dashboard.module.css";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";

type Resumo = {projetosPlanejados: number; projetosEmAndamento: number; projetosConcluidos: number; solicitacoesPendentes: number};
type Cliente = {id: string; nome: string; email: string | null};
type Projeto = ProjetoDestaque;

export function DashboardCliente({cliente, mensagensNaoLidas = null}: {cliente: Cliente; mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    const moderno = useModerno();
    const [repeticao,setRepeticao] = useState(0);
    const [atualizando,setAtualizando] = useState(false);
    const repetir = useRef(false);
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [todosProjetos, setProjetos] = useState<Projeto[] | null>(null);
    const projetos = todosProjetos?.filter(p=>p.status === "planejado") ?? null;
    const [erro, setErro] = useState<string | null>(null);
    const [erroProjetos, setErroProjetos] = useState(false);
    const [mostrarZerados, setMostrarZerados] = useState(false);
    const outrosZerados = mensagensNaoLidas === 0 || !!resumo && Object.values(resumo).some(v => v === 0);
    const carregar = useCallback(async (signal: AbortSignal) => {
        setAtualizando(true);
        try {
            const resposta = await fetch("/api/me/dashboard", {signal, cache:"no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar os indicadores");
            const dados: Resumo = await resposta.json();
            if (!signal.aborted) {setResumo(dados); setErro(null); if(repetir.current)setRepeticao(v=>v+1);}
        } catch {
            if (!signal.aborted) setErro("Não foi possível atualizar os indicadores.");
        } finally {if (!signal.aborted){repetir.current=false;setAtualizando(false);}}
    }, []);
    const carregarProjetos = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/me/projetos", {signal, cache:"no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar os projetos");
            const dados: Projeto[] = await resposta.json();
            if (!signal.aborted) {setProjetos(dados); setErroProjetos(false);}
        } catch {
            if (!signal.aborted) setErroProjetos(true);
        }
    }, []);
    const atualizarResumo = useAtualizacaoPeriodica(carregar, 30000);
    const atualizarProjetos = useAtualizacaoPeriodica(carregarProjetos, 30000);
    const planejarVisivel = mostrarZerados || (projetos?.length ?? 0) > 0 || (resumo?.projetosPlanejados ?? 0) > 0;
    const mostrar = (valor: number | null) => mostrarZerados || valor !== 0;
    const temIndicadores = !!resumo && (mostrarZerados || Object.values(resumo).some(v => v !== 0) || mensagensNaoLidas !== 0);
    return <Stack className={`${estrutura.dashboard} ${classes.pagina}`}>
        <Stack gap={4}><Title order={1} className={estrutura.heading}>Olá, {cliente.nome}!</Title><Text c="dimmed" size="sm">Acompanhe seus projetos e solicitações.</Text></Stack>
        <PendenciasDashboard lado="cliente" mostrarZerados={mostrarZerados} onMostrarZerados={setMostrarZerados} outrosZerados={outrosZerados} destaque={moderno ? (pendencias, erroPendencias, atualizarPendencias) => <ProjetoDestaqueCliente projetos={todosProjetos} erro={erroProjetos} pendencias={pendencias} erroPendencias={erroPendencias} onAtualizar={atualizarProjetos} onAtualizarPendencias={atualizarPendencias}/> : undefined}/>
        {(planejarVisivel || erroProjetos) && <Stack gap="xs">
            <Group justify="space-between" wrap="wrap"><Title order={3}>Projetos planejados</Title><Button variant="light" size="xs" onClick={() => navigate("/portal/projetos?status=planejado")}>Ver todos{projetos ? ` (${projetos.length})` : ""}</Button></Group>
            {erroProjetos && <Alert color="red">Não foi possível atualizar os projetos.{projetos && " Exibindo a última consulta."}<Button variant="subtle" size="xs" onClick={atualizarProjetos}>Tentar novamente</Button></Alert>}
            {!projetos && !erroProjetos && <Carregamento tipo="indicadores" quantidade={2} texto="Carregando projetos planejados..."/>}
            {projetos && projetos.length === 0 && <Text c="dimmed" size="sm">Nenhum projeto planejado.</Text>}
            {projetos && projetos.length > 0 && <BentoDashboard className={classes.projetos}>{projetos.slice(0,3).map(p => <Card withBorder padding="sm" component="button" type="button" key={p.id} className={classes.projeto} onClick={() => navigate(`/portal/projetos?projeto=${encodeURIComponent(p.id)}&status=planejado`)}>
                <Group justify="space-between" gap={4} wrap="wrap"><Badge color="violet" variant="light" size="sm">Planejado</Badge><Text size="xs" c="dimmed">↗</Text></Group>
                <Text fw={600} size="sm" style={{overflowWrap:"anywhere"}}>{p.titulo}</Text>
                <Text size="xs" c="dimmed">{p.prazoAcordado ? `Prazo: ${formatarPrazo(p.prazoAcordado)}` : "Prazo a definir"}</Text>
            </Card>)}</BentoDashboard>}
        </Stack>}
        {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
        {!resumo && !erro && <Carregamento tipo="indicadores" texto="Carregando indicadores..."/>}
        {temIndicadores && resumo && <Stack gap="xs">
            <Group justify="space-between"><Title order={3}>Acompanhamento geral</Title>{moderno && <Button className="funilador-atualizar" size="xs" variant="subtle" loading={atualizando} onClick={()=>{repetir.current=true;atualizarResumo();atualizarProjetos();}}>Atualizar</Button>}</Group>
            <BentoDashboard className={classes.grade}>
                {mostrar(resumo.projetosPlanejados) && <IndicadorDashboard repeticao={repeticao} titulo="Projetos planejados" valor={resumo.projetosPlanejados} icone="projetos" cor="violet" abrir={() => navigate("/portal/projetos?status=planejado")}/>}
                {mostrar(resumo.projetosEmAndamento) && <IndicadorDashboard repeticao={repeticao} titulo="Em andamento" valor={resumo.projetosEmAndamento} icone="projetos" abrir={() => navigate("/portal/projetos?status=em_andamento")}/>}
                {mostrar(resumo.projetosConcluidos) && <IndicadorDashboard repeticao={repeticao} titulo="Projetos concluídos" valor={resumo.projetosConcluidos} icone="projetos" cor="green" abrir={() => navigate("/portal/projetos?status=concluido")}/>}
                {mostrar(resumo.solicitacoesPendentes) && <IndicadorDashboard repeticao={repeticao} titulo="Solicitações pendentes" valor={resumo.solicitacoesPendentes} icone="solicitacoes" abrir={() => navigate("/portal/solicitacoes?status=pendente")}/>}
                {mostrar(mensagensNaoLidas) && <IndicadorDashboard repeticao={repeticao} titulo="Mensagens não lidas" valor={mensagensNaoLidas} icone="mensagens" cor={mensagensNaoLidas ? "red" : undefined} abrir={() => navigate("/portal/mensagens")}/>}
            </BentoDashboard>
        </Stack>}
        {resumo && !temIndicadores && <Text size="sm" c="dimmed">Nenhum indicador geral com movimentação.</Text>}
    </Stack>;
}
