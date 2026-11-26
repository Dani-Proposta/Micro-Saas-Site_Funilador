import { useEffect, useState } from "react";
import { ActionIcon, Button, Modal, Radio, Select, Alert, Badge, Box, Card, Center, Divider, Grid, Group, Loader, NavLink, ScrollArea, Stack, Text, TextInput, Title, Menu, SegmentedControl, } from "@mantine/core";
import { HistoricoMensagens } from "../components/HistoricoMensagens";

type Conversa = {
    id: string;
    titulo: string;
    tipo: "geral" | "avulsa" | "projeto";
    projetoId: string | null;
    criadaEm: string;
    arquivadaEm: string | null;
};

type ClienteConversas = {
    clienteId: string;
    clienteNome: string;
    conversas: Conversa[];
};

const tipoConversa = {
    geral: { label: "Geral", color: "violet" },
    projeto: { label: "Projeto", color: "blue" },
    avulsa: { label: "Avulsa", color: "gray" },
};

type Projeto = {
    id: string;
    clienteId: string;
    titulo: string;
};

export function Mensagens() {
    const [clientes, setClientes] = useState<ClienteConversas[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [busca, setBusca] = useState("");
    const [expandidos, setExpandidos] = useState<string[]>([]);
    const [conversaId, setConversaId] = useState<string | null>(null);

    const clientesFiltrados = clientes.filter((cliente) =>
        cliente.clienteNome.toLowerCase().includes(busca.trim().toLowerCase()),
    );

    const clienteSelecionado = clientes.find((cliente) =>
        cliente.conversas.some((conversa) => conversa.id === conversaId),
    );

    const conversaSelecionada = clienteSelecionado?.conversas.find(
        (conversa) => conversa.id === conversaId,
    );

    const [clienteCriacao, setClienteCriacao] = useState<ClienteConversas | null>(
        null,
    );
    const [conversaEdicao, setConversaEdicao] = useState<Conversa | null>(null);
    const [arquivadas, setArquivadas] = useState(false);
    const [conversaArquivo, setConversaArquivo] = useState<{
        conversa: Conversa;
        acao: "arquivar" | "restaurar";
    } | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarConversas() {
            try {
                const resposta = await fetch(
                    `/api/conversas?arquivadas=${arquivadas}`,
                    { signal: controller.signal },
                );
                const dados = await resposta.json();

                if (!resposta.ok)
                    throw new Error(dados.erro ?? "Erro ao carregar conversas.");

                if (!controller.signal.aborted) setClientes(dados);
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
    }, [arquivadas]);

    function alternarCliente(clienteId: string) {
        setExpandidos((anteriores) =>
            anteriores.includes(clienteId)
                ? anteriores.filter((id) => id !== clienteId)
                : [...anteriores, clienteId],
        );
    }
    function adicionarConversa(clienteId: string, conversa: Conversa) {
        setClientes((anteriores) =>
            anteriores.map((cliente) =>
                cliente.clienteId === clienteId
                    ? {
                        ...cliente,
                        conversas: [
                            ...cliente.conversas.filter((c) => c.tipo === "geral"),
                            conversa,
                            ...cliente.conversas.filter((c) => c.tipo !== "geral"),
                        ],
                    }
                    : cliente,
            ),
        );

        setExpandidos((anteriores) =>
            anteriores.includes(clienteId) ? anteriores : [...anteriores, clienteId],
        );

        setConversaId(conversa.id);
        setClienteCriacao(null);
    }
    function atualizarTitulo(conversaId: string, titulo: string) {
        setClientes((anteriores) =>
            anteriores.map((cliente) => ({
                ...cliente,
                conversas: cliente.conversas.map((conversa) =>
                    conversa.id === conversaId ? { ...conversa, titulo } : conversa,
                ),
            })),
        );

        setConversaEdicao(null);
    }

    function concluirArquivamento(id: string) {
        setClientes((anteriores) =>
            anteriores
                .map((cliente) => ({
                    ...cliente,
                    conversas: cliente.conversas.filter((conversa) => conversa.id !== id),
                }))
                .filter((cliente) => !arquivadas || cliente.conversas.length > 0),
        );

        setConversaId((anterior) => (anterior === id ? null : anterior));
        setConversaArquivo(null);
    }

    function alternarVisualizacao(valor: string) {
        const mostrarArquivadas = valor === "arquivadas";

        if (mostrarArquivadas === arquivadas) return;

        setArquivadas(mostrarArquivadas);
        setConversaId(null);
        setExpandidos([]);
        setClientes([]);
        setErro(null);
        setCarregando(true);
    }

    return (
        <Stack gap="md">
            <Title order={2}>Central de mensagens</Title>
            {erro && <Alert color="red">{erro}</Alert>}
            {clienteCriacao && (
                <NovaConversa
                    key={clienteCriacao.clienteId}
                    cliente={clienteCriacao}
                    onClose={() => setClienteCriacao(null)}
                    onCriada={(conversa) =>
                        adicionarConversa(clienteCriacao.clienteId, conversa)
                    }
                />
            )}
            {conversaEdicao && (
                <RenomearConversa
                    key={conversaEdicao.id}
                    conversa={conversaEdicao}
                    onClose={() => setConversaEdicao(null)}
                    onRenomeada={(titulo) => atualizarTitulo(conversaEdicao.id, titulo)}
                />
            )}
            {conversaArquivo && (
                <AlterarArquivamento
                    key={conversaArquivo.conversa.id}
                    conversa={conversaArquivo.conversa}
                    acao={conversaArquivo.acao}
                    onClose={() => setConversaArquivo(null)}
                    onConcluido={() => concluirArquivamento(conversaArquivo.conversa.id)}
                />
            )}

            <Grid align="stretch">
                <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
                    <Card withBorder padding="sm" h="100%">
                        <Stack gap="sm">
                            <SegmentedControl
                                fullWidth
                                size="sm"
                                value={arquivadas ? "arquivadas" : "ativas"}
                                onChange={alternarVisualizacao}
                                data={[
                                    { label: "Ativas", value: "ativas" },
                                    { label: "Arquivadas", value: "arquivadas" },
                                ]}
                            />

                            <TextInput
                                placeholder="Buscar cliente..."
                                value={busca}
                                onChange={(evento) => setBusca(evento.currentTarget.value)}
                            />

                            <Divider />

                            <ScrollArea h={480}>
                                <Stack gap={4}>
                                    {carregando && (
                                        <Center>
                                            <Loader size="sm" />
                                        </Center>
                                    )}

                                    {!carregando && !erro && clientesFiltrados.length === 0 && (
                                        <Text size="sm" c="dimmed">
                                            Nenhum cliente encontrado.
                                        </Text>
                                    )}

                                    {clientesFiltrados.map((cliente) => (
                                        <Group
                                            key={cliente.clienteId}
                                            align="flex-start"
                                            wrap="nowrap"
                                            gap={4}
                                        >
                                            <Box flex={1} miw={0}>
                                                <NavLink
                                                    label={cliente.clienteNome}
                                                    description={`${cliente.conversas.length} conversa(s)`}
                                                    opened={expandidos.includes(cliente.clienteId)}
                                                    onChange={() => alternarCliente(cliente.clienteId)}
                                                    childrenOffset={16}
                                                >
                                                    {cliente.conversas.map((conversa) => (
                                                        <NavLink
                                                            key={conversa.id}
                                                            label={conversa.titulo}
                                                            active={conversaId === conversa.id}
                                                            onClick={() => setConversaId(conversa.id)}
                                                        />
                                                    ))}
                                                </NavLink>
                                            </Box>

                                            {!arquivadas && (
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    mt="xs"
                                                    aria-label={`Criar conversa para ${cliente.clienteNome}`}
                                                    onClick={() => setClienteCriacao(cliente)}
                                                >
                                                    +
                                                </ActionIcon>
                                            )}
                                        </Group>
                                    ))}
                                </Stack>
                            </ScrollArea>
                        </Stack>
                    </Card>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
                    <Card withBorder padding="md" h="100%">
                        {clienteSelecionado && conversaSelecionada ? (
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Stack gap={2}>
                                        <Title order={4}>{clienteSelecionado.clienteNome}</Title>
                                        <Text size="sm" c="dimmed">
                                            {conversaSelecionada.titulo}
                                        </Text>
                                    </Stack>

                                    <Group gap="xs">
                                        <Badge color={tipoConversa[conversaSelecionada.tipo].color}>
                                            {tipoConversa[conversaSelecionada.tipo].label}
                                        </Badge>

                                        {conversaSelecionada.tipo !== "geral" && (
                                            <Menu shadow="md" width={200} position="bottom-end">
                                                <Menu.Target>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="gray"
                                                        aria-label="Opções da conversa"
                                                    >
                                                        ⋮
                                                    </ActionIcon>
                                                </Menu.Target>

                                                <Menu.Dropdown>
                                                    <Menu.Label>Gerenciar conversa</Menu.Label>
                                                    {arquivadas ? (
                                                        <Menu.Item
                                                            color="green"
                                                            onClick={() =>
                                                                setConversaArquivo({
                                                                    conversa: conversaSelecionada,
                                                                    acao: "restaurar",
                                                                })
                                                            }
                                                        >
                                                            Restaurar conversa
                                                        </Menu.Item>
                                                    ) : (
                                                        <>
                                                            <Menu.Item
                                                                onClick={() =>
                                                                    setConversaEdicao(conversaSelecionada)
                                                                }
                                                            >
                                                                Renomear conversa
                                                            </Menu.Item>
                                                            <Menu.Item
                                                                onClick={() =>
                                                                    setConversaArquivo({
                                                                        conversa: conversaSelecionada,
                                                                        acao: "arquivar",
                                                                    })
                                                                }
                                                            >
                                                                Arquivar conversa
                                                            </Menu.Item>
                                                        </>
                                                    )}
                                                </Menu.Dropdown>
                                            </Menu>
                                        )}
                                    </Group>
                                </Group>

                                <Divider />

                                <HistoricoMensagens
                                    key={conversaSelecionada.id}
                                    conversaId={conversaSelecionada.id}
                                    arquivada={arquivadas}
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

function NovaConversa({
    cliente,
    onClose,
    onCriada,
}: {
    cliente: ClienteConversas;
    onClose: () => void;
    onCriada: (conversa: Conversa) => void;
}) {
    const [tipo, setTipo] = useState<"avulsa" | "projeto">("avulsa");
    const [titulo, setTitulo] = useState("");
    const [projetoId, setProjetoId] = useState<string | null>(null);

    const [projetos, setProjetos] = useState<Projeto[] | null>(null);
    const [erroProjetos, setErroProjetos] = useState<string | null>(null);

    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const projetosDisponiveis = (projetos ?? []).filter(
        (projeto) =>
            projeto.clienteId === cliente.clienteId &&
            !cliente.conversas.some((conversa) => conversa.projetoId === projeto.id),
    );

    useEffect(() => {
        if (tipo !== "projeto") return;

        const controller = new AbortController();

        async function carregarProjetos() {
            try {
                const resposta = await fetch("/api/projetos", {
                    signal: controller.signal,
                });
                const dados = await resposta.json();

                if (!resposta.ok)
                    throw new Error(
                        dados.erro ?? "Não foi possível carregar os projetos.",
                    );

                if (!controller.signal.aborted) setProjetos(dados);
            } catch (erroRecebido) {
                if (!controller.signal.aborted)
                    setErroProjetos(
                        erroRecebido instanceof Error
                            ? erroRecebido.message
                            : "Falha ao carregar projetos.",
                    );
            }
        }

        void carregarProjetos();
        return () => controller.abort();
    }, [tipo]);

    async function criarConversa() {
        if (enviando) return;

        if (tipo === "avulsa" && !titulo.trim()) return;
        if (tipo === "projeto" && !projetoId) return;

        setEnviando(true);
        setErro(null);

        try {
            const corpo =
                tipo === "avulsa"
                    ? { clienteId: cliente.clienteId, tipo, titulo }
                    : { clienteId: cliente.clienteId, tipo, projetoId };

            const resposta = await fetch("/api/conversas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(corpo),
            });

            const dados = await resposta.json();

            if (!resposta.ok)
                throw new Error(dados.erro ?? "Não foi possível criar a conversa.");

            onCriada({ ...dados, arquivadaEm: null });
        } catch (erroRecebido) {
            setErro(
                erroRecebido instanceof Error
                    ? erroRecebido.message
                    : "Falha ao criar conversa.",
            );
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Modal
            opened
            onClose={onClose}
            title="Nova conversa"
            centered
            closeOnEscape={!enviando}
            closeOnClickOutside={!enviando}
            withCloseButton={!enviando}
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Cliente: {cliente.clienteNome}
                </Text>

                <Radio.Group
                    label="Tipo de conversa"
                    value={tipo}
                    onChange={(valor) => {
                        setTipo(valor === "projeto" ? "projeto" : "avulsa");
                        setProjetoId(null);
                        setProjetos(null);
                        setErroProjetos(null);
                        setErro(null);
                    }}
                >
                    <Stack gap="xs" mt="xs">
                        <Radio value="avulsa" label="Conversa avulsa" disabled={enviando} />
                        <Radio
                            value="projeto"
                            label="Conversa de projeto"
                            disabled={enviando}
                        />
                    </Stack>
                </Radio.Group>

                {tipo === "avulsa" && (
                    <TextInput
                        label="Título"
                        placeholder="Ex.: Orçamento adicional"
                        value={titulo}
                        onChange={(evento) => setTitulo(evento.currentTarget.value)}
                        maxLength={150}
                        disabled={enviando}
                        required
                    />
                )}

                {tipo === "projeto" && (
                    <Stack gap="xs">
                        {projetos === null && !erroProjetos && <Loader size="sm" />}
                        {erroProjetos && <Alert color="red">{erroProjetos}</Alert>}

                        {projetos !== null && !erroProjetos && (
                            <Select
                                label="Projeto"
                                placeholder="Selecione um projeto"
                                data={projetosDisponiveis.map((projeto) => ({
                                    value: projeto.id,
                                    label: projeto.titulo,
                                }))}
                                value={projetoId}
                                onChange={setProjetoId}
                                nothingFoundMessage="Nenhum projeto disponível"
                                searchable
                                disabled={enviando}
                                required
                            />
                        )}

                        {projetos !== null && projetosDisponiveis.length === 0 && (
                            <Text size="xs" c="dimmed">
                                Este cliente não possui projetos disponíveis para novas
                                conversas.
                            </Text>
                        )}
                    </Stack>
                )}

                {erro && <Alert color="red">{erro}</Alert>}

                <Group justify="flex-end">
                    <Button variant="default" disabled={enviando} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        loading={enviando}
                        disabled={tipo === "avulsa" ? !titulo.trim() : !projetoId}
                        onClick={() => void criarConversa()}
                    >
                        Criar conversa
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

function RenomearConversa({
    conversa,
    onClose,
    onRenomeada,
}: {
    conversa: Conversa;
    onClose: () => void;
    onRenomeada: (titulo: string) => void;
}) {
    const [titulo, setTitulo] = useState(conversa.titulo);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    async function renomear() {
        if (enviando || !titulo.trim() || titulo.trim() === conversa.titulo) return;

        setEnviando(true);
        setErro(null);

        try {
            const resposta = await fetch(`/api/conversas/${conversa.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ titulo }),
            });

            const dados = await resposta.json();

            if (!resposta.ok)
                throw new Error(dados.erro ?? "Não foi possível renomear a conversa.");

            onRenomeada(dados.titulo);
        } catch (erroRecebido) {
            setErro(
                erroRecebido instanceof Error
                    ? erroRecebido.message
                    : "Falha ao renomear conversa.",
            );
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Modal
            opened
            onClose={onClose}
            title="Renomear conversa"
            centered
            closeOnEscape={!enviando}
            closeOnClickOutside={!enviando}
            withCloseButton={!enviando}
        >
            <Stack gap="md">
                <TextInput
                    label="Título da conversa"
                    value={titulo}
                    onChange={(evento) => setTitulo(evento.currentTarget.value)}
                    maxLength={150}
                    disabled={enviando}
                    required
                />

                {erro && <Alert color="red">{erro}</Alert>}

                <Group justify="flex-end">
                    <Button variant="default" disabled={enviando} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        loading={enviando}
                        disabled={!titulo.trim() || titulo.trim() === conversa.titulo}
                        onClick={() => void renomear()}
                    >
                        Salvar
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

function AlterarArquivamento({
    conversa,
    acao,
    onClose,
    onConcluido,
}: {
    conversa: Conversa;
    acao: "arquivar" | "restaurar";
    onClose: () => void;
    onConcluido: () => void;
}) {
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const arquivando = acao === "arquivar";

    async function confirmar() {
        if (enviando || conversa.tipo === "geral") return;

        setEnviando(true);
        setErro(null);

        try {
            const resposta = await fetch(`/api/conversas/${conversa.id}/${acao}`, {
                method: "PATCH",
            });

            if (!resposta.ok) {
                const dados = await resposta.json().catch(() => null);
                throw new Error(
                    dados?.erro ?? "Não foi possível alterar o arquivamento da conversa.",
                );
            }

            onConcluido();
        } catch (erroRecebido) {
            setErro(
                erroRecebido instanceof Error
                    ? erroRecebido.message
                    : "Falha ao alterar o arquivamento.",
            );
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Modal
            opened
            onClose={onClose}
            title={arquivando ? "Arquivar conversa" : "Restaurar conversa"}
            centered
            closeOnEscape={!enviando}
            closeOnClickOutside={!enviando}
            withCloseButton={!enviando}
        >
            <Stack gap="md">
                <Text size="sm" fw={500}>
                    {conversa.titulo}
                </Text>

                <Text size="sm">
                    {arquivando
                        ? "A conversa será movida para as arquivadas. O histórico será preservado, mas não será possível enviar novas mensagens até restaurá-la."
                        : "A conversa voltará à lista de ativas e poderá receber novas mensagens novamente."}
                </Text>

                {erro && <Alert color="red">{erro}</Alert>}

                <Group justify="flex-end">
                    <Button variant="default" disabled={enviando} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        color={arquivando ? "gray" : "green"}
                        loading={enviando}
                        onClick={() => void confirmar()}
                    >
                        {arquivando ? "Arquivar" : "Restaurar"}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
