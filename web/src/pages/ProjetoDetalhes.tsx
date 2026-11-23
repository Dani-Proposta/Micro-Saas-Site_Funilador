
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title, } from "@mantine/core";

type Projeto = {
    id: string;
    clienteId: string;
    clienteNome: string;
    solicitacaoId: string | null;
    titulo: string;
    descricao: string;
    status: "planejado" | "em_andamento" | "concluido" | "cancelado";
    criadaEm: string;
    atualizadaEm: string;
    arquivadaEm: string | null;
};

const nomesStatus: Record<Projeto["status"], string> = {
    planejado: "Planejado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
};

const coresStatus: Record<Projeto["status"], string> = {
    planejado: "violet",
    em_andamento: "blue",
    concluido: "green",
    cancelado: "red",
};

export function ProjetoDetalhes() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [projeto, setProjeto] = useState<Projeto | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarProjeto() {
            setCarregando(true);
            setErro(null);

            try {
                if (!id) {
                    throw new Error("ID do projeto não informado");
                }

                const resposta = await fetch(`/api/projetos/${id}`, { signal: controller.signal, });

                if (!resposta.ok) {
                    throw new Error("não foi possível buscar o projeto");
                }

                const dados: Projeto = await resposta.json();
                setProjeto(dados);
            } catch (erroRecebido) {
                if (!controller.signal.aborted) {
                    console.error(erroRecebido);
                    setErro("não foi possível carregar o projeto");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setCarregando(false);
                }
            }
        }

        void carregarProjeto();

        return () => controller.abort();
    }, [id]);

    if (carregando) {
        return <Loader size="sm" />;
    }

    if (erro || !projeto) {
        return (
            <Stack>
                <Alert color="red">
                    {erro ?? "Projeto não encontrado"}
                </Alert>
                <Button variant="light" onClick={() => navigate("/projetos")}>
                    Voltar aos projetos
                </Button>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="start">
                <Stack gap="xs" style={{ minWidth: 0 }}>
                    <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => navigate("/projetos")}
                    >
                        ← Voltar aos projetos
                    </Button>

                    <Title order={2} style={{ overflowWrap: "anywhere" }}>
                        {projeto.titulo}
                    </Title>
                </Stack>

                <Group gap="xs">
                    {projeto.arquivadaEm && (
                        <Badge color="gray">Arquivado</Badge>
                    )}

                    <Badge color={coresStatus[projeto.status]}>
                        {nomesStatus[projeto.status]}
                    </Badge>
                </Group>
            </Group>

            <Card withBorder padding="lg">
                <Stack gap="md">
                    <Title order={4}>Informações gerais</Title>

                    <Group justify="space-between">
                        <Text c="dimmed">Cliente</Text>

                        <Button
                            variant="subtle"
                            size="sm"
                            onClick={() =>
                                navigate(`/clientes/${projeto.clienteId}`)
                            }
                        >
                            {projeto.clienteNome}
                        </Button>
                    </Group>

                    <Group justify="space-between">
                        <Text c="dimmed">Criado em</Text>
                        <Text>
                            {new Date(projeto.criadaEm).toLocaleDateString("pt-BR")}
                        </Text>
                    </Group>

                    <Group justify="space-between">
                        <Text c="dimmed">Última atualização</Text>
                        <Text>
                            {new Date(projeto.atualizadaEm).toLocaleDateString("pt-BR")}
                        </Text>
                    </Group>

                    <Group justify="space-between">
                        <Text c="dimmed">Origem</Text>
                        <Text size="sm">
                            {projeto.solicitacaoId
                                ? "Solicitação aprovada"
                                : "Cadastro manual"}
                        </Text>
                    </Group>
                </Stack>
            </Card>

            <Card withBorder padding="lg">
                <Stack gap="sm">
                    <Title order={4}>Descrição e escopo</Title>

                    <Text
                        style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                        }}
                    >
                        {projeto.descricao}
                    </Text>
                </Stack>
            </Card>
        </Stack>
    );
}
