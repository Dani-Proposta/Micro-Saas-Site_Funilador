import { TextoExpansivel } from "../components/TextoExpansivel";

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { comStatus, filtroStatus, statusSolicitacoes } from "../lib/navegacaoContextual";
import { Alert, Badge, Button, Card, Group, Loader, Modal, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";

type Solicitacao = {
    id: string;
    titulo: string;
    descricao: string;
    status: "pendente" | "aprovada" | "recusada";
    criadaEm: string;
};

const statusSolicitacao = {
    pendente: {label: "Pendente", color: "yellow"},
    aprovada: {label: "Aprovada", color: "green"},
    recusada: {label: "Recusada", color: "red"},
};

export function MinhasSolicitacoes() {

    const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
    const [params, setParams] = useSearchParams();
    const status = filtroStatus(params, statusSolicitacoes);
    const alvoNotificacao = params.get("solicitacao");
    const eventoNotificacao = params.get("notificacao");
    const solicitacoesVisiveis = solicitacoes.filter(s => (!alvoNotificacao || s.id === alvoNotificacao) && (status === "todos" || s.status === status));
    function limparAtalho() {
        const proximo = new URLSearchParams(params);
        proximo.delete("solicitacao");
        proximo.delete("notificacao");
        setParams(proximo);
    }
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [modalAberto, setModalAberto] = useState(false);
    const [titulo, setTitulo] = useState("");
    const [descricao, setDescricao] = useState("");

    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarSolicitacoes() {
            try {
                const resposta = await fetch("/api/me/solicitacoes", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao carregar solicitações.");

                if (!controller.signal.aborted) setSolicitacoes(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar solicitações.");
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarSolicitacoes();
        return () => controller.abort();
    }, [eventoNotificacao]);

    function fecharModal() {
        if (enviando) return;

        setModalAberto(false);
        setTitulo("");
        setDescricao("");
        setErroEnvio(null);
    }

    async function criarSolicitacao() {
        if (enviando) return;

        if (!titulo.trim() || !descricao.trim()) {
            setErroEnvio("Preencha o título e a descrição.");
            return;
        }

        setEnviando(true);
        setErroEnvio(null);

        try {
            const resposta = await fetch("/api/me/solicitacoes", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({titulo, descricao}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível criar a solicitação.");

            setSolicitacoes((anteriores) => [dados, ...anteriores]);
            fecharModal();
            const proximo = comStatus(params, "todos");
            proximo.delete("solicitacao");
            proximo.delete("notificacao");
            setParams(proximo);

        } catch (erroRecebido) {
            setErroEnvio(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao enviar solicitação.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Stack gap="md">

            <Group justify="space-between">
                <Title order={2}>Minhas solicitações</Title>
                <Button size="xs" disabled={carregando || !!erro} onClick={() => setModalAberto(true)}>+ Nova solicitação</Button>
            </Group>

            <Text size="sm" c="dimmed">Envie novas solicitações e acompanhe suas respostas.</Text>

            <Modal opened={modalAberto} onClose={fecharModal} title="Nova solicitação" centered closeOnEscape={!enviando} closeOnClickOutside={!enviando} withCloseButton={!enviando}>
                <Stack gap="md">
                    <TextInput label="Título" placeholder="Sobre o que é sua solicitação?" value={titulo} onChange={(evento) => setTitulo(evento.currentTarget.value)} maxLength={150} disabled={enviando} required/>
                    <Textarea label="Descrição" placeholder="Descreva o que você precisa..." value={descricao} onChange={(evento) => setDescricao(evento.currentTarget.value)} minRows={5} maxLength={5000} disabled={enviando} required/>

                    {erroEnvio && <Alert color="red">{erroEnvio}</Alert>}

                    <Button loading={enviando} onClick={() => void criarSolicitacao()}>Enviar solicitação</Button>
                </Stack>
            </Modal>

            <Select label="Status" value={status} allowDeselect={false} data={[{value: "todos", label: "Todos os status"}, ...statusSolicitacoes]} onChange={valor => {const proximo = comStatus(params, valor); proximo.delete("solicitacao"); proximo.delete("notificacao"); setParams(proximo);}}/>
            {alvoNotificacao && <Group gap="xs"><Text size="sm" c="dimmed">Exibindo registro da notificação.</Text><Button size="compact-xs" variant="subtle" onClick={limparAtalho}>Mostrar todos</Button></Group>}
            {carregando && <Loader size="sm"/>}
            {erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && solicitacoesVisiveis.length === 0 && <Text c="dimmed">Nenhuma solicitação encontrada neste filtro.</Text>}

            {!carregando && !erro && solicitacoesVisiveis.map((solicitacao) => (
                <Card key={solicitacao.id} withBorder padding="md">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={600} style={{overflowWrap: "anywhere", minWidth: 0}}>{solicitacao.titulo}</Text>
                            <Badge color={statusSolicitacao[solicitacao.status].color}>{statusSolicitacao[solicitacao.status].label}</Badge>
                        </Group>

                        <TextoExpansivel texto={solicitacao.descricao} linhas={5}/>
                        <Text size="xs" c="dimmed">Enviada em: {new Date(solicitacao.criadaEm).toLocaleString("pt-BR")}</Text>
                    </Stack>
                </Card>
            ))}

        </Stack>
    );
}
