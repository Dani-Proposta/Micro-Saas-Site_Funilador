
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Loader, Modal, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";

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
    }, []);

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

            {carregando && <Loader size="sm"/>}
            {erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && solicitacoes.length === 0 && <Text c="dimmed">Você ainda não possui solicitações.</Text>}

            {!carregando && !erro && solicitacoes.map((solicitacao) => (
                <Card key={solicitacao.id} withBorder padding="md">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={600}>{solicitacao.titulo}</Text>
                            <Badge color={statusSolicitacao[solicitacao.status].color}>{statusSolicitacao[solicitacao.status].label}</Badge>
                        </Group>

                        <Text size="sm" style={{whiteSpace: "pre-wrap"}}>{solicitacao.descricao}</Text>
                        <Text size="xs" c="dimmed">Enviada em: {new Date(solicitacao.criadaEm).toLocaleString("pt-BR")}</Text>
                    </Stack>
                </Card>
            ))}

        </Stack>
    );
}
