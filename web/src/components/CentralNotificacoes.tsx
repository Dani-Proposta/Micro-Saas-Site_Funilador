import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Box, Button, Group, Indicator, Loader, Modal, Popover, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { EVENTO_LEITURA } from "../hooks/useMensagensNaoLidas";
import { useNavigate } from "react-router";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Notificacao = {
    id: string;
    tipo: "mensagem" | "solicitacao" | "projeto" | "conversa" | "reabertura";
    referenciaId: string;
    titulo: string;
    resumo: string;
    criadaEm: string;
    quantidade: number;
};
type Resumo = {total: number; totalGrupos: number; itens: Notificacao[]};
const rotulos = {mensagem: "Mensagem", solicitacao: "Solicitação", projeto: "Projeto", conversa: "Conversa", reabertura: "Reabertura"};

export function CentralNotificacoes({lado}: {lado: "admin" | "cliente"}) {
    const navigate = useNavigate();
    const mobile = useMediaQuery("(max-width: 48em)");
    const prefixo = lado === "admin" ? "/api/notificacoes" : "/api/me/notificacoes";
    const [aberta, setAberta] = useState(false);
    const [pagina, setPagina] = useState(0);
    const [resumo, setResumo] = useState<(Resumo & {pagina: number}) | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupada, setOcupada] = useState(false);
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
                } else {
                    params.set("projeto", notificacao.referenciaId);
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

    const total = resumo?.total ?? 0;
    const paginaAtual = resumo?.pagina === pagina ? resumo : null;
    const gatilho = (
        <ActionIcon size="lg" variant="subtle" aria-label={`Notificações: ${total} não lidas`} aria-expanded={aberta} onClick={() => alterarAbertura(!aberta)}>
            <Indicator disabled={total === 0} label={total > 99 ? "99+" : total} size={17} color="red" offset={2}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
            </Indicator>
        </ActionIcon>
    );
    const conteudo = (
        <Stack gap="sm">
            {!mobile && <Text fw={700}>Notificações</Text>}
            <Group justify="space-between" gap="xs" wrap="wrap">
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
            {!paginaAtual && !erro && <Loader size="sm"/>}
            {paginaAtual && paginaAtual.itens.length === 0 && <Text size="sm" c="dimmed">Nenhuma notificação nesta página.</Text>}
            <ScrollArea.Autosize mah={mobile ? "calc(100dvh - 210px)" : "min(380px, 55dvh)"} offsetScrollbars>
                <Stack gap={4}>
                    {paginaAtual?.itens.map(n => (
                        <UnstyledButton key={n.id} disabled={ocupada} onClick={() => void marcar(n)} p="xs" w="100%" bg={n.quantidade ? "var(--mantine-color-default-hover)" : undefined} style={{borderRadius: 8, cursor: ocupada ? "wait" : "pointer", border: "1px solid var(--mantine-color-default-border)"}}>
                            <Group align="flex-start" justify="space-between" wrap="nowrap" gap="xs">
                                <Box miw={0} flex={1}>
                                    <Text size="xs" c="dimmed">{rotulos[n.tipo]} · {new Date(n.criadaEm).toLocaleString("pt-BR")}</Text>
                                    <Text size="sm" fw={n.quantidade ? 700 : 500} lineClamp={2} style={{overflowWrap: "anywhere"}}>{n.titulo}</Text>
                                    <Text size="xs" c="dimmed" lineClamp={2} style={{overflowWrap: "anywhere"}}>{n.resumo}</Text>
                                </Box>
                                {n.quantidade > 0 && <Badge color="red" size="sm">{n.quantidade > 1 || n.tipo === "mensagem" ? n.quantidade : "Nova"}</Badge>}
                                <Text c="dimmed" aria-hidden="true">›</Text>
                            </Group>
                        </UnstyledButton>
                    ))}
                </Stack>
            </ScrollArea.Autosize>
            {paginaAtual && <Group justify="space-between" gap="xs">
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
        <Popover opened={aberta} onChange={alterarAbertura} position="bottom-end" width={380} shadow="md" withinPortal middlewares={{flip: true, shift: true}}>
            <Popover.Target>{gatilho}</Popover.Target>
            <Popover.Dropdown p="sm">{conteudo}</Popover.Dropdown>
        </Popover>
    );
}
