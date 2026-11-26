import { useEffect, useState } from "react";
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
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { HistoricoMensagens } from "../components/HistoricoMensagens";

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

    const conversaSelecionada = conversas.find(
        (conversa) => conversa.id === conversaId,
    );

    useEffect(() => {
        const controller = new AbortController();

        async function carregarConversas() {
            try {
                const resposta = await fetch("/api/me/conversas", {
                    signal: controller.signal,
                });
                const dados: Conversa[] = await resposta.json();

                if (!resposta.ok)
                    throw new Error("Não foi possível carregar as conversas.");

                if (!controller.signal.aborted) {
                    setConversas(dados);
                    setConversaId(
                        dados.find((conversa) => conversa.tipo === "geral")?.id ??
                        dados[0]?.id ??
                        null,
                    );
                }
            } catch (erroRecebido) {
                if (!controller.signal.aborted)
                    setErro(
                        erroRecebido instanceof Error
                            ? erroRecebido.message
                            : "Falha ao carregar conversas.",
                    );
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarConversas();
        return () => controller.abort();
    }, []);

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
                            <Divider />
                            <ScrollArea h={480}>
                                <Stack gap={4}>
                                    {carregando && (
                                        <Center>
                                            <Loader size="sm" />
                                        </Center>
                                    )}
                                    {!carregando && !erro && conversas.length === 0 && (
                                        <Text size="sm" c="dimmed">
                                            Nenhuma conversa disponível.
                                        </Text>
                                    )}
                                    {conversas.map((conversa) => (
                                        <NavLink
                                            key={conversa.id}
                                            label={conversa.titulo}
                                            description={tipoConversa[conversa.tipo].label}
                                            active={conversaId === conversa.id}
                                            onClick={() => setConversaId(conversa.id)}
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
                                    <Badge color={tipoConversa[conversaSelecionada.tipo].color}>
                                        {tipoConversa[conversaSelecionada.tipo].label}
                                    </Badge>
                                </Group>
                                <Divider />
                                <HistoricoMensagens
                                    key={conversaSelecionada.id}
                                    conversaId={conversaSelecionada.id}
                                    lado="cliente"
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
