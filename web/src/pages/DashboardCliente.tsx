import { useExpressivo } from "../lib/contextoAparencia";
import { IconTrophy, IconArrowUpRight, IconSparkles, IconFolder, IconClipboardList, IconMessageCircle } from "@tabler/icons-react";
import { ContadorDashboard } from "../components/IndicadorDashboard";
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
    const expressivo = useExpressivo();
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
    const trajetoria = expressivo ? <Card withBorder className="ex-trajetoria"><Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap"><Group gap="sm" wrap="nowrap"><span className="ex-trajetoria-emblema"><IconTrophy size={32} stroke={1.6}/></span><Stack gap={3}><Text size="xs" fw={700} className="ex-trajetoria-sobretitulo">SUA TRAJETÓRIA</Text><Title order={2}>Tudo o que já construímos juntos</Title><Text size="sm" c="dimmed">{resumo && resumo.projetosConcluidos > 0 ? "Cada projeto concluído é uma conquista. Veja o quanto já avançamos!" : "Cada novo projeto é o começo de uma conquista."}</Text></Stack></Group><Button className="funilador-atualizar" variant="light" size="xs" loading={atualizando} onClick={()=>{repetir.current=true;atualizarResumo();atualizarProjetos();}}>Atualizar</Button></Group>
        {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
        {!resumo && !erro && <Carregamento tipo="indicadores" texto="Carregando sua trajetória..."/>}
        {resumo && <div className="ex-trajetoria-grade">
            {[{titulo:"Projetos concluídos",valor:resumo.projetosConcluidos,estado:"concluido",icone:IconTrophy,rota:"/portal/projetos?status=concluido"},{titulo:"Em andamento",valor:resumo.projetosEmAndamento,estado:"em_andamento",icone:IconSparkles,rota:"/portal/projetos?status=em_andamento"},{titulo:"Projetos planejados",valor:resumo.projetosPlanejados,estado:"planejado",icone:IconFolder,rota:"/portal/projetos?status=planejado"},{titulo:"Solicitações pendentes",valor:resumo.solicitacoesPendentes,estado:"solicitacoes",icone:IconClipboardList,rota:"/portal/solicitacoes?status=pendente"}].map(item=><button type="button" key={item.estado} className="ex-trajetoria-item" data-ex-estado={item.estado} data-conquista={item.estado==="concluido"&&item.valor>0} onClick={()=>navigate(item.rota)} aria-label={`${item.titulo}: ${item.valor}. Consultar`}><span className="ex-trajetoria-item-topo"><item.icone size={22} stroke={1.7}/><IconArrowUpRight size={15} aria-hidden="true"/></span><strong><ContadorDashboard valor={item.valor} repeticao={repeticao}/></strong><span>{item.titulo}</span><small>Consultar <IconArrowUpRight size={13}/></small></button>)}
        </div>}
        <Group justify="space-between" align="center" gap="xs" wrap="wrap"><Text size="xs" c="dimmed">Projetos não arquivados · Sua história continua aqui.</Text><Group gap="xs"><Button size="xs" variant="subtle" leftSection={<IconMessageCircle size={16}/>} onClick={()=>navigate("/portal/mensagens")}>Mensagens{mensagensNaoLidas != null ? ` (${mensagensNaoLidas} não lidas)` : ""}</Button><Button size="xs" variant="light" rightSection={<IconArrowUpRight size={15}/>} onClick={()=>navigate("/portal/projetos")}>Todos os projetos</Button></Group></Group>
    </Stack></Card> : null;
    return <Stack className={`${estrutura.dashboard} ${classes.pagina}`}>
        <Stack gap={4}><Title order={1} className={estrutura.heading}>Olá, {cliente.nome}!</Title><Text c="dimmed" size="sm">Acompanhe seus projetos e solicitações.</Text></Stack>
        <PendenciasDashboard lado="cliente" compacto={expressivo} mostrarZerados={mostrarZerados} onMostrarZerados={setMostrarZerados} outrosZerados={outrosZerados} destaque={moderno ? (pendencias, erroPendencias, atualizarPendencias) => <>{trajetoria}<ProjetoDestaqueCliente projetos={todosProjetos} erro={erroProjetos} pendencias={pendencias} erroPendencias={erroPendencias} onAtualizar={atualizarProjetos} onAtualizarPendencias={atualizarPendencias}/></> : undefined}/>
        {!expressivo && (planejarVisivel || erroProjetos) && <Stack gap="xs">
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
        {!expressivo && <>{erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
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
        {resumo && !temIndicadores && <Text size="sm" c="dimmed">Nenhum indicador geral com movimentação.</Text>}</>}
    </Stack>;
}
