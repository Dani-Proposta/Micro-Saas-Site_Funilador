
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Loader, Modal, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";

type Convite = {
    id: string;
    token: string | null;
    clienteId: string | null;
    clienteNome: string | null;
    criadoEm: string;
    expiraEm: string;
    usadoEm: string | null;
    revogadoEm: string | null;
    estado: "pendente" | "utilizado" | "revogado" | "expirado";
    clienteAceitouId: string | null;
    clienteAceitouNome: string | null;
    usadoPorEmail: string | null;
};

type Cliente = {
    id: string;
    nome: string;
    usuarioId: string | null;
};

const coresEstado = {
    pendente: "yellow",
    utilizado: "green",
    revogado: "red",
    expirado: "gray",
};

export function Convites() {

    const [convites, setConvites] = useState<Convite[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);

    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [recarregar, setRecarregar] = useState(0);

    const [modalAberto, setModalAberto] = useState(false);
    const [tipo, setTipo] = useState<"livre" | "vinculado">("livre");
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [validadeHoras, setValidadeHoras] = useState("48");

    const [gerando, setGerando] = useState(false);
    const [erroGeracao, setErroGeracao] = useState<string | null>(null);
    const [conviteGerado, setConviteGerado] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);

    const [confirmarRevogacao, setConfirmarRevogacao] = useState<string | null>(null);
    const [revogando, setRevogando] = useState(false);
    const [erroRevogacao, setErroRevogacao] = useState<string | null>(null);

    const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
    const [excluindo, setExcluindo] = useState(false);
    const [erroExclusao, setErroExclusao] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarConvites() {
            setCarregando(true);
            setErro(null);
            try {
                const resposta = await fetch("/api/convites", { signal: controller.signal });
                if (!resposta.ok) throw new Error("Erro ao buscar convites");
                const dados: Convite[] = await resposta.json();
                setConvites(dados);
            } catch (erroRecebido) {
                if (!controller.signal.aborted) {
                    console.error(erroRecebido);
                    setErro("Não foi possível carregar os convites.");
                }
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }
        void carregarConvites();
        return () => controller.abort();
    }, [recarregar]);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarClientes() {
            try {
                const resposta = await fetch("/api/clientes", { signal: controller.signal });
                if (!resposta.ok) throw new Error("Erro ao buscar clientes");
                const dados: Cliente[] = await resposta.json();
                setClientes(dados);
            } catch (erroRecebido) {
                if (!controller.signal.aborted) console.error(erroRecebido);
            }
        }
        void carregarClientes();
        return () => controller.abort();
    }, []);

    function fecharModal() {
        if (gerando) return;

        setModalAberto(false);
        setClienteId(null);
        setTipo("livre");
        setValidadeHoras("48");
        setConviteGerado(null);
        setErroGeracao(null);
        setCopiado(false);
    }

    async function gerarConvite() {
        if (gerando || conviteGerado) return;
        if (tipo === "vinculado" && !clienteId) {
            setErroGeracao("Selecione um cliente.");
            return;
        }

        setGerando(true);
        setErroGeracao(null);

        try {
            const resposta = await fetch("/api/convites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clienteId: tipo === "vinculado" ? clienteId : null,
                    validadeHoras: Number(validadeHoras),
                }),
            });

            if (!resposta.ok) {
                const dadosErro = await resposta.json();
                throw new Error(dadosErro.erro ?? "Erro ao gerar convite");
            }

            const dados: { token: string } = await resposta.json();

            setConviteGerado(`${window.location.origin}/convite/${dados.token}`);
            setRecarregar((anterior) => anterior + 1);

        } catch (erroRecebido) {
            console.error(erroRecebido);
            setErroGeracao(erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível gerar o convite");
        } finally {
            setGerando(false);
        }
    }

    async function copiarConvite() {
        if (!conviteGerado) return;

        try {
            await navigator.clipboard.writeText(conviteGerado);
            setCopiado(true);
        } catch (erro) {
            console.error(erro);
            setErroGeracao("Não foi possível copiar automaticamente. Copie o link manualmente.");
        }
    }

    async function revogarConvite(id: string) {
        if (revogando) return;

        setRevogando(true);
        setErroRevogacao(null);

        try {
            const resposta = await fetch(`/api/convites/${id}/revogar`, { method: "PATCH" });

            if (!resposta.ok) throw new Error("Erro ao revogar convite");

            const dados: { id: string; revogadoEm: string } = await resposta.json();

            setConvites((anteriores) => anteriores.map((convite) =>
                convite.id === dados.id ? { ...convite, estado: "revogado", revogadoEm: dados.revogadoEm } : convite
            ));

            setConfirmarRevogacao(null);

        } catch (erro) {
            console.error(erro);
            setErroRevogacao("Não foi possível revogar o convite");
        } finally {
            setRevogando(false);
        }
    }


    async function excluirConvite(id: string) {
        if (excluindo) return;

        setExcluindo(true);
        setErroExclusao(null);

        try {
            const resposta = await fetch(`/api/convites/${id}`, { method: "DELETE" });
            
            if (!resposta.ok) throw new Error("Erro ao excluir convite");

            setConvites((anteriores) => anteriores.filter((convite) => convite.id !== id));
            setConfirmarExclusao(null);

        } catch (erro) {
            console.error(erro);
            setErroExclusao("Não foi possível excluir o convite.");
        } finally {
            setExcluindo(false);
        }
    }


    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Title order={2}>Convites</Title>
                <Button size="xs" onClick={() => setModalAberto(true)}>+ Novo convite</Button>
            </Group>

            <Text c="dimmed" size="sm">Crie convites de acesso para novos clientes ou clientes já cadastrados.</Text>

            <Modal opened={modalAberto} onClose={fecharModal} title="Novo convite" centered closeOnEscape={!gerando} closeOnClickOutside={!gerando} withCloseButton={!gerando}>
                <Stack gap="md">
                    {!conviteGerado ? (
                        <>
                            <SegmentedControl value={tipo} onChange={(valor) => {if (valor === "livre" || valor === "vinculado") setTipo(valor);}} data={[{value: "livre", label: "Novo cliente"}, {value: "vinculado", label: "Cliente existente"}]}/>
                            {tipo === "vinculado" && (
                            <Select label="Cliente" placeholder="Selecione um cliente" searchable data={clientes.map((cliente) => ({value: cliente.id,label: cliente.usuarioId ? `${cliente.nome} — Já possui acesso` : cliente.nome,disabled: cliente.usuarioId !== null}))} value={clienteId} onChange={setClienteId}/>)}
                            <Select label="Validade" value={validadeHoras} allowDeselect={false} onChange={(valor) => {if (valor) setValidadeHoras(valor);}} data={[{value: "24", label: "24 horas"}, {value: "48", label: "48 horas"}, {value: "168", label: "7 dias"}]}/>
                            {erroGeracao && <Alert color="red">{erroGeracao}</Alert>}
                            <Button loading={gerando} onClick={() => void gerarConvite()}>Gerar convite</Button>
                        </>
                    ) : (
                        <>
                            <Alert color="green">Convite gerado com sucesso! Copie o link antes de fechar.</Alert>
                            <Text size="sm" style={{overflowWrap: "anywhere"}}>{conviteGerado}</Text>
                            {erroGeracao && <Alert color="red">{erroGeracao}</Alert>}
                            <Button onClick={() => void copiarConvite()}>{copiado ? "Copiado" : "Copiar link"}</Button>
                        </>
                    )}
                </Stack>
            </Modal>

            <Modal opened={confirmarRevogacao !== null} onClose={() => {if (!revogando) setConfirmarRevogacao(null);}} title="Revogar convite" centered closeOnEscape={!revogando} closeOnClickOutside={!revogando} withCloseButton={!revogando}>
                <Stack gap="md">
                    <Text size="sm">Deseja revogar este convite? Ele não poderá mais ser utilizado.</Text>
                    {erroRevogacao && <Alert color="red">{erroRevogacao}</Alert>}

                    <Group justify="flex-end">
                        <Button variant="default" disabled={revogando} onClick={() => setConfirmarRevogacao(null)}>Voltar</Button>
                        <Button color="red" loading={revogando} onClick={() => {if (confirmarRevogacao) void revogarConvite(confirmarRevogacao);}}>Confirmar revogação</Button>
                    </Group>
                </Stack>
            </Modal>
                        
            <Modal opened={confirmarExclusao !== null} onClose={() => {if (!excluindo) setConfirmarExclusao(null);}} title="Excluir convite" centered closeOnEscape={!excluindo} closeOnClickOutside={!excluindo} withCloseButton={!excluindo}>
                <Stack gap="md">
                    <Text size="sm">Deseja excluir este convite definitivamente? Essa ação não poderá ser desfeita</Text>
                    <Text size="xs" c="dimmed">O cliente e sua conta de acesso, caso existam, não serão excluídos</Text>
                    {erroExclusao && <Alert color="red">{erroExclusao}</Alert>}

                    <Group justify="flex-end">
                        <Button variant="default" disabled={excluindo} onClick={() => setConfirmarExclusao(null)}>Cancelar</Button>
                        <Button color="red" loading={excluindo} onClick={() => {if (confirmarExclusao) void excluirConvite(confirmarExclusao);}}>Excluir definitivamente</Button>
                    </Group>
                </Stack>
            </Modal>

            {carregando && <Loader size="sm"/>}
            {!carregando && erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && convites.length === 0 && <Text c="dimmed">Nenhum convite encontrado</Text>}

            {!carregando && !erro && convites.map((convite) => (
                <Card key={convite.id} withBorder padding="md">
                    <Stack gap="xs">

                        <Group justify="space-between" align="start">
                            <Stack gap={4} style={{minWidth: 0}}>
                                <Text fw={600}>{convite.clienteAceitouNome ?? convite.clienteNome ?? "Convite livre — novo cliente"}</Text>
                                {convite.usadoEm && <Text size="xs" c="dimmed">Utilizado em: {new Date(convite.usadoEm).toLocaleString("pt-BR")}</Text>}
                                {convite.usadoPorEmail && <Text size="xs" c="dimmed">E-mail utilizado: {convite.usadoPorEmail}</Text>}
                                {convite.revogadoEm && <Text size="xs" c="dimmed">Revogado em: {new Date(convite.revogadoEm).toLocaleString("pt-BR")}</Text>}
                                <Text size="xs" c="dimmed">Criado em: {new Date(convite.criadoEm).toLocaleString("pt-BR")}</Text>
                                <Text size="xs" c="dimmed">Expira em: {new Date(convite.expiraEm).toLocaleString("pt-BR")}</Text>
                            </Stack>
                            <Badge color={coresEstado[convite.estado]}>{convite.estado}</Badge>
                        </Group>


                        <Group justify="flex-end">
                            {convite.estado === "pendente" && (
                                <>
                                    {convite.token && <Button size="xs" variant="light" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/convite/${convite.token}`)}>Copiar link</Button>}
                                    <Button color="red" variant="subtle" size="xs" onClick={() => {setErroRevogacao(null); setConfirmarRevogacao(convite.id);}}>Revogar</Button>
                                </>
                            )}

                            <Button color="red" variant="outline" size="xs" onClick={() => {setErroExclusao(null); setConfirmarExclusao(convite.id);}}>Excluir</Button>
                        </Group>

                        
                    </Stack>
                </Card>
            ))}
        </Stack>
    );
}
