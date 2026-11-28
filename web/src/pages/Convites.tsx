import { apiFetch } from "../lib/api-fetch";
import { ConfirmacaoExpressiva } from "../components/expressivo/EfeitosExpressivos";
import { CabecalhoModerno, IconeModerno } from "../components/AcabamentoModerno";
import { TransicaoConteudo } from "../components/InteracaoModerna";
import { useModerno } from "../hooks/useInteracaoModerna";
import { toast } from "../lib/toasts";
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

    const moderno = useModerno();
    const [filtro,setFiltro] = useState("todos");
    const [ordem,setOrdem] = useState("recentes");
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
                const resposta = await apiFetch("/api/convites", { signal: controller.signal });
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
                const resposta = await apiFetch("/api/clientes", { signal: controller.signal });
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
            const resposta = await apiFetch("/api/convites", {
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
            toast.mostrar("sucesso", {titulo:"Link copiado", mensagem:"O link do convite está na área de transferência."});
        } catch (erro) {
            console.error(erro);
            setErroGeracao("Não foi possível copiar automaticamente. Copie o link manualmente.");
        }
    }

    async function copiarLink(token: string) {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/convite/${token}`);
            toast.mostrar("sucesso", {titulo:"Link copiado", mensagem:"O link do convite está na área de transferência."});
        } catch {
            toast.mostrar("erro", {titulo:"Não foi possível copiar", mensagem:"Tente copiar o link novamente."});
        }
    }

    async function revogarConvite(id: string) {
        if (revogando) return;

        setRevogando(true);
        setErroRevogacao(null);

        try {
            const resposta = await apiFetch(`/api/convites/${id}/revogar`, { method: "PATCH" });

            if (!resposta.ok) throw new Error("Erro ao revogar convite");

            const dados: { id: string; revogadoEm: string } = await resposta.json();

            setConvites((anteriores) => anteriores.map((convite) =>
                convite.id === dados.id ? { ...convite, estado: "revogado", revogadoEm: dados.revogadoEm } : convite
            ));

            setConfirmarRevogacao(null);
            toast.mostrar("sucesso", {titulo:"Convite revogado", mensagem:"O convite não poderá mais ser utilizado."});

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
            const resposta = await apiFetch(`/api/convites/${id}`, { method: "DELETE" });
            
            if (!resposta.ok) throw new Error("Erro ao excluir convite");

            setConvites((anteriores) => anteriores.filter((convite) => convite.id !== id));
            setConfirmarExclusao(null);
            toast.mostrar("sucesso", {titulo:"Convite excluído", mensagem:"O convite foi removido."});

        } catch (erro) {
            console.error(erro);
            setErroExclusao("Não foi possível excluir o convite.");
        } finally {
            setExcluindo(false);
        }
    }


    const visiveis = moderno ? convites.filter(c=>filtro === "todos" || (filtro === "nao_utilizado" ? c.estado !== "utilizado" : c.estado === filtro)).sort((a,b)=>ordem === "recentes" ? b.criadoEm.localeCompare(a.criadoEm) : a.criadoEm.localeCompare(b.criadoEm)) : convites;
    return (
        <Stack gap="md">
            <CabecalhoModerno titulo="Convites" secao="Gestão de acesso" icone="convites" ordem={2} acoes={<Button size="xs" onClick={() => setModalAberto(true)}>+ Novo convite</Button>} original={<Group justify="space-between"><Title order={2}>Convites</Title><Button size="xs" onClick={() => setModalAberto(true)}>+ Novo convite</Button></Group>}/>

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
                        <ConfirmacaoExpressiva loading={revogando} confirmar={() => {if (confirmarRevogacao) void revogarConvite(confirmarRevogacao);}}>Confirmar revogação</ConfirmacaoExpressiva>
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
                        <ConfirmacaoExpressiva loading={excluindo} confirmar={() => {if (confirmarExclusao) void excluirConvite(confirmarExclusao);}}>Excluir definitivamente</ConfirmacaoExpressiva>
                    </Group>
                </Stack>
            </Modal>

            {carregando && <Loader size="sm"/>}
            {!carregando && erro && <Alert color="red">{erro}</Alert>}
            {moderno && <Card withBorder padding="md" className="funilador-filtros-convites"><Group align="end" wrap="wrap"><Select label="Estado" value={filtro} allowDeselect={false} onChange={v=>setFiltro(v ?? "todos")} data={[{value:"todos",label:"Todos"},{value:"pendente",label:"Pendentes válidos"},{value:"utilizado",label:"Utilizados"},{value:"nao_utilizado",label:"Não utilizados"},{value:"expirado",label:"Expirados"},{value:"revogado",label:"Revogados"}]}/><Select label="Ordenação" value={ordem} allowDeselect={false} onChange={v=>setOrdem(v ?? "recentes")} data={[{value:"recentes",label:"Recém-criados primeiro"},{value:"antigos",label:"Mais antigos primeiro"}]}/><Text size="sm" c="dimmed">{visiveis.length} de {convites.length} convites</Text></Group></Card>}
            {!carregando && !erro && visiveis.length === 0 && <Text c="dimmed">Nenhum convite encontrado</Text>}

            {!carregando && !erro && <TransicaoConteudo identidade={visiveis.map(c=>c.id).join("|")} className={moderno ? "funilador-grade-convites" : "funilador-transicao-conteudo"}>{visiveis.map((convite) => (
                <Card key={convite.id} withBorder padding="md" className="funilador-convite-registro" data-ex-estado={convite.estado}>
                    <Stack gap="xs">

                        <Group justify="space-between" align="start" className="funilador-convite-topo"><IconeModerno nome="convites" tamanho={22}/>
                            <Stack gap={4} style={{minWidth: 0}}>
                                <Text fw={600}>{convite.clienteAceitouNome ?? convite.clienteNome ?? "Convite livre — novo cliente"}</Text>
                                {convite.usadoEm && <Text size="xs" c="dimmed">Utilizado em: {new Date(convite.usadoEm).toLocaleString("pt-BR")}</Text>}
                                {convite.usadoPorEmail && <Text size="xs" c="dimmed">E-mail utilizado: {convite.usadoPorEmail}</Text>}
                                {convite.revogadoEm && <Text size="xs" c="dimmed">Revogado em: {new Date(convite.revogadoEm).toLocaleString("pt-BR")}</Text>}
                                <Text size="xs" c="dimmed">Criado em: {new Date(convite.criadoEm).toLocaleString("pt-BR")}</Text>
                                <Text size="xs" c="dimmed">Expira em: {new Date(convite.expiraEm).toLocaleString("pt-BR")}</Text>
                            </Stack>
                            <Badge color={coresEstado[convite.estado]}>{convite.estado.replaceAll("_"," ")}</Badge>
                        </Group>


                        <Group justify="flex-end">
                            {convite.estado === "pendente" && (
                                <>
                                    {convite.token && <Button size="xs" variant="light" onClick={() => {if (convite.token) void copiarLink(convite.token);}}>Copiar link</Button>}
                                    <Button color="red" variant="subtle" size="xs" onClick={() => {setErroRevogacao(null); setConfirmarRevogacao(convite.id);}}>Revogar</Button>
                                </>
                            )}

                            <Button color="red" variant="outline" size="xs" onClick={() => {setErroExclusao(null); setConfirmarExclusao(convite.id);}}>Excluir</Button>
                        </Group>

                        
                    </Stack>
                </Card>
            ))}</TransicaoConteudo>}
        </Stack>
    );
}
