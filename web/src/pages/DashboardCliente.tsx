import { caminhoPendencia, resumirPendenciasProjeto } from "../lib/selecionarPendencias";
import { formatarValor } from "../lib/comercial";
import type { Pendencia } from "../components/PendenciasDashboard";
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
import { Alert, Badge, Button, Card, Group, Progress, Select, Stack, Text, Title } from "@mantine/core";

type Resumo = {projetosPlanejados: number; projetosEmAndamento: number; projetosConcluidos: number; solicitacoesPendentes: number};
type Cliente = {id: string; nome: string; email: string | null};
type Projeto = ProjetoDestaque;

export function DashboardCliente({cliente, mensagensNaoLidas = null}: {cliente: Cliente; mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    const moderno = useModerno();
    const expressivo = useExpressivo();
    const [criterioSimples,setCriterioSimples] = useState("recente");
    const [pendenciasExpandidas,setPendenciasExpandidas] = useState<string|null>(null);
    const [repeticao,setRepeticao] = useState(0);
    const [atualizando,setAtualizando] = useState(false);
    const repetir = useRef(false);
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [todosProjetos, setProjetos] = useState<Projeto[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [erroProjetos, setErroProjetos] = useState(false);
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
    const trajetoria = expressivo ? <Card withBorder className="ex-trajetoria"><Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap"><Group gap="sm" wrap="nowrap"><span className="ex-trajetoria-emblema"><IconTrophy size={32} stroke={1.6}/></span><Stack gap={3}><Text size="xs" fw={700} className="ex-trajetoria-sobretitulo">SUA TRAJETÓRIA</Text><Title order={2}>Tudo o que já construímos juntos</Title><Text size="sm" c="dimmed">{resumo && resumo.projetosConcluidos > 0 ? "Cada projeto concluído é uma conquista. Veja o quanto já avançamos!" : "Cada novo projeto é o começo de uma conquista."}</Text></Stack></Group><Button className="funilador-atualizar" variant="light" size="xs" loading={atualizando} onClick={()=>{repetir.current=true;atualizarResumo();atualizarProjetos();}}>Atualizar</Button></Group>
        {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
        {!resumo && !erro && <Carregamento tipo="indicadores" texto="Carregando sua trajetória..."/>}
        {resumo && <div className="ex-trajetoria-grade">
            {[{titulo:"Projetos concluídos",valor:resumo.projetosConcluidos,estado:"concluido",icone:IconTrophy,rota:"/portal/projetos?status=concluido"},{titulo:"Em andamento",valor:resumo.projetosEmAndamento,estado:"em_andamento",icone:IconSparkles,rota:"/portal/projetos?status=em_andamento"},{titulo:"Projetos planejados",valor:resumo.projetosPlanejados,estado:"planejado",icone:IconFolder,rota:"/portal/projetos?status=planejado"},{titulo:"Solicitações pendentes",valor:resumo.solicitacoesPendentes,estado:"solicitacoes",icone:IconClipboardList,rota:"/portal/solicitacoes?status=pendente"}].map(item=><button type="button" key={item.estado} className="ex-trajetoria-item" data-ex-estado={item.estado} data-conquista={item.estado==="concluido"&&item.valor>0} onClick={()=>navigate(item.rota)} aria-label={`${item.titulo}: ${item.valor}. Consultar`}><span className="ex-trajetoria-item-topo"><item.icone size={22} stroke={1.7}/><IconArrowUpRight size={15} aria-hidden="true"/></span><strong><ContadorDashboard valor={item.valor} repeticao={repeticao}/></strong><span>{item.titulo}</span><small>Consultar <IconArrowUpRight size={13}/></small></button>)}
        </div>}
        <Group justify="space-between" align="center" gap="xs" wrap="wrap"><Text size="xs" c="dimmed">Projetos não arquivados · Sua história continua aqui.</Text><Group gap="xs"><Button size="xs" variant="subtle" leftSection={<IconMessageCircle size={16}/>} onClick={()=>navigate("/portal/mensagens")}>Mensagens{mensagensNaoLidas != null ? ` (${mensagensNaoLidas} não lidas)` : ""}</Button><Button size="xs" variant="light" rightSection={<IconArrowUpRight size={15}/>} onClick={()=>navigate("/portal/projetos")}>Todos os projetos</Button></Group></Group>
    </Stack></Card> : null;
    const trajetoriaSimples = <Card withBorder padding="sm" radius={moderno ? "md" : "sm"}><Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap">
            <Stack gap={3} style={{minWidth:0}}><Title order={3}>Sua trajetória</Title><Text size="sm" c="dimmed">{resumo && resumo.projetosConcluidos > 0 ? "Veja tudo o que já construímos juntos." : "Acompanhe seus projetos e conquistas."}</Text></Stack>
            <Button className="funilador-atualizar" size="xs" variant="subtle" loading={atualizando} onClick={()=>{repetir.current=true;atualizarResumo();atualizarProjetos();}}>Atualizar</Button>
        </Group>
        {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
        {!resumo && !erro && <Carregamento tipo="indicadores" texto="Carregando indicadores..."/>}
        {resumo && <BentoDashboard className={classes.grade}>
            <IndicadorDashboard repeticao={repeticao} titulo="Projetos concluídos" valor={resumo.projetosConcluidos} icone="projetos" cor="green" abrir={()=>navigate("/portal/projetos?status=concluido")}/>
            <IndicadorDashboard repeticao={repeticao} titulo="Em andamento" valor={resumo.projetosEmAndamento} icone="projetos" abrir={()=>navigate("/portal/projetos?status=em_andamento")}/>
            <IndicadorDashboard repeticao={repeticao} titulo="Projetos planejados" valor={resumo.projetosPlanejados} icone="projetos" cor="violet" abrir={()=>navigate("/portal/projetos?status=planejado")}/>
            <IndicadorDashboard repeticao={repeticao} titulo="Solicitações pendentes" valor={resumo.solicitacoesPendentes} icone="solicitacoes" abrir={()=>navigate("/portal/solicitacoes?status=pendente")}/>
        </BentoDashboard>}
        <Group justify="space-between" align="center" gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">Projetos não arquivados.</Text>
            <Group gap="xs" wrap="wrap"><Button size="xs" variant="subtle" onClick={()=>navigate("/portal/mensagens")}>Mensagens{mensagensNaoLidas != null ? ` (${mensagensNaoLidas} não lidas)` : ""}</Button><Button size="xs" variant="light" onClick={()=>navigate("/portal/projetos")}>Todos os projetos ↗</Button></Group>
        </Group>
    </Stack></Card>;
    const candidatos = todosProjetos ?? [];
    const ativos = candidatos.filter(p=>p.status === "planejado" || p.status === "em_andamento");
    const ordenados = [...(ativos.length ? ativos : candidatos.filter(p=>p.status === "concluido"))].sort((a,b)=>b.atualizadaEm.localeCompare(a.atualizadaEm));
    const projetoSimples = criterioSimples === "prazo" ? [...ordenados].filter(p=>p.prazoAcordado).sort((a,b)=>a.prazoAcordado!.localeCompare(b.prazoAcordado!))[0] : criterioSimples === "progresso" ? [...ordenados].filter(p=>p.progresso != null).sort((a,b)=>b.progresso!-a.progresso!)[0] : ordenados[0];
    const destaqueSimples = (pendencias:Pendencia[]|null, erroPendencias:string|null, atualizarPendencias:()=>void) => {
        const atencao=projetoSimples ? resumirPendenciasProjeto(pendencias,projetoSimples.id) : null;
        return <Card withBorder padding="sm" radius="sm" style={atencao?.prioridade ? {borderColor:`var(--mantine-color-${atencao.prioridade}-6)`,borderInlineStartWidth:3} : undefined}><Stack gap="sm">
        <Group justify="space-between" wrap="wrap"><Title order={3}>Projeto em destaque</Title><Button variant="subtle" size="xs" onClick={()=>{atualizarProjetos();atualizarPendencias();}}>Atualizar</Button></Group>
        <Select label="Critério do projeto em destaque" size="sm" style={{width:"100%",maxWidth:320,minWidth:0}} value={criterioSimples} allowDeselect={false} onChange={v=>setCriterioSimples(v??"recente")} data={[{value:"recente",label:"Último atualizado"},{value:"prazo",label:"Prazo mais próximo"},{value:"progresso",label:"Mais próximo de concluir (%)"}]}/>
        {erroProjetos && <Alert color="red">Não foi possível atualizar os projetos.{todosProjetos && " Exibindo a última consulta."}</Alert>}
        {!todosProjetos && !erroProjetos && <Carregamento tipo="indicadores" texto="Carregando projetos..."/>}
        {todosProjetos && !projetoSimples && <Text size="sm" c="dimmed">Nenhum projeto com dados para este critério. Experimente outra opção.</Text>}
        {projetoSimples && <>
            <Group gap="xs" wrap="wrap"><Badge variant="light" color={projetoSimples.status === "concluido" ? "green" : projetoSimples.status === "planejado" ? "violet" : "blue"}>{projetoSimples.status === "concluido" ? "Concluído" : projetoSimples.status === "planejado" ? "Planejado" : "Em andamento"}</Badge></Group>
            <Text fw={600} style={{overflowWrap:"anywhere"}}>{projetoSimples.titulo}</Text>
            {atencao && (atencao.itens.length>0 || atencao.parcial || erroPendencias || pendencias===null) && <Alert color={atencao.prioridade??"gray"} title={atencao.prioridade==="red"?"Atenção imediata neste projeto":atencao.prioridade==="yellow"?"Este projeto precisa da sua atenção":"Pendências deste projeto"}>
                <Stack gap="xs">
                    {erroPendencias ? <Text size="xs">Não foi possível atualizar as pendências.{pendencias && " Exibindo a última consulta."} <Button variant="subtle" size="compact-xs" onClick={atualizarPendencias}>Tentar novamente</Button></Text> : pendencias===null ? <Text size="xs">Consultando pendências...</Text> : null}
                    {atencao.itens.slice(0,pendenciasExpandidas===projetoSimples.id?undefined:3).map((item,i)=>{const rota=caminhoPendencia("cliente",item);const urgente=item.categoria==="pagamento_atrasado";const rotulo=urgente?"Pagamento atrasado":item.categoria==="pagamento_pendente"?"Pagamento necessário":item.categoria==="validacao_pendente"?"Entrega para validar":"Proposta para responder";return <Card key={`${item.categoria}-${item.marcoId}-${item.conversaId}-${i}`} withBorder radius="sm" padding="xs"><Stack gap={4}><Text fw={700} size="sm" c={urgente?"red":"yellow"}>{rotulo}</Text><Text size="sm" style={{overflowWrap:"anywhere"}}>{item.titulo}</Text><Text size="xs" c="dimmed">{item.detalhe}{item.data?` · ${formatarPrazo(item.data)}`:""}</Text>{item.valor!=null && <Text fw={700} size="sm">{formatarValor(item.valor)}</Text>}{rota && <Button size="xs" variant="light" color={urgente?"red":"yellow"} fullWidth onClick={()=>navigate(rota,{state:{voltarPara:"/portal"}})}>Consultar ↗</Button>}</Stack></Card>;})}
                    {atencao.itens.length>3 && <Button variant="subtle" color={atencao.prioridade} size="xs" aria-expanded={pendenciasExpandidas===projetoSimples.id} onClick={()=>setPendenciasExpandidas(v=>v===projetoSimples.id?null:projetoSimples.id)}>{pendenciasExpandidas===projetoSimples.id?"Mostrar menos":`Ver mais ${atencao.itens.length-3} pendências`}</Button>}
                    {atencao.parcial && <Text size="xs">Consulta parcial: podem existir outras pendências. Consulte os detalhes do projeto.</Text>}
                </Stack>
            </Alert>}

            {projetoSimples.progresso != null ? <Stack gap={4}><Group justify="space-between"><Text size="sm" c="dimmed">Progresso</Text><Text size="sm" fw={600}>{projetoSimples.progresso}%</Text></Group><Progress value={projetoSimples.progresso} size="sm" radius="sm" aria-label="Progresso do projeto"/></Stack> : <Text size="sm" c="dimmed">Progresso ainda não definido.</Text>}
            <Text size="xs" c="dimmed">Prazo: {formatarPrazo(projetoSimples.prazoAcordado)}</Text>
            <Button size="sm" variant="light" onClick={()=>navigate(`/portal/projetos?projeto=${encodeURIComponent(projetoSimples.id)}`)}>Abrir projeto ↗</Button>
        </>}
    </Stack></Card>;
    };
    return <Stack className={`${estrutura.dashboard} ${classes.pagina}`}>
        <Stack gap={4}><Title order={1} className={estrutura.heading}>Olá, {cliente.nome}!</Title><Text c="dimmed" size="sm">Acompanhe seus projetos e solicitações.</Text></Stack>
        <PendenciasDashboard lado="cliente" compacto destaque={(pendencias, erroPendencias, atualizarPendencias) => <>{expressivo ? trajetoria : trajetoriaSimples}{moderno ? <ProjetoDestaqueCliente projetos={todosProjetos} erro={erroProjetos} pendencias={pendencias} erroPendencias={erroPendencias} onAtualizar={atualizarProjetos} onAtualizarPendencias={atualizarPendencias}/> : destaqueSimples(pendencias,erroPendencias,atualizarPendencias)}</>}/>
    </Stack>;
}
