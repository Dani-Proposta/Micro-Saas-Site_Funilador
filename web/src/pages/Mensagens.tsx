import classes from "../styles/Usabilidade.module.css";
import { useCallback, useRef, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { destinoRetorno, estadoRetorno } from "../lib/navegacaoContextual";
import { ActionIcon, Button, Modal, Radio, Select, Alert, Badge, Box, Card, Center, Divider, Group, Loader, NavLink, ScrollArea, Stack, Text, TextInput, Title, Menu, SegmentedControl, } from "@mantine/core";
import { ReaberturaConversa } from "../components/ReaberturaConversa";
import type { PedidoReabertura } from "../components/ReaberturaConversa";
import { HistoricoMensagens } from "../components/HistoricoMensagens";
import { EVENTO_LEITURA } from "../hooks/useMensagensNaoLidas";
import { ordenarConversas, totalNaoLidas, atividadeMaisRecente } from "../lib/ordenarConversas";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";

type Conversa = {
    id: string;
    titulo: string;
    tipo: "geral" | "avulsa" | "projeto";
    projetoId: string | null;
    criadaEm: string;
    arquivadaEm: string | null;
    reabertura?: PedidoReabertura | null;
    naoLidas?: number;
    ultimaAtividadeEm?: string;
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
    const location = useLocation();
    return <CentralMensagens key={location.search}/>;
}

function CentralMensagens() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const clienteAlvo = params.get("cliente");
    const projetoAlvo = params.get("projeto");
    const conversaAlvo = params.get("conversa");
    const voltarPara = destinoRetorno(location.state, "");
    const origemAnterior = estadoRetorno(location.state)?.estadoAnterior;
    const origemProjeto = destinoRetorno({voltarPara: location.state?.origemProjeto}, "/projetos");
    const [clientes, setClientes] = useState<ClienteConversas[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [busca, setBusca] = useState("");
    const [expandidos, setExpandidos] = useState<string[]>(clienteAlvo ? [clienteAlvo] : []);
    // undefined: seguir o atalho inicial; null: nenhuma seleção por escolha do usuário.
    const [escolha, setConversaId] = useState<string | null | undefined>(undefined);
    const clienteAtalho = clientes.find(c => conversaAlvo ? c.conversas.some(conversa => conversa.id === conversaAlvo) : c.clienteId === clienteAlvo);
    const conversaAtalho = clienteAtalho?.conversas.find(c => conversaAlvo ? c.id === conversaAlvo : projetoAlvo ? c.projetoId === projetoAlvo : c.tipo === "geral");
    const conversaId = escolha === undefined ? conversaAtalho?.id ?? null : escolha;
    const [projetoCriacao, setProjetoCriacao] = useState<string | null>(null);

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
    const [abaArquivadas, setAbaArquivadas] = useState(false);
    const arquivadas = conversaSelecionada ? !!conversaSelecionada.arquivadaEm : abaArquivadas;
    const revisao = useRef(0);

    const clientesFiltrados = clientes.map(cliente => ({
        ...cliente,
        conversas: ordenarConversas(cliente.conversas.filter(conversa => !!conversa.arquivadaEm === arquivadas)).sort((a, b) => Number(b.reabertura?.status === "pendente") - Number(a.reabertura?.status === "pendente")),
    })).filter(cliente =>
        (!arquivadas || cliente.conversas.length > 0) &&
        cliente.clienteNome.toLowerCase().includes(busca.trim().toLowerCase())
    ).sort((a, b) =>
        Number(b.conversas.some(c => c.reabertura?.status === "pendente")) - Number(a.conversas.some(c => c.reabertura?.status === "pendente")) ||
        Number(totalNaoLidas(b.conversas) > 0) - Number(totalNaoLidas(a.conversas) > 0) ||
        atividadeMaisRecente(b.conversas) - atividadeMaisRecente(a.conversas) ||
        a.clienteNome.localeCompare(b.clienteNome, "pt-BR")
    );
    const todasConversas = clientes.flatMap(cliente => cliente.conversas);
    const naoLidasAtivas = totalNaoLidas(todasConversas.filter(c => !c.arquivadaEm));
    const naoLidasArquivadas = totalNaoLidas(todasConversas.filter(c => !!c.arquivadaEm));
    const pedidosPendentes = todasConversas.filter(c => c.reabertura?.status === "pendente").length;
    const [conversaArquivo, setConversaArquivo] = useState<{
        conversa: Conversa;
        acao: "arquivar" | "restaurar";
    } | null>(null);

    const carregarConversas = useCallback(async (signal: AbortSignal) => {
        const versao = revisao.current;

        try {
            const resposta = await fetch("/api/conversas?todas=true", {signal, cache: "no-store"});
            const dados = await resposta.json();

            if (!resposta.ok) {
                if (!signal.aborted && versao === revisao.current && [401, 403].includes(resposta.status)) setClientes([]);
                throw new Error(dados.erro ?? "Erro ao carregar conversas.");
            }
            if (!Array.isArray(dados)) throw new Error("Resposta de conversas inválida.");

            if (!signal.aborted && versao === revisao.current) {
                setClientes(dados);
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

    function alternarCliente(clienteId: string) {
        setExpandidos((anteriores) =>
            anteriores.includes(clienteId)
                ? anteriores.filter((id) => id !== clienteId)
                : [...anteriores, clienteId],
        );
    }
    function adicionarConversa(clienteId: string, conversa: Conversa) {
        revisao.current++;
        setClientes((anteriores) =>
            anteriores.map((cliente) =>
                cliente.clienteId === clienteId
                    ? {
                        ...cliente,
                        conversas: [
                            ...cliente.conversas.filter((c) => c.tipo === "geral"),
                            conversa,
                            ...cliente.conversas.filter((c) => c.tipo !== "geral" && c.id !== conversa.id),
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
        setProjetoCriacao(null);
        atualizarConversas();
    }
    function atualizarTitulo(conversaId: string, titulo: string) {
        revisao.current++;
        setClientes((anteriores) =>
            anteriores.map((cliente) => ({
                ...cliente,
                conversas: cliente.conversas.map((conversa) =>
                    conversa.id === conversaId ? { ...conversa, titulo } : conversa,
                ),
            })),
        );

        setConversaEdicao(null);
        atualizarConversas();
    }

    function atualizarEstado(id: string, arquivadaEm: string | null) {
        revisao.current++;
        setClientes(anteriores => anteriores.map(cliente => ({
            ...cliente,
            conversas: cliente.conversas.map(conversa =>
                conversa.id === id ? {...conversa, arquivadaEm, reabertura: null} : conversa
            ),
        })));
        atualizarConversas();
    }

    function atualizarPedido(id: string, pedido: PedidoReabertura, restaurada: boolean) {
        revisao.current++;
        setClientes(anteriores => anteriores.map(cliente => ({...cliente, conversas: cliente.conversas.map(c => c.id === id ? {...c, reabertura: restaurada ? null : pedido, arquivadaEm: restaurada ? null : c.arquivadaEm} : c)})));
        atualizarConversas();
    }

    function concluirArquivamento(id: string, arquivadaEm: string | null) {
        atualizarEstado(id, arquivadaEm);
        setConversaArquivo(null);
    }

    function alternarVisualizacao(valor: string) {
        const mostrarArquivadas = valor === "arquivadas";

        if (mostrarArquivadas === arquivadas) return;

        setAbaArquivadas(mostrarArquivadas);
        setConversaId(null);
    }

    return (
        <Stack gap="md" className={classes.chatPagina}>
            <Group justify="space-between"><Title order={2}>Central de mensagens</Title>{voltarPara && <Button variant="subtle" size="xs" onClick={() => navigate(voltarPara, {state: origemAnterior ?? (voltarPara.startsWith("/projetos/") ? {voltarPara: origemProjeto} : undefined)})}>← Voltar à origem</Button>}</Group>
            {!carregando && !erro && escolha === undefined && clienteAlvo && !conversaAtalho && <Alert color="gray" title={projetoAlvo ? "Conversa do projeto" : "Conversa Geral"}>{clienteAtalho && projetoAlvo ? <Stack gap="xs"><Text size="sm">Este projeto ainda não possui uma conversa.</Text>{location.state?.projetoArquivado ? <Text size="sm">Restaure o projeto para criar uma conversa.</Text> : <Button size="xs" onClick={() => {setProjetoCriacao(projetoAlvo); setClienteCriacao(clienteAtalho);}}>Criar conversa do projeto</Button>}</Stack> : "Não foi possível localizar a conversa solicitada."}</Alert>}
            {pedidosPendentes > 0 && <Alert color="yellow"><Group justify="space-between" gap="xs"><Text size="sm">{pedidosPendentes} pedido(s) de reabertura pendente(s).</Text>{!arquivadas && <Button variant="light" color="yellow" size="compact-xs" onClick={() => alternarVisualizacao("arquivadas")}>Ver pedidos</Button>}</Group></Alert>}
            {erro && <Alert color="red">{erro}</Alert>}
            {clienteCriacao && (
                <NovaConversa
                    key={clienteCriacao.clienteId}
                    cliente={clienteCriacao}
                    projetoInicial={projetoCriacao}
                    onClose={() => {setClienteCriacao(null); setProjetoCriacao(null);}}
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
                    onConcluido={arquivadaEm => concluirArquivamento(conversaArquivo.conversa.id, arquivadaEm)}
                />
            )}

            <div className={classes.chatGrid}>
                <div className={classes.chatColuna}>
                    <Card withBorder padding="sm" className={classes.chatCard}>
                        <Stack gap="sm" className={classes.chatPilha}>
                            <SegmentedControl
                                fullWidth
                                size="sm"
                                value={arquivadas ? "arquivadas" : "ativas"}
                                onChange={alternarVisualizacao}
                                data={[
                                    { label: naoLidasAtivas ? `Ativas (${naoLidasAtivas})` : "Ativas", value: "ativas" },
                                    { label: naoLidasArquivadas ? `Arquivadas (${naoLidasArquivadas})` : "Arquivadas", value: "arquivadas" },
                                ]}
                            />

                            <TextInput
                                placeholder="Buscar cliente..."
                                value={busca}
                                onChange={(evento) => setBusca(evento.currentTarget.value)}
                            />

                            <Divider />

                            <ScrollArea className={classes.chatLista} offsetScrollbars>
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
                                                    label={<Group justify="space-between" wrap="nowrap" gap={4}><Text className={classes.chatTitulo} size="sm" fw={totalNaoLidas(cliente.conversas) ? 700 : 400}>{cliente.clienteNome}</Text>{totalNaoLidas(cliente.conversas) > 0 && <Badge color="red" size="sm">{totalNaoLidas(cliente.conversas)}</Badge>}</Group>}
                                                    description={`${cliente.conversas.length} conversa(s)${cliente.conversas.some(c => c.reabertura?.status === "pendente") ? ` · ${cliente.conversas.filter(c => c.reabertura?.status === "pendente").length} pedido(s)` : ""}`}
                                                    opened={expandidos.includes(cliente.clienteId) || (escolha === undefined && !!conversaAlvo && cliente.clienteId === clienteAtalho?.clienteId)}
                                                    onChange={() => alternarCliente(cliente.clienteId)}
                                                    childrenOffset={16}
                                                >
                                                    {cliente.conversas.map((conversa) => (
                                                        <NavLink
                                                            key={conversa.id}
                                                            label={<Group justify="space-between" wrap="nowrap" gap={4}><Text className={classes.chatTitulo} size="sm" fw={conversa.naoLidas ? 700 : 400}>{conversa.titulo}</Text>{!!conversa.naoLidas && <Badge color="red" size="sm">{conversa.naoLidas}</Badge>}</Group>}
                                                            description={conversa.reabertura?.status === "pendente" ? "Reabertura solicitada" : undefined}
                                                            active={conversaId === conversa.id}
                                                            onClick={() => {setConversaId(conversa.id); setExpandidos(anteriores => anteriores.includes(cliente.clienteId) ? anteriores : [...anteriores, cliente.clienteId]);}}
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
                                                    onClick={() => {setProjetoCriacao(null); setClienteCriacao(clientes.find(c => c.clienteId === cliente.clienteId) ?? cliente);}}
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
                </div>

                <div className={classes.chatColuna}>
                    <Card withBorder padding="md" className={classes.chatCard}>
                        {clienteSelecionado && conversaSelecionada ? (
                            <Stack gap="sm" className={classes.chatPilha}>
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

                                        {conversaSelecionada.arquivadaEm && <Badge color="gray">Arquivada</Badge>}
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
                                    projetoId={conversaSelecionada.projetoId}
                                    arquivada={!!conversaSelecionada.arquivadaEm}
                                    onAtualizarConversas={atualizarConversas}
                                    acoesArquivada={conversaSelecionada.arquivadaEm && <ReaberturaConversa key={conversaSelecionada.id} conversaId={conversaSelecionada.id} pedido={conversaSelecionada.reabertura} lado="admin" onAlterado={(pedido, restaurada) => atualizarPedido(conversaSelecionada.id, pedido, restaurada)} onAtualizar={atualizarConversas}/>}
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

function NovaConversa({
    cliente,
    projetoInicial = null,
    onClose,
    onCriada,
}: {
    cliente: ClienteConversas;
    projetoInicial?: string | null;
    onClose: () => void;
    onCriada: (conversa: Conversa) => void;
}) {
    const [tipo, setTipo] = useState<"avulsa" | "projeto">(projetoInicial ? "projeto" : "avulsa");
    const [titulo, setTitulo] = useState("");
    const [projetoId, setProjetoId] = useState<string | null>(projetoInicial);

    const [projetos, setProjetos] = useState<Projeto[] | null>(null);
    const [erroProjetos, setErroProjetos] = useState<string | null>(null);

    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const projetosDisponiveis = (projetos ?? []).filter(
        (projeto) =>
            projeto.clienteId === cliente.clienteId &&
            !cliente.conversas.some((conversa) => conversa.projetoId === projeto.id),
    );

    const projetoValido = projetosDisponiveis.some(p => p.id === projetoId);

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
        if (tipo === "projeto" && !projetoValido) return;

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
                        disabled={tipo === "avulsa" ? !titulo.trim() : !projetoValido}
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
    onConcluido: (arquivadaEm: string | null) => void;
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

            const dados = await resposta.json();
            onConcluido(dados.arquivadaEm);
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
