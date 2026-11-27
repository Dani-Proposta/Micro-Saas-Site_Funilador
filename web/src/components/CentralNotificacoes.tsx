import chat from "../styles/Chat.module.css";
import visual from "../styles/Notificacoes.module.css";
import { Carregamento } from "./Carregamento";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Box, Button, Group, Indicator, Modal, Popover, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import classes from "../styles/Estrutura.module.css";
import { useMediaQuery } from "@mantine/hooks";
import { EVENTO_LEITURA } from "../hooks/useMensagensNaoLidas";
import { useNavigate } from "react-router";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { caminhoPendencia } from "../lib/selecionarPendencias";
import { caminhoPagamento } from "../lib/pendenciasProjeto";
import { formatarValor } from "../lib/comercial";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";

type Notificacao = {
    id: string;
    tipo: "mensagem" | "solicitacao" | "projeto" | "conversa" | "reabertura";
    referenciaId: string;
    titulo: string;
    resumo: string;
    criadaEm: string;
    quantidade: number;
    prioridade: "importante" | "normal";
    marcoId: string | null;
};
type Resumo = {total: number; totalGrupos: number; itens: Notificacao[]};

const desenhos = {
    mensagem: "M20 11a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 14-4z",
    conversa: "M20 11a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 14-4z M9 11h6",
    solicitacao: "M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h4",
    projeto: "M3 6h7l2 2h9v12H3z",
    reabertura: "M4 11a8 8 0 1 1 2 6 M4 5v6h6",
    pagamento: "M3 6h18v13H3z M16 11h5v4h-5z",
    prazo: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
    alerta: "M12 3 2 20h20L12 3z M12 9v4 M12 16v.1",
    pronto: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12l3 3 5-6",
    sino: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
} as const;

function IconeNotificacao({tipo, tamanho = 18}: {tipo: keyof typeof desenhos; tamanho?: number}) {
    return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={desenhos[tipo]}/></svg>;
}

function iconePendencia(categoria: string): keyof typeof desenhos {
    if (categoria.startsWith("pagamento")) return "pagamento";
    if (categoria.startsWith("entrega")) return "prazo";
    if (categoria === "aguardando_resposta") return "conversa";
    if (categoria === "proposta_pendente") return "solicitacao";
    if (categoria === "validacao_pendente") return "pronto";
    if (categoria === "reabertura_pendente") return "reabertura";
    return "alerta";
}
const rotulos = {mensagem: "Mensagem", solicitacao: "Solicitação", projeto: "Projeto", conversa: "Conversa", reabertura: "Reabertura"};

type Pendencia = {categoria: string; titulo: string; subtitulo: string; projetoId: string | null; marcoId: string | null; conversaId: string | null; total: number; totalValor: string | null};
const alertas = [
    {id:"pagamento_atrasado",nome:"Pagamentos atrasados",urgente:true},
    {id:"entrega_atrasada",nome:"Entregas atrasadas",urgente:true},
    {id:"pagamento_pendente",nome:"Pagamentos necessários",urgente:false},
    {id:"entrega_proxima",nome:"Entregas próximas",urgente:false},
    {id:"aguardando_resposta",nome:"Clientes aguardando resposta",urgente:false},
    {id:"proposta_pendente",nome:"Propostas pendentes",urgente:false},
    {id:"validacao_pendente",nome:"Entregas para validar",urgente:false},
    {id:"reabertura_pendente",nome:"Reaberturas pendentes",urgente:false},
];

export function CentralNotificacoes({lado}: {lado: "admin" | "cliente"}) {
    const navigate = useNavigate();
    const {aparencia} = useAparencia();
    const reduzirMovimento = useMovimentoReduzido();
    const minimalista = aparencia.estilo === "minimalista";
    const mobile = useMediaQuery("(max-width: 48em)");
    const prefixo = lado === "admin" ? "/api/notificacoes" : "/api/me/notificacoes";
    const [aberta, setAberta] = useState(false);
    const [pagina, setPagina] = useState(0);
    const [resumo, setResumo] = useState<(Resumo & {pagina: number}) | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupada, setOcupada] = useState(false);
    const [pendencias, setPendencias] = useState<Pendencia[]>([]);
    const [erroPendencias, setErroPendencias] = useState(false);
    const carregarPendencias = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch(lado === "admin" ? "/api/dashboard/pendencias" : "/api/me/dashboard/pendencias", {signal,cache:"no-store"});
            if (!resposta.ok) {
                if (!signal.aborted && [401,403].includes(resposta.status)) setPendencias([]);
                throw new Error("Falha ao carregar pendências");
            }
            const dados = await resposta.json();
            if (!signal.aborted) {setPendencias(dados); setErroPendencias(false);}
        } catch {if (!signal.aborted) setErroPendencias(true);}
    },[lado]);
    const atualizarPendencias = useAtualizacaoPeriodica(carregarPendencias,30000);
    const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);
    const revisao = useRef(0);
    const bloqueio = useRef(false);

    const carregar = useCallback(async (signal: AbortSignal) => {
        const versao = revisao.current;
        try {
            const resposta = await fetch(`${prefixo}?pagina=${pagina}`, {signal, cache: "no-store"});
            const dados = await resposta.json();
            if (signal.aborted || versao !== revisao.current) return;
            if (!resposta.ok) {
                if ([401, 403].includes(resposta.status)) setResumo(null);
                throw new Error(dados.erro ?? "Não foi possível consultar notificações.");
            }
            setResumo({...dados, pagina});
            setErro(null);
        } catch (e) {
            if (!signal.aborted && versao === revisao.current) setErro(e instanceof Error ? e.message : "Falha ao consultar notificações.");
        }
    }, [prefixo, pagina]);
    const atualizar = useAtualizacaoPeriodica(carregar, 15000);
    useEffect(() => {
        window.addEventListener(EVENTO_LEITURA, atualizar);
        return () => window.removeEventListener(EVENTO_LEITURA, atualizar);
    }, [atualizar]);

    function alterarAbertura(valor: boolean) {
        setAberta(valor);
        setConfirmarLimpeza(false);
        if (valor) {
            atualizarPendencias();
            if (pagina !== 0) setPagina(0);
            else atualizar();
        }
    }

    async function limpar() {
        if (bloqueio.current) return;
        bloqueio.current = true;
        setOcupada(true);
        setErro(null);
        revisao.current++;
        try {
            const resposta = await fetch(prefixo, {method: "DELETE"});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível limpar as notificações.");
            revisao.current++;
            setConfirmarLimpeza(false);
            //limpar resumo antigo
            setResumo({total: 0, totalGrupos: 0, itens: [], pagina: 0});
            if (pagina !== 0) setPagina(0);
            else atualizar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao limpar notificações.");
        } finally {
            bloqueio.current = false;
            setOcupada(false);
        }
    }

    async function marcar(notificacao?: Notificacao) {
        if (bloqueio.current) return;
        bloqueio.current = true;
        setOcupada(true);
        setErro(null);
        revisao.current++;
        try {
            const resposta = await fetch(`${prefixo}/leituras`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(notificacao ? {id: notificacao.id} : {todas: true})});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível registrar a leitura.");
            revisao.current++;
            atualizar();
            if (notificacao) {
                const raiz = lado === "admin" ? "" : "/portal";
                const params = new URLSearchParams({notificacao: notificacao.id});
                if (["mensagem", "conversa", "reabertura"].includes(notificacao.tipo)) {
                    params.set("conversa", notificacao.referenciaId);
                    navigate(`${raiz}/mensagens?${params}`);
                } else if (notificacao.tipo === "solicitacao") {
                    params.set("solicitacao", notificacao.referenciaId);
                    navigate(`${raiz}/solicitacoes?${params}`);
                } else if (lado === "admin") {
                    navigate(`/projetos/${notificacao.referenciaId}`);
                } else if (["Lembrete de pagamento","Marco aguardando pagamento"].includes(notificacao.titulo)) {
                    navigate(`${caminhoPagamento(notificacao.referenciaId,notificacao.marcoId)}&notificacao=${encodeURIComponent(notificacao.id)}`);
                } else {
                    params.set("projeto", notificacao.referenciaId);
                    if (notificacao.titulo === "Marco aguardando validação") {params.set("validar","1"); if (notificacao.marcoId) params.set("marco",notificacao.marcoId); }
                    navigate(`/portal/projetos?${params}`);
                }
                setAberta(false);
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao registrar leitura.");
        } finally {
            bloqueio.current = false;
            setOcupada(false);
        }
    }

    //alertas permanecem enquanto a pendência existir
    const categoriasAtivas = alertas.filter(a => pendencias.some(p=>p.categoria === a.id));
    const urgentes = categoriasAtivas.some(a=>a.urgente);
    function abrirPendencia(p: Pendencia) {
        const caminho = caminhoPendencia(lado,p);
        if (caminho) navigate(caminho);
        setAberta(false);
    }
    const total = resumo?.total ?? 0;
    const paginaAtual = resumo?.pagina === pagina ? resumo : null;
    const gatilho = (
        <ActionIcon size={44} className={classes.bell} variant="subtle" aria-label={`Notificações: ${total} não lidas; ${categoriasAtivas.length} categorias de pendências ativas`} aria-expanded={aberta} onClick={() => alterarAbertura(!aberta)}>
            <Indicator disabled={total === 0 && !categoriasAtivas.length} label={total > 99 ? "99+" : total || "!"} size={17} color={urgentes || !categoriasAtivas.length ? "red" : "orange"} offset={4}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
            </Indicator>
        </ActionIcon>
    );
    const conteudo = (
        <Stack gap="sm" className={`${chat.notificacoes} ${visual.central}`}>
            {!mobile && (minimalista ? <Group gap={8} wrap="nowrap"><span className={visual.icone}><IconeNotificacao tipo="sino"/></span><Text fw={700}>Notificações</Text></Group> : <Text fw={700}>Notificações</Text>)}
            <Text size="xs" c="dimmed" aria-live="polite">{!resumo ? (erro ? "Resumo indisponível" : "Consultando notificações...") : total ? `${total} ${total === 1 ? "grupo não lido" : "grupos não lidos"}` : "Nenhuma notificação não lida"}</Text>
            <Group justify="space-between" gap="xs" wrap="wrap" className={visual.ferramentas}>
                <Button size="compact-xs" variant="subtle" disabled={!total || ocupada} onClick={() => void marcar()}>Marcar todas como lidas</Button>
                <Button size="compact-xs" color="red" variant="subtle" disabled={!resumo?.totalGrupos || ocupada} onClick={() => setConfirmarLimpeza(true)}>Limpar todas</Button>
            </Group>
            {confirmarLimpeza && <Alert color="red" title="Limpar todas as notificações?">
                <Text size="sm">Isso remove as notificações, incluindo as não lidas.</Text>
                <Group justify="flex-end" mt="xs" gap="xs">
                    <Button size="compact-xs" variant="default" disabled={ocupada} onClick={() => setConfirmarLimpeza(false)}>Cancelar</Button>
                    <Button size="compact-xs" color="red" loading={ocupada} onClick={() => void limpar()}>Confirmar limpeza</Button>
                </Group>
            </Alert>}
            {erro && <Alert color="red" title="Notificações">{erro}<Button size="compact-xs" variant="subtle" onClick={atualizar}>Tentar novamente</Button></Alert>}
            {!paginaAtual && !erro && <Carregamento tipo="compacto" texto="Carregando notificações..."/>}

            <ScrollArea.Autosize mah={mobile ? "calc(100dvh - 210px)" : "min(380px, 55dvh)"} offsetScrollbars>
                <Stack gap={4} className={visual.lista}>
                    {pagina === 0 && categoriasAtivas.length > 0 && <>
                        <Text size="xs" fw={700} c="dimmed" className={visual.secao}>PENDÊNCIAS ATIVAS</Text>
                        {categoriasAtivas.map(a => {
                            const itens = pendencias.filter(p=>p.categoria===a.id);
                            return <Box key={a.id} p="xs" className={`${chat.pendencia} ${visual.pendencia}`} data-urgente={a.urgente}>
                                <Group justify="space-between" gap="xs" wrap="wrap">
                                    <Group gap={8} wrap="nowrap" className={visual.tituloPendencia}>{minimalista && <span className={visual.icone}><IconeNotificacao tipo={iconePendencia(a.id)}/></span>}<Text size="sm" fw={600} c={a.urgente?"red":"orange"}>{a.nome} · {itens[0].total}</Text></Group>
                                    <Badge color={a.urgente?"red":"orange"} variant={minimalista ? "outline" : undefined} size="xs">{a.urgente?"Urgente":"Importante"}</Badge>
                                </Group>
                                {itens[0].totalValor !== null && <Text size="sm" fw={600}>{formatarValor(itens[0].totalValor)}</Text>}
                                {itens.slice(0,2).map((p,i)=><UnstyledButton key={i} w="100%" py={4} className={visual.linkPendencia} onClick={()=>abrirPendencia(p)}><Text size="sm" lineClamp={1}>{p.titulo} ›</Text><Text size="xs" c="dimmed" lineClamp={1}>{p.subtitulo}</Text></UnstyledButton>)}
                                {itens[0].total > 2 && <Button size="compact-xs" variant="subtle" onClick={()=>{navigate(lado === "admin"?"/":"/portal");setAberta(false);}}>Ver todas no Dashboard</Button>}
                            </Box>;
                        })}
                        <Text size="xs" c="dimmed">Resolva a pendência para retirar o alerta.</Text>
                    </>}
                    {erroPendencias && <Text size="xs" c="red">Não foi possível atualizar os alertas ativos.</Text>}
                    <Text size="xs" fw={700} c="dimmed" mt="xs" className={visual.secao}>NOTIFICAÇÕES</Text>
                    {paginaAtual && paginaAtual.itens.length === 0 && (minimalista ? <Stack align="center" gap={6} className={visual.vazio}>
                        <span className={visual.icone}><IconeNotificacao tipo={pagina === 0 && !categoriasAtivas.length && !erroPendencias ? "pronto" : "sino"} tamanho={22}/></span>
                        <Text size="sm" fw={600} ta="center">{pagina === 0 ? "Nenhuma notificação" : "Nenhum registro nesta página"}</Text>
                        <Text size="xs" c="dimmed" ta="center">{pagina === 0 && categoriasAtivas.length ? "As pendências ativas continuam acima." : "Novas notificações aparecerão aqui."}</Text>
                    </Stack> : <Text size="sm" c="dimmed">Nenhuma notificação nesta página.</Text>)}
                    {paginaAtual?.itens.map(n => (
                        <UnstyledButton key={n.id} disabled={ocupada} onClick={() => void marcar(n)} p="xs" w="100%" bg={n.quantidade ? "var(--mantine-color-default-hover)" : undefined} className={`${chat.evento} ${visual.evento}`} data-nova={n.quantidade > 0} data-importante={n.prioridade === "importante"} style={{cursor: ocupada ? "wait" : "pointer"}}>
                            <Group align="flex-start" justify="space-between" wrap="nowrap" gap="xs">
                                {minimalista && <span className={visual.icone}><IconeNotificacao tipo={n.tipo}/></span>}
                                <Box miw={0} flex={1}>
                                    {n.prioridade === "importante" && <Badge color="orange" variant={minimalista ? "outline" : undefined} size="xs">Importante</Badge>}
                                    <Text size="xs" c="dimmed">{rotulos[n.tipo]} · {new Date(n.criadaEm).toLocaleString("pt-BR")}</Text>
                                    <Text size="sm" fw={n.quantidade ? 700 : 500} lineClamp={2} style={{overflowWrap: "anywhere"}}>{n.titulo}</Text>
                                    <Text size="xs" c="dimmed" lineClamp={2} style={{overflowWrap: "anywhere"}}>{n.resumo}</Text>
                                </Box>
                                {n.quantidade > 0 && (minimalista ? <span className={visual.naoLida} aria-label={`${n.quantidade} não lida(s)`}><i aria-hidden="true"/>{n.quantidade > 1 ? n.quantidade : "Nova"}</span> : <Badge color="red" size="sm">{n.quantidade > 1 || n.tipo === "mensagem" ? n.quantidade : "Nova"}</Badge>)}
                                <Text c="dimmed" aria-hidden="true">›</Text>
                            </Group>
                        </UnstyledButton>
                    ))}
                </Stack>
            </ScrollArea.Autosize>
            {paginaAtual && <Group justify="space-between" gap="xs" className={visual.paginacao}>
                <Button size="compact-xs" variant="default" disabled={pagina === 0 || ocupada} onClick={() => {setPagina(p => p - 1);}}>Mais recentes</Button>
                <Text size="xs" c="dimmed">Página {pagina + 1}</Text>
                <Button size="compact-xs" variant="default" disabled={(pagina + 1) * 20 >= paginaAtual.totalGrupos || ocupada} onClick={() => {setPagina(p => p + 1);}}>Anteriores</Button>
            </Group>}
        </Stack>
    );


    //notificações no celular
    if (mobile) return (
        <>
            {gatilho}
            <Modal opened={aberta} onClose={() => alterarAbertura(false)} title="Notificações" fullScreen transitionProps={{duration: 0}}>
                {conteudo}
            </Modal>
        </>
    );

    return (
        <Popover opened={aberta} onChange={alterarAbertura} position="bottom-end" width={minimalista ? 400 : 360} shadow="md" withinPortal middlewares={{flip: true, shift: true}} transitionProps={reduzirMovimento ? {duration:0} : minimalista ? {transition:"fade",duration:120} : undefined}>
            <Popover.Target>{gatilho}</Popover.Target>
            <Popover.Dropdown p="sm" className={`${classes.notificationDropdown} ${visual.dropdown}`}>{conteudo}</Popover.Dropdown>
        </Popover>
    );
}
