import classes from "../styles/Usabilidade.module.css";
import { useCallback, useEffect, useState } from "react";
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
    const projetoAlvo = new URLSearchParams(location.search).get("projeto");
    const voltarPara = destinoRetorno(location.state, "");
    const [conversas, setConversas] = useState<Conversa[]>([]);
    const [conversaId, setConversaId] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [abaArquivadas, setAbaArquivadas] = useState(false);
    const [selecionou, setSelecionou] = useState(false);

    const conversaSelecionada = conversas.find(conversa => conversa.id === conversaId)
        ?? (!selecionou ? (projetoAlvo ? conversas.find(c => c.projetoId === projetoAlvo) : (conversas.find(conversa => conversa.tipo === "geral" && !conversa.arquivadaEm) ?? conversas.find(conversa => !conversa.arquivadaEm))) : undefined);

    const arquivadas = conversaSelecionada ? !!conversaSelecionada.arquivadaEm : abaArquivadas;
    const conversasVisiveis = ordenarConversas(conversas.filter(conversa => !!conversa.arquivadaEm === arquivadas));
    const naoLidasAtivas = totalNaoLidas(conversas.filter(c => !c.arquivadaEm));
    const naoLidasArquivadas = totalNaoLidas(conversas.filter(c => !!c.arquivadaEm));

    const carregarConversas = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/me/conversas?todas=true", {signal, cache: "no-store"});
            const dados = await resposta.json();

            if (!resposta.ok) {
                if (!signal.aborted && [401, 403].includes(resposta.status)) setConversas([]);
                throw new Error(dados.erro ?? "Não foi possível carregar as conversas.");
            }
            if (!Array.isArray(dados)) throw new Error("Resposta de conversas inválida.");

            if (!signal.aborted) {
                setConversas(dados);
                setErro(null);
            }
        } catch (erroRecebido) {
            if (!signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao atualizar conversas.");
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
        const mostrarArquivadas = valor === "arquivadas";
        if (mostrarArquivadas === arquivadas) return;

        setAbaArquivadas(mostrarArquivadas);
        setSelecionou(true);
        setConversaId(null);
    }

    function selecionarConversa(id: string) {
        setSelecionou(true);
        setConversaId(id);
    }

    return (
        <Stack gap="md" className={classes.chatPagina}>
            <Group justify="space-between"><Title order={2}>Minhas mensagens</Title>{voltarPara && <Button variant="subtle" size="xs" onClick={() => navigate(voltarPara)}>← Voltar aos projetos</Button>}</Group>
            {!carregando && !erro && !selecionou && projetoAlvo && !conversaSelecionada && <Alert color="gray" title="Conversa do projeto">Ainda não há uma conversa disponível para este projeto. Você pode entrar em contato pela conversa Geral.</Alert>}
            {erro && <Alert color="red">{erro}</Alert>}

            <div className={classes.chatGrid}>
                <div className={classes.chatColuna}>
                    <Card withBorder padding="sm" className={classes.chatCard}>
                        <Stack gap="sm" className={classes.chatPilha}>
                            <Text fw={600} size="sm">
                                Conversas
                            </Text>
                            <SegmentedControl fullWidth size="sm" value={arquivadas ? "arquivadas" : "ativas"} onChange={alternarVisualizacao} data={[{label: naoLidasAtivas ? `Ativas (${naoLidasAtivas})` : "Ativas", value: "ativas"}, {label: naoLidasArquivadas ? `Arquivadas (${naoLidasArquivadas})` : "Arquivadas", value: "arquivadas"}]}/>
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
