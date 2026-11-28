import { NumeroModerno, ValorUrgencia } from "./InteracaoModerna";
import { useModerno } from "../hooks/useInteracaoModerna";
import { IconeModerno } from "./AcabamentoModerno";
import { Carregamento } from "./Carregamento";
import { useCallback, useRef, useState } from "react";
import type { ReactNode, MouseEvent } from "react";
import classes from "../styles/Estrutura.module.css";
import visual from "../styles/Dashboard.module.css";
import { ContadorDashboard } from "./IndicadorDashboard";
import { BentoDashboard } from "./BentoDashboard";
import { IconePainel } from "./MenuConta";
import { Alert, Badge, Button, Card, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useNavigate } from "react-router";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { formatarPrazo } from "../lib/comercial";
import { selecionarPendencias, caminhoPendencia } from "../lib/selecionarPendencias";

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
const iconesPendencia = {
    pagamento_atrasado: "financeiro", entrega_atrasada: "projetos",
    pagamento_pendente: "financeiro", entrega_proxima: "projetos",
    aguardando_resposta: "mensagens", prioridade_alta: "projetos",
    proposta_pendente: "solicitacoes", validacao_pendente: "solicitacoes",
    reabertura_pendente: "mensagens", sem_atualizacao: "projetos",
    conversa_inativa: "mensagens",
} as const satisfies Record<Categoria, Parameters<typeof IconePainel>[0]["nome"]>;
export type Pendencia = {categoria: Categoria; titulo: string; subtitulo: string; projetoId: string | null; marcoId: string | null; conversaId: string | null; data: string | null; valor: string | null; detalhe: string; total: number; totalValor: string | null};
function cliqueSuperficie(evento:MouseEvent<HTMLDivElement>,acao:()=>void) {
    const alvo = evento.target;
    if (!(alvo instanceof Element) || !evento.currentTarget.contains(alvo) || evento.button !== 0 || alvo.closest('button,a,input,select,textarea,label,[role="button"]') || window.getSelection()?.toString()) return;
    acao();
}
const categoriasCliente: Categoria[] = ["pagamento_atrasado", "pagamento_pendente", "validacao_pendente", "proposta_pendente"];

export function PendenciasDashboard({lado, children, destaque, mostrarZerados: externo, onMostrarZerados, outrosZerados = false}: {lado: "admin" | "cliente"; children?: ReactNode; destaque?: (dados: Pendencia[] | null, erro: string | null, atualizar: () => void) => ReactNode; mostrarZerados?: boolean; onMostrarZerados?: (valor: boolean) => void; outrosZerados?: boolean}) {
    const navigate = useNavigate();
    const moderno = useModerno();
    const [dados, setDados] = useState<Pendencia[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<Categoria | "todos">("todos");
    const [limite, setLimite] = useState(6);
    const [interno, setInterno] = useState(false);
    const mostrarZerados = externo ?? interno;
    const setMostrarZerados = onMostrarZerados ?? setInterno;
    const detalhesRef = useRef<HTMLDivElement>(null);
    const [atualizando,setAtualizando] = useState(false);
    const [repeticao,setRepeticao] = useState(0);
    const repetir = useRef(false);
    const carregar = useCallback(async (signal: AbortSignal) => {
        setAtualizando(true);
        try {
            const resposta = await fetch(lado === "admin" ? "/api/dashboard/pendencias" : "/api/me/dashboard/pendencias", {signal, cache: "no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar as pendências");
            const itens: Pendencia[] = await resposta.json();
            if (!signal.aborted) {setDados(itens); setErro(null); if (repetir.current) {repetir.current=false;setRepeticao(v=>v+1);}}
        } catch {
            if (!signal.aborted) {setErro("Não foi possível atualizar as pendências.");repetir.current=false;}
        } finally {if (!signal.aborted) setAtualizando(false);}
    }, [lado]);
    const atualizar = useAtualizacaoPeriodica(carregar, 30000);
    const disponiveis = categorias.filter(c => lado === "admin" || categoriasCliente.includes(c.id));
    const quantidade = (id: Categoria) => dados?.find(p => p.categoria === id)?.total ?? 0;
    const selecionados = disponiveis.filter(c => filtro === "todos" || filtro === c.id);
    const visiveis = selecionarPendencias(selecionados.flatMap(c => (dados ?? []).filter(p => p.categoria === c.id)), filtro);
    const selecionar = (id: Categoria | "todos") => {
        setFiltro(id); setLimite(6);
        if (id !== "todos") {
            detalhesRef.current?.focus({preventScroll:true});
            detalhesRef.current?.scrollIntoView({block:"start", behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
        }
    };

    function abrir(item: Pendencia) {
        const caminho = caminhoPendencia(lado, item);
        if (caminho) navigate(caminho, {state: {voltarPara: lado === "admin" ? "/" : "/portal"}});
    }

    const urgentes = lado === "cliente" && moderno ? (dados ?? []).filter(p=>p.categoria === "pagamento_atrasado" && !!caminhoPendencia(lado,p)) : [];
    return <Stack gap="sm">
        {urgentes.length>0 && <Card withBorder className="funilador-urgencias"><Stack gap="sm"><Group gap={8}><IconeModerno nome="alerta" tamanho={24}/><Title order={3}>Atenção imediata</Title><Badge color="red">{urgentes[0].total} urgente(s)</Badge></Group>{urgentes.slice(0,3).map((item,i)=><button type="button" key={`${item.projetoId}-${item.marcoId}-${i}`} className="funilador-urgencia-item" onClick={()=>abrir(item)}><span><strong>{item.titulo}</strong><small>{item.subtitulo} · {item.detalhe}{item.data ? ` · ${formatarPrazo(item.data)}` : ""}</small></span><span className="funilador-urgencia-valor"><span>{item.valor != null && <ValorUrgencia valor={item.valor} repeticao={repeticao}/>}</span><IconeModerno nome="abrir"/></span></button>)}{urgentes[0].total>3 && <Button color="red" variant="light" onClick={()=>selecionar("pagamento_atrasado")}>Ver todas as urgências</Button>}</Stack></Card>}
        {destaque?.(dados, erro, atualizar)}
        <Group justify="space-between" align="center" gap="xs" wrap="wrap" className={classes.sectionHeader}>
            <Stack gap={2} className={classes.sectionHeading}><Title order={3}>Precisam de atenção</Title><Text c="dimmed" size="sm">{lado === "admin" ? "Organize o que precisa fazer primeiro." : "Ações pendentes dos seus projetos."}</Text></Stack>
            <Button size="xs" variant="subtle" className="funilador-atualizar" loading={atualizando} leftSection={<IconeModerno nome="atualizar"/>} onClick={()=>{repetir.current=true;atualizar();}}>Atualizar</Button>
        </Group>
        {erro && <Alert color="red">{erro}{dados && " Exibindo a última consulta."}</Alert>}
        {!dados && !erro && <Carregamento tipo="indicadores" texto="Carregando pendências..."/>}
        {dados && <>
            <BentoDashboard className={`${classes.safeGrid} ${visual.pendencias}`}>
                {disponiveis.filter(c => quantidade(c.id) > 0 || filtro === c.id || mostrarZerados).map(c => <Card key={c.id} withBorder padding="sm" className={`${classes.metric} ${visual.pendencia}${moderno ? " funilador-pendencia-clicavel" : ""}`} data-prioridade={quantidade(c.id) ? c.cor : "neutra"} data-selecionada={filtro === c.id} onClick={moderno ? e=>cliqueSuperficie(e,()=>selecionar(c.id)) : undefined}>
                    <Group justify="space-between" gap="xs" wrap="nowrap" className={visual.pendenciaTopo}><span className={visual.iconeAuxiliar}><IconePainel nome={iconesPendencia[c.id]} tamanho={16}/></span><Text size="sm" fw={500} style={{minWidth:0, overflowWrap:"anywhere"}}>{c.nome}</Text><Tooltip label={c.ajuda} multiline w={240} events={{hover: true, focus: true, touch: true}}><Button size="compact-xs" variant="subtle" color="gray" className="funilador-pendencia-ajuda" aria-label={c.ajuda}>?</Button></Tooltip></Group>
                    <Group justify="space-between" align="center" gap="xs" wrap="wrap" className={visual.pendenciaRodape}><Stack gap={0} style={{minWidth:0}}><Text className={classes.metricValue} size="xl" fw={700} c={quantidade(c.id) ? c.cor : "dimmed"}><ContadorDashboard valor={quantidade(c.id)} repeticao={repeticao}/></Text>{dados.find(p => p.categoria === c.id)?.totalValor != null && <Text size="sm" fw={600}>{<NumeroModerno valor={dados.find(p => p.categoria === c.id)?.totalValor} moeda repeticao={repeticao}/>}</Text>}</Stack><Button className="funilador-pendencia-acao" size="compact-xs" variant={filtro === c.id ? "filled" : "light"} aria-pressed={filtro === c.id} onClick={() => selecionar(c.id)}>Consultar</Button></Group>
                </Card>)}
            </BentoDashboard>
            {!mostrarZerados && filtro === "todos" && disponiveis.every(c => quantidade(c.id) === 0) && <Text size="sm" c="dimmed">Nenhuma ação pendente no momento.</Text>}
            {(outrosZerados || disponiveis.some(c => quantidade(c.id) === 0)) && <Button variant="subtle" size="xs" style={{alignSelf: "flex-start"}} onClick={() => setMostrarZerados(!mostrarZerados)}>{mostrarZerados ? "Ocultar indicadores zerados" : "Mostrar indicadores zerados"}</Button>}
        </>}
        {children}
        {dados && (visiveis.length > 0 || filtro !== "todos" || mostrarZerados) && <Stack gap="sm" mt="sm" ref={detalhesRef} tabIndex={-1} className={classes.section} aria-label="Pendências detalhadas">
            <Group justify="space-between"><Title order={4}>{filtro === "todos" ? "Pendências detalhadas" : disponiveis.find(c => c.id === filtro)?.nome}</Title>{filtro !== "todos" && <Button size="compact-xs" variant="subtle" onClick={() => selecionar("todos")}>Mostrar todas</Button>}</Group>
            {visiveis.length === 0 && filtro !== "todos" && <Text c="dimmed" size="sm">Nenhuma pendência neste filtro.</Text>}
            {visiveis.length === 0 && filtro === "todos" && mostrarZerados && <Text c="dimmed" size="sm">Nenhuma pendência neste filtro.</Text>}
            {visiveis.slice(0, limite).map((item, i) => {
                const cat = disponiveis.find(c => c.id === item.categoria);
                return <Card key={`${item.categoria}-${item.projetoId}-${item.marcoId}-${item.conversaId}-${i}`} withBorder padding="sm" className={`${visual.pendenciaDetalhe}${moderno && caminhoPendencia(lado,item) ? " funilador-pendencia-clicavel" : ""}`} data-prioridade={cat?.cor} onClick={moderno && caminhoPendencia(lado,item) ? e=>cliqueSuperficie(e,()=>abrir(item)) : undefined}><Group justify="space-between" align="center" wrap="wrap">
                    <Stack gap={3} style={{flex: 1, minWidth: 0}}><Text fw={600} style={{overflowWrap: "anywhere"}}>{item.titulo}</Text><Text size="xs" c="dimmed" style={{overflowWrap: "anywhere"}}>{item.subtitulo}</Text><Group gap={5} wrap="wrap"><Badge size="sm" variant="light" color={cat?.cor}>{cat?.nome}</Badge><Text size="xs" c="dimmed">{item.detalhe}{item.data ? ` · ${formatarPrazo(item.data)}` : ""}</Text></Group>{item.valor !== null && <Text fw={600}>{<NumeroModerno valor={item.valor} moeda repeticao={repeticao}/>}</Text>}</Stack>
                    <Button className="funilador-pendencia-acao" size="xs" variant="light" disabled={!caminhoPendencia(lado,item)} onClick={() => abrir(item)}>{lado === "cliente" && item.categoria === "validacao_pendente" ? "Validar entregas" : lado === "cliente" && item.categoria.startsWith("pagamento_") ? "Ver pagamento" : item.conversaId ? "Abrir conversa" : "Abrir projeto"}</Button>
                </Group></Card>;
            })}
            {visiveis.length > limite && <Button size="xs" variant="subtle" onClick={() => setLimite(n => n + 10)}>Mostrar mais ({visiveis.length - limite})</Button>}
            {selecionados.some(c => quantidade(c.id) > 100) && <Text size="xs" c="dimmed">Exibindo até 100 registros por categoria. Os indicadores contabilizam todos.</Text>}
            {lado === "admin" && quantidade("pagamento_atrasado") > 0 && <Button variant="subtle" size="xs" style={{alignSelf: "flex-start"}} onClick={() => navigate("/financeiro?categoria=atrasado")}>Ver cobranças atrasadas no financeiro</Button>}
        </Stack>}
    </Stack>;
}
