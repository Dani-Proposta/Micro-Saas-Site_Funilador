import chat from "../styles/Chat.module.css";
import { ControleChat, type OpcoesChat } from "../components/ControleChat";
import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
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
    NavLink,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Menu,
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

export function MensagensCliente(opcoes: OpcoesChat) {
    const location = useLocation();
    return <CentralMensagensCliente key={location.search} {...opcoes}/>;
}

function CentralMensagensCliente({foco, alternarFoco}: OpcoesChat) {
    const [listaRecolhida, setListaRecolhida] = useState(false);
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
    const [busca, setBusca] = useState("");
    const [aba, setAba] = useState<"ativas" | "arquivadas" | "ocultadas">("ativas");
    const [alterandoOculta, setAlterandoOculta] = useState(false);
    const [erroAcao, setErroAcao] = useState<string | null>(null);
    const revisao = useRef(0);
    const [selecionou, setSelecionou] = useState(false);

    const conversaSelecionada = conversas.find(conversa => conversa.id === conversaId)
        ?? (!selecionou ? (conversaAlvo ? conversas.find(c => c.id === conversaAlvo) : projetoAlvo ? conversas.find(c => c.projetoId === projetoAlvo) : undefined) : undefined);

    function categoria(c: Conversa) {return c.arquivadaEm ? "arquivadas" : c.ocultada ? "ocultadas" : "ativas";}
    const abaAtual = conversaSelecionada ? categoria(conversaSelecionada) : aba;
    const conversasVisiveis = ordenarConversas(conversas.filter(c => categoria(c) === abaAtual && c.titulo.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"))));
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
        <Stack gap={4} className={`${classes.chatPagina} ${chat.pagina}`} data-selecionada={!!conversaSelecionada} data-lista-recolhida={!!conversaSelecionada && listaRecolhida}>
            <Group justify="space-between" gap="xs" className={chat.topo}><Title order={1} className={estrutura.heading}>Minhas mensagens</Title>{voltarPara && <Button variant="subtle" size="xs" onClick={() => navigate(voltarPara)}>← Voltar aos projetos</Button>}<ControleChat foco={foco} alternarFoco={alternarFoco}/></Group>
            {!carregando && !erro && !selecionou && projetoAlvo && !conversaSelecionada && <Alert color="gray" title="Conversa do projeto">Ainda não há uma conversa disponível para este projeto. <Button size="compact-xs" variant="light" onClick={() => {const geral = conversas.find(c => c.tipo === "geral"); if (geral) selecionarConversa(geral.id);}}>Abrir conversa Geral</Button></Alert>}
            {erro && <Alert color="red">{erro}</Alert>}
            {erroAcao && <Alert color="red">{erroAcao}</Alert>}

            <div className={`${classes.chatGrid} ${chat.grid}`}>
                <div className={`${classes.chatColuna} ${chat.lista}`}>
                    <Card withBorder padding="sm" className={classes.chatCard}>
                        <Stack gap="sm" className={classes.chatPilha}>
                            <Text fw={600} size="sm">
                                Conversas
                            </Text>
                            <SegmentedControl fullWidth size="xs" disabled={alterandoOculta} value={abaAtual} onChange={alternarVisualizacao} data={[{label: naoLidasAtivas ? `Ativas (${naoLidasAtivas})` : "Ativas", value: "ativas"}, {label: naoLidasArquivadas ? `Arquivadas (${naoLidasArquivadas})` : "Arquivadas", value: "arquivadas"}, {label: naoLidasOcultadas ? `Ocultas (${naoLidasOcultadas})` : "Ocultas", value: "ocultadas"}]}/>
                            <TextInput size="sm" placeholder="Buscar conversa..." aria-label="Buscar conversa" value={busca} onChange={e => setBusca(e.currentTarget.value)}/>
                            <Divider />
                            <ScrollArea className={classes.chatLista} offsetScrollbars>
                                <Stack gap={4}>
                                    {carregando && (
                                        <Center>
                                            <Carregamento tipo="compacto" texto="Carregando conversas..."/>
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
                <div className={`${classes.chatColuna} ${chat.conversa}`}>
                    <Card withBorder padding="sm" className={`${classes.chatCard} ${chat.painel}`}>
                        {conversaSelecionada ? (
                            <HistoricoMensagens
                                    key={conversaSelecionada.id}
                                    conversaId={conversaSelecionada.id}
                                    projetoId={conversaSelecionada.projetoId}
                                    lado="cliente"
                                    arquivada={!!conversaSelecionada.arquivadaEm}
                                    onAtualizarConversas={atualizarConversas}
                                    identidade={<Group gap={4} wrap="nowrap" className={chat.identidade}><ControleChat voltar={() => {setAba(abaAtual); setSelecionou(true); setConversaId(null); setErroAcao(null);}} listaRecolhida={listaRecolhida} alternarLista={() => setListaRecolhida(v => !v)}/><Title order={4} className={chat.titulo}>{conversaSelecionada.titulo}</Title></Group>}
                                    estadoConversa={<>{conversaSelecionada.arquivadaEm && <Badge size="sm" color="gray">Arquivada</Badge>}<Badge size="sm" color={tipoConversa[conversaSelecionada.tipo].color}>{tipoConversa[conversaSelecionada.tipo].label}</Badge></>}
                                    acoesConversa={!conversaSelecionada.arquivadaEm && conversaSelecionada.tipo !== "geral" ? <><Menu.Label>Organização</Menu.Label><Menu.Item disabled={alterandoOculta} onClick={() => void alterarOcultacao(conversaSelecionada)}>{conversaSelecionada.ocultada ? "Exibir na lista" : "Ocultar conversa"}</Menu.Item></> : null}
                                    acoesArquivada={conversaSelecionada.arquivadaEm && <ReaberturaConversa key={conversaSelecionada.id} conversaId={conversaSelecionada.id} pedido={conversaSelecionada.reabertura} lado="cliente" onAlterado={pedido => atualizarPedido(conversaSelecionada.id, pedido)} onAtualizar={atualizarConversas}/>}
                            />
                        ) : (
                            <Center style={{flex: 1, minHeight: 0}}>
                                <Stack align="center" gap="xs" p="md"><Text fw={600}>Suas conversas</Text><Text c="dimmed" size="sm" ta="center">Selecione uma conversa na lista para começar.</Text></Stack>
                            </Center>
                        )}
                    </Card>
                </div>
            </div>
        </Stack>
    );
}
