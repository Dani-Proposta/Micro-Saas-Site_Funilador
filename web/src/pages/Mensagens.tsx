import { useEffect, useState } from "react";
import { ActionIcon, Button, Modal, Radio, Select, Alert, Badge, Box, Card, Center, Divider, Grid, Group, Loader, NavLink, ScrollArea, Stack, Text, TextInput, Title, Textarea, Menu } from "@mantine/core";

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

type Mensagem = {
    id: string;
    remetenteTipo: "admin" | "cliente";
    conteudo: string;
    enviadaEm: string;
};

const tipoConversa = {
    geral: {label: "Geral", color: "violet"},
    projeto: {label: "Projeto", color: "blue"},
    avulsa: {label: "Avulsa", color: "gray"},
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

    const clientesFiltrados = clientes.filter(cliente =>
        cliente.clienteNome.toLowerCase().includes(busca.trim().toLowerCase())
    );

    const clienteSelecionado = clientes.find(cliente =>
        cliente.conversas.some(conversa => conversa.id === conversaId)
    );

    const conversaSelecionada = clienteSelecionado?.conversas.find(conversa => conversa.id === conversaId);
    
    const [clienteCriacao, setClienteCriacao] = useState<ClienteConversas | null>(null);
    const [conversaEdicao, setConversaEdicao] = useState<Conversa | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarConversas() {
            try {
                const resposta = await fetch("/api/conversas", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao carregar conversas.");

                if (!controller.signal.aborted) setClientes(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar conversas.");
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarConversas();
        return () => controller.abort();
    }, []);

    function alternarCliente(clienteId: string) {
        setExpandidos(anteriores =>
            anteriores.includes(clienteId)
                ? anteriores.filter(id => id !== clienteId)
                : [...anteriores, clienteId]
        );
    }
    function adicionarConversa(clienteId: string, conversa: Conversa) {
        setClientes(anteriores => anteriores.map(cliente =>
            cliente.clienteId === clienteId
                ? {
                    ...cliente,
                    conversas: [
                        ...cliente.conversas.filter(c => c.tipo === "geral"),
                        conversa,
                        ...cliente.conversas.filter(c => c.tipo !== "geral"),
                    ],
                }
                : cliente
        ));

        setExpandidos(anteriores =>
            anteriores.includes(clienteId) ? anteriores : [...anteriores, clienteId]
        );

        setConversaId(conversa.id);
        setClienteCriacao(null);
    }
    function atualizarTitulo(conversaId: string, titulo: string) {
        setClientes(anteriores => anteriores.map(cliente => ({
            ...cliente,
            conversas: cliente.conversas.map(conversa =>
                conversa.id === conversaId
                    ? {...conversa, titulo}
                    : conversa
            ),
        })));

        setConversaEdicao(null);
    }

    return (
        <Stack gap="md">

            <Title order={2}>Central de mensagens</Title>
            {erro && <Alert color="red">{erro}</Alert>}
            {clienteCriacao && <NovaConversa key={clienteCriacao.clienteId} cliente={clienteCriacao} onClose={() => setClienteCriacao(null)} onCriada={conversa => adicionarConversa(clienteCriacao.clienteId, conversa)}/>}
            {conversaEdicao && <RenomearConversa key={conversaEdicao.id} conversa={conversaEdicao} onClose={() => setConversaEdicao(null)} onRenomeada={titulo => atualizarTitulo(conversaEdicao.id, titulo)}/>}

            <Grid align="stretch">

                <Grid.Col span={{base: 12, md: 4, lg: 3}}>
                    <Card withBorder padding="sm" h="100%">
                        <Stack gap="sm">

                            <TextInput placeholder="Buscar cliente..." value={busca} onChange={evento => setBusca(evento.currentTarget.value)}/>

                            <Divider/>

                            <ScrollArea h={480}>
                                <Stack gap={4}>
                                    {carregando && <Center><Loader size="sm"/></Center>}

                                    {!carregando && !erro && clientesFiltrados.length === 0 && <Text size="sm" c="dimmed">Nenhum cliente encontrado.</Text>}

                                    {clientesFiltrados.map(cliente => (
                                        <Group key={cliente.clienteId} align="flex-start" wrap="nowrap" gap={4}>
                                            <Box flex={1} miw={0}>
                                                <NavLink label={cliente.clienteNome} description={`${cliente.conversas.length} conversa(s)`} opened={expandidos.includes(cliente.clienteId)} onChange={() => alternarCliente(cliente.clienteId)} childrenOffset={16}>
                                                    {cliente.conversas.map(conversa => (
                                                        <NavLink key={conversa.id} label={conversa.titulo} active={conversaId === conversa.id} onClick={() => setConversaId(conversa.id)}/>
                                                    ))}
                                                </NavLink>
                                            </Box>

                                            <ActionIcon variant="subtle" color="gray" mt="xs" aria-label={`Criar conversa para ${cliente.clienteNome}`} onClick={() => setClienteCriacao(cliente)}>+</ActionIcon>
                                        </Group>
                                    ))}
                                </Stack>
                            </ScrollArea>

                        </Stack>
                    </Card>
                </Grid.Col>

                <Grid.Col span={{base: 12, md: 8, lg: 9}}>
                    <Card withBorder padding="md" h="100%">

                        {clienteSelecionado && conversaSelecionada ? (
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Stack gap={2}>
                                        <Title order={4}>{clienteSelecionado.clienteNome}</Title>
                                        <Text size="sm" c="dimmed">{conversaSelecionada.titulo}</Text>
                                    </Stack>

                                    <Group gap="xs">
                                        <Badge color={tipoConversa[conversaSelecionada.tipo].color}>{tipoConversa[conversaSelecionada.tipo].label}</Badge>

                                        {conversaSelecionada.tipo !== "geral" && (
                                            <Menu shadow="md" width={200} position="bottom-end">
                                                <Menu.Target>
                                                    <ActionIcon variant="subtle" color="gray" aria-label="Opções da conversa">⋮</ActionIcon>
                                                </Menu.Target>

                                                <Menu.Dropdown>
                                                    <Menu.Label>Gerenciar conversa</Menu.Label>
                                                    <Menu.Item onClick={() => setConversaEdicao(conversaSelecionada)}>Renomear conversa</Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        )}
                                    </Group>
                                </Group>

                                <Divider/>

                                <HistoricoMensagens key={conversaSelecionada.id} conversaId={conversaSelecionada.id}/>
                                
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

function HistoricoMensagens({conversaId}: {conversaId: string}) {

    const [mensagens, setMensagens] = useState<Mensagem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [conteudo, setConteudo] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarMensagens() {
            try {
                const resposta = await fetch(`/api/conversas/${conversaId}/mensagens`, {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao carregar mensagens.");

                if (!controller.signal.aborted) setMensagens(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar mensagens.");
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarMensagens();
        return () => controller.abort();
    }, [conversaId]);
    
    async function enviarMensagem() {
        if (enviando || !conteudo.trim()) return;

        setEnviando(true);
        setErroEnvio(null);

        try {
            const resposta = await fetch(`/api/conversas/${conversaId}/mensagens`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({conteudo}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível enviar a mensagem.");

            setMensagens(anteriores => [...anteriores, dados]);
            setConteudo("");

        } catch (erroRecebido) {
            setErroEnvio(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao enviar mensagem.");
        } finally {
            setEnviando(false);
        }
    }
    return (
        <Stack gap="sm">

            <ScrollArea h={440}>
                <Stack gap="sm">

                    {carregando && <Center><Loader size="sm"/></Center>}

                    {erro && <Alert color="red">{erro}</Alert>}

                    {!carregando && !erro && mensagens.length === 0 && <Center h={400}><Text c="dimmed" size="sm">Nenhuma mensagem por enquanto.</Text></Center>}

                    {mensagens.map(mensagem => (
                        <Group key={mensagem.id} justify={mensagem.remetenteTipo === "admin" ? "flex-end" : "flex-start"}>
                            <Box bg={mensagem.remetenteTipo === "admin" ? "violet.8" : "var(--mantine-color-default-hover)"} c={mensagem.remetenteTipo === "admin" ? "white" : undefined} p="sm" maw="80%" style={{borderRadius: 12}}>
                                <Text size="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{mensagem.conteudo}</Text>
                                <Text size="xs" opacity={0.7} ta="right">{new Date(mensagem.enviadaEm).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}</Text>
                            </Box>
                        </Group>
                    ))}

                </Stack>
            </ScrollArea>

            <Divider/>

            {erroEnvio && <Alert color="red">{erroEnvio}</Alert>}

            <form onSubmit={evento => {
                evento.preventDefault();
                void enviarMensagem();
            }}>
                <Group align="flex-end" wrap="nowrap">
                    <Textarea flex={1} placeholder="Digite sua mensagem..." value={conteudo} onChange={evento => setConteudo(evento.currentTarget.value)} autosize minRows={1} maxRows={4} maxLength={5000} disabled={enviando}/>
                    <Button type="submit" loading={enviando} disabled={carregando || !!erro || !conteudo.trim()}>Enviar</Button>
                </Group>
            </form>

        </Stack>
    );
}

function NovaConversa({cliente, onClose, onCriada}: {
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

    const projetosDisponiveis = (projetos ?? []).filter(projeto =>
        projeto.clienteId === cliente.clienteId &&
        !cliente.conversas.some(conversa => conversa.projetoId === projeto.id)
    );

    useEffect(() => {
        if (tipo !== "projeto") return;

        const controller = new AbortController();

        async function carregarProjetos() {
            try {
                const resposta = await fetch("/api/projetos", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível carregar os projetos.");

                if (!controller.signal.aborted) setProjetos(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErroProjetos(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar projetos.");
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
            const corpo = tipo === "avulsa"
                ? {clienteId: cliente.clienteId, tipo, titulo}
                : {clienteId: cliente.clienteId, tipo, projetoId};

            const resposta = await fetch("/api/conversas", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(corpo),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível criar a conversa.");

            onCriada({...dados, arquivadaEm: null});

        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao criar conversa.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Modal opened onClose={onClose} title="Nova conversa" centered closeOnEscape={!enviando} closeOnClickOutside={!enviando} withCloseButton={!enviando}>
            <Stack gap="md">

                <Text size="sm" c="dimmed">Cliente: {cliente.clienteNome}</Text>

                <Radio.Group label="Tipo de conversa" value={tipo} onChange={valor => {
                    setTipo(valor === "projeto" ? "projeto" : "avulsa");
                    setProjetoId(null);
                    setProjetos(null);
                    setErroProjetos(null);
                    setErro(null);
                }}>
                    <Stack gap="xs" mt="xs">
                        <Radio value="avulsa" label="Conversa avulsa" disabled={enviando}/>
                        <Radio value="projeto" label="Conversa de projeto" disabled={enviando}/>
                    </Stack>
                </Radio.Group>

                {tipo === "avulsa" && <TextInput label="Título" placeholder="Ex.: Orçamento adicional" value={titulo} onChange={evento => setTitulo(evento.currentTarget.value)} maxLength={150} disabled={enviando} required/>}

                {tipo === "projeto" && (
                    <Stack gap="xs">
                        {projetos === null && !erroProjetos && <Loader size="sm"/>}
                        {erroProjetos && <Alert color="red">{erroProjetos}</Alert>}

                        {projetos !== null && !erroProjetos && <Select label="Projeto" placeholder="Selecione um projeto" data={projetosDisponiveis.map(projeto => ({value: projeto.id, label: projeto.titulo}))} value={projetoId} onChange={setProjetoId} nothingFoundMessage="Nenhum projeto disponível" searchable disabled={enviando} required/>}

                        {projetos !== null && projetosDisponiveis.length === 0 && <Text size="xs" c="dimmed">Este cliente não possui projetos disponíveis para novas conversas.</Text>}
                    </Stack>
                )}

                {erro && <Alert color="red">{erro}</Alert>}

                <Group justify="flex-end">
                    <Button variant="default" disabled={enviando} onClick={onClose}>Cancelar</Button>
                    <Button loading={enviando} disabled={tipo === "avulsa" ? !titulo.trim() : !projetoId} onClick={() => void criarConversa()}>Criar conversa</Button>
                </Group>

            </Stack>
        </Modal>
    );
}

function RenomearConversa({conversa, onClose, onRenomeada}: {
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
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({titulo}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível renomear a conversa.");

            onRenomeada(dados.titulo);

        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao renomear conversa.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Modal opened onClose={onClose} title="Renomear conversa" centered closeOnEscape={!enviando} closeOnClickOutside={!enviando} withCloseButton={!enviando}>
            <Stack gap="md">

                <TextInput label="Título da conversa" value={titulo} onChange={evento => setTitulo(evento.currentTarget.value)} maxLength={150} disabled={enviando} required/>

                {erro && <Alert color="red">{erro}</Alert>}

                <Group justify="flex-end">
                    <Button variant="default" disabled={enviando} onClick={onClose}>Cancelar</Button>
                    <Button loading={enviando} disabled={!titulo.trim() || titulo.trim() === conversa.titulo} onClick={() => void renomear()}>Salvar</Button>
                </Group>

            </Stack>
        </Modal>
    );
}
