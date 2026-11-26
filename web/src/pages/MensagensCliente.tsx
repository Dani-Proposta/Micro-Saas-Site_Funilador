import { useCallback, useState } from "react";
import {
    Alert,
    Badge,
    Card,
    Center,
    Divider,
    Grid,
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
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Conversa = {
    id: string;
    titulo: string;
    tipo: "geral" | "avulsa" | "projeto";
    projetoId: string | null;
    criadaEm: string;
    arquivadaEm: string | null;
};

const tipoConversa = {
    geral: { label: "Geral", color: "violet" },
    projeto: { label: "Projeto", color: "blue" },
    avulsa: { label: "Avulsa", color: "gray" },
};

export function MensagensCliente() {
    const [conversas, setConversas] = useState<Conversa[]>([]);
    const [conversaId, setConversaId] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [abaArquivadas, setAbaArquivadas] = useState(false);
    const [selecionou, setSelecionou] = useState(false);

    const conversaSelecionada = conversas.find(conversa => conversa.id === conversaId)
        ?? (!selecionou ? (conversas.find(conversa => conversa.tipo === "geral" && !conversa.arquivadaEm) ?? conversas.find(conversa => !conversa.arquivadaEm)) : undefined);

    const arquivadas = conversaSelecionada ? !!conversaSelecionada.arquivadaEm : abaArquivadas;
    const conversasVisiveis = conversas.filter(conversa => !!conversa.arquivadaEm === arquivadas);

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
        <Stack gap="md">
            <Title order={2}>Minhas mensagens</Title>
            {erro && <Alert color="red">{erro}</Alert>}

            <Grid align="stretch">
                <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
                    <Card withBorder padding="sm" h="100%">
                        <Stack gap="sm">
                            <Text fw={600} size="sm">
                                Conversas
                            </Text>
                            <SegmentedControl fullWidth size="sm" value={arquivadas ? "arquivadas" : "ativas"} onChange={alternarVisualizacao} data={[{label: "Ativas", value: "ativas"}, {label: "Arquivadas", value: "arquivadas"}]}/>
                            <Divider />
                            <ScrollArea h={480}>
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
                                            label={conversa.titulo}
                                            description={tipoConversa[conversa.tipo].label}
                                            active={conversaSelecionada?.id === conversa.id}
                                            onClick={() => selecionarConversa(conversa.id)}
                                        />
                                    ))}
                                </Stack>
                            </ScrollArea>
                        </Stack>
                    </Card>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
                    <Card withBorder padding="md" h="100%">
                        {conversaSelecionada ? (
                            <Stack gap="md">
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
                            <Center h={500}>
                                <Text c="dimmed">Selecione uma conversa para começar.</Text>
                            </Center>
                        )}
                    </Card>
                </Grid.Col>
            </Grid>
        </Stack>
    );
}
