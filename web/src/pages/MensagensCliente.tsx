import classes from "../styles/Usabilidade.module.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { destinoRetorno } from "../lib/navegacaoContextual";
import {
    Alert,
    Badge,
    Button,
    Card,
    Center,
    Divider,
    Group,
    Loader,
    NavLink,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { ReaberturaConversa } from "../components/ReaberturaConversa";
import type { PedidoReabertura } from "../components/ReaberturaConversa";
import { HistoricoMensagens } from "../components/HistoricoMensagens";
import { EVENTO_LEITURA } from "../hooks/useMensagensNaoLidas";
import { ordenarConversas, totalNaoLidas } from "../lib/ordenarConversas";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Conversa = {
    id: string;
    titulo: string;
    tipo: "geral" | "avulsa" | "projeto";
    projetoId: string | null;
    criadaEm: string;
    arquivadaEm: string | null;
    reabertura?: PedidoReabertura | null;
    ocultada?: boolean;
    naoLidas?: number;
    ultimaAtividadeEm?: string;
};

const tipoConversa = {
    geral: { label: "Geral", color: "violet" },
    projeto: { label: "Projeto", color: "blue" },
    avulsa: { label: "Avulsa", color: "gray" },
};

export function MensagensCliente() {
    const location = useLocation();
    return <CentralMensagensCliente key={location.search}/>;
}

function CentralMensagensCliente() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const projetoAlvo = params.get("projeto");
    const conversaAlvo = params.get("conversa");
    const voltarPara = destinoRetorno(location.state, "");
    const [conversas, setConversas] = useState<Conversa[]>([]);
    const [conversaId, setConversaId] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aba, setAba] = useState<"ativas" | "arquivadas" | "ocultadas">("ativas");
    const [alterandoOculta, setAlterandoOculta] = useState(false);
    const [erroAcao, setErroAcao] = useState<string | null>(null);
    const revisao = useRef(0);
    const [selecionou, setSelecionou] = useState(false);

    const conversaSelecionada = conversas.find(conversa => conversa.id === conversaId)
        ?? (!selecionou ? (conversaAlvo ? conversas.find(c => c.id === conversaAlvo) : projetoAlvo ? conversas.find(c => c.projetoId === projetoAlvo) : (conversas.find(conversa => conversa.tipo === "geral" && !conversa.arquivadaEm) ?? conversas.find(conversa => !conversa.arquivadaEm))) : undefined);

    function categoria(c: Conversa) {return c.arquivadaEm ? "arquivadas" : c.ocultada ? "ocultadas" : "ativas";}
    const abaAtual = conversaSelecionada ? categoria(conversaSelecionada) : aba;
    const conversasVisiveis = ordenarConversas(conversas.filter(c => categoria(c) === abaAtual));
    const naoLidasAtivas = totalNaoLidas(conversas.filter(c => categoria(c) === "ativas"));
    const naoLidasArquivadas = totalNaoLidas(conversas.filter(c => categoria(c) === "arquivadas"));
    const naoLidasOcultadas = totalNaoLidas(conversas.filter(c => categoria(c) === "ocultadas"));

    const carregarConversas = useCallback(async (signal: AbortSignal) => {
        const versao = revisao.current;
        try {
            const resposta = await fetch("/api/me/conversas?todas=true", {signal, cache: "no-store"});
            const dados = await resposta.json();

            if (!resposta.ok) {
                if (!signal.aborted && versao === revisao.current && [401, 403].includes(resposta.status)) setConversas([]);
                throw new Error(dados.erro ?? "Não foi possível carregar as conversas.");
            }
            if (!Array.isArray(dados)) throw new Error("Resposta de conversas inválida.");

            if (!signal.aborted && versao === revisao.current) {
                setConversas(dados);
                setErro(null);
            }
        } catch (erroRecebido) {
            if (!signal.aborted && versao === revisao.current) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao atualizar conversas.");
        } finally {
            if (!signal.aborted) setCarregando(false);
        }
    }, []);

    const atualizarConversas = useAtualizacaoPeriodica(carregarConversas, 10000);
    useEffect(() => {
        window.addEventListener(EVENTO_LEITURA, atualizarConversas);
        return () => window.removeEventListener(EVENTO_LEITURA, atualizarConversas);
    }, [atualizarConversas]);

    function alternarVisualizacao(valor: string) {
        if (valor !== "ativas" && valor !== "arquivadas" && valor !== "ocultadas") return;
        if (valor === abaAtual || alterandoOculta) return;
        setAba(valor);
        setErroAcao(null);
        setSelecionou(true);
        setConversaId(null);
    }

    function selecionarConversa(id: string) {
        setErroAcao(null);
        setSelecionou(true);
        setConversaId(id);
    }

    function atualizarPedido(id: string, pedido: PedidoReabertura) {
        revisao.current++;
        setConversas(anteriores => anteriores.map(c => c.id === id ? {...c, reabertura: pedido} : c));
        atualizarConversas();
    }

    async function alterarOcultacao(conversa: Conversa) {
        if (alterandoOculta || conversa.arquivadaEm || conversa.tipo === "geral") return;
        setAlterandoOculta(true);
        setErroAcao(null);
        const ocultada = !conversa.ocultada;
        try {
            const resposta = await fetch(`/api/me/conversas/${conversa.id}/ocultar`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ocultada})});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível alterar a preferência.");
            revisao.current++;
            setConversas(anteriores => anteriores.map(c => c.id === conversa.id ? {...c, ocultada} : c));
            if (ocultada) {setAba("ativas"); setSelecionou(true); setConversaId(null);}
        } catch (erroRecebido) {
            setErroAcao(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao alterar a preferência.");
        } finally {setAlterandoOculta(false); atualizarConversas();}
    }

    return (
        <Stack gap="md" className={classes.chatPagina}>
            <Group justify="space-between"><Title order={2}>Minhas mensagens</Title>{voltarPara && <Button variant="subtle" size="xs" onClick={() => navigate(voltarPara)}>← Voltar aos projetos</Button>}</Group>
            {!carregando && !erro && !selecionou && projetoAlvo && !conversaSelecionada && <Alert color="gray" title="Conversa do projeto">Ainda não há uma conversa disponível para este projeto. <Button size="compact-xs" variant="light" onClick={() => {const geral = conversas.find(c => c.tipo === "geral"); if (geral) selecionarConversa(geral.id);}}>Abrir conversa Geral</Button></Alert>}
            {erro && <Alert color="red">{erro}</Alert>}
            {erroAcao && <Alert color="red">{erroAcao}</Alert>}

            <div className={classes.chatGrid}>
                <div className={classes.chatColuna}>
                    <Card withBorder padding="sm" className={classes.chatCard}>
                        <Stack gap="sm" className={classes.chatPilha}>
                            <Text fw={600} size="sm">
                                Conversas
                            </Text>
                            <SegmentedControl fullWidth size="xs" disabled={alterandoOculta} value={abaAtual} onChange={alternarVisualizacao} data={[{label: naoLidasAtivas ? `Ativas (${naoLidasAtivas})` : "Ativas", value: "ativas"}, {label: naoLidasArquivadas ? `Arquivadas (${naoLidasArquivadas})` : "Arquivadas", value: "arquivadas"}, {label: naoLidasOcultadas ? `Ocultas (${naoLidasOcultadas})` : "Ocultas", value: "ocultadas"}]}/>
                            <Divider />
                            <ScrollArea className={classes.chatLista} offsetScrollbars>
                                <Stack gap={4}>
                                    {carregando && (
                                        <Center>
                                            <Loader size="sm" />
                                        </Center>
                                    )}
                                    {!carregando && !erro && conversasVisiveis.length === 0 && (
                                        <Text size="sm" c="dimmed">
                                            Nenhuma conversa disponível.
                                        </Text>
                                    )}
                                    {conversasVisiveis.map((conversa) => (
                                        <NavLink
                                            key={conversa.id}
                                            label={<Group justify="space-between" wrap="nowrap" gap={4}><Text className={classes.chatTitulo} size="sm" fw={conversa.naoLidas ? 700 : 400}>{conversa.titulo}</Text>{!!conversa.naoLidas && <Badge color="red" size="sm">{conversa.naoLidas}</Badge>}</Group>}
                                            description={tipoConversa[conversa.tipo].label}
                                            active={conversaSelecionada?.id === conversa.id}
                                            disabled={alterandoOculta}
                                            onClick={() => selecionarConversa(conversa.id)}
                                        />
                                    ))}
                                </Stack>
                            </ScrollArea>
                        </Stack>
                    </Card>
                </div>
                <div className={classes.chatColuna}>
                    <Card withBorder padding="md" className={classes.chatCard}>
                        {conversaSelecionada ? (
                            <Stack gap="sm" className={classes.chatPilha}>
                                <Group justify="space-between">
                                    <Title order={4}>{conversaSelecionada.titulo}</Title>
                                    <Group gap="xs">
                                        {!conversaSelecionada.arquivadaEm && conversaSelecionada.tipo !== "geral" && <Button size="compact-xs" variant="light" color="gray" loading={alterandoOculta} onClick={() => void alterarOcultacao(conversaSelecionada)}>{conversaSelecionada.ocultada ? "Exibir na lista" : "Ocultar"}</Button>}
                                        {conversaSelecionada.arquivadaEm && <Badge color="gray">Arquivada</Badge>}
                                        <Badge color={tipoConversa[conversaSelecionada.tipo].color}>{tipoConversa[conversaSelecionada.tipo].label}</Badge>
                                    </Group>
                                </Group>
                                <Divider />
                                <HistoricoMensagens
                                    key={conversaSelecionada.id}
                                    conversaId={conversaSelecionada.id}
                                    lado="cliente"
                                    arquivada={!!conversaSelecionada.arquivadaEm}
                                    onAtualizarConversas={atualizarConversas}
                                    acoesArquivada={conversaSelecionada.arquivadaEm && <ReaberturaConversa key={conversaSelecionada.id} conversaId={conversaSelecionada.id} pedido={conversaSelecionada.reabertura} lado="cliente" onAlterado={pedido => atualizarPedido(conversaSelecionada.id, pedido)} onAtualizar={atualizarConversas}/>}
                                />
                            </Stack>
                        ) : (
                            <Center style={{flex: 1, minHeight: 0}}>
                                <Text c="dimmed">Selecione uma conversa para começar.</Text>
                            </Center>
                        )}
                    </Card>
                </div>
            </div>
        </Stack>
    );
}
