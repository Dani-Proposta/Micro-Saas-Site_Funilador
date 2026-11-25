
import { useEffect, useState } from "react";
import { Alert, Badge, Card, Group, Loader, Stack, Text, Title } from "@mantine/core";

type Projeto = {
    id: string;
    titulo: string;
    descricao: string;
    status: "planejado" | "em_andamento" | "concluido" | "cancelado";
    criadaEm: string;
    atualizadaEm: string;
};

const statusProjeto = {
    planejado: {label: "Planejado", color: "violet"},
    em_andamento: {label: "Em andamento", color: "blue"},
    concluido: {label: "Concluído", color: "green"},
    cancelado: {label: "Cancelado", color: "red"},
};

export function MeusProjetos() {

    const [projetos, setProjetos] = useState<Projeto[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarProjetos() {
            try {
                const resposta = await fetch("/api/me/projetos", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível carregar os projetos.");

                if (!controller.signal.aborted) setProjetos(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar projetos.");
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarProjetos();
        return () => controller.abort();
    }, []);

    return (
        <Stack gap="md">

            <Title order={2}>Meus projetos</Title>
            <Text c="dimmed" size="sm">Acompanhe o andamento dos seus projetos.</Text>

            {carregando && <Loader size="sm"/>}
            {erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && projetos.length === 0 && <Text c="dimmed">Você ainda não possui projetos.</Text>}

            {!carregando && !erro && projetos.map((projeto) => (
                <Card key={projeto.id} withBorder padding="md">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={600}>{projeto.titulo}</Text>
                            <Badge color={statusProjeto[projeto.status].color}>{statusProjeto[projeto.status].label}</Badge>
                        </Group>

                        <Text size="sm" style={{whiteSpace: "pre-wrap"}}>{projeto.descricao}</Text>
                        <Text size="xs" c="dimmed">Criado em: {new Date(projeto.criadaEm).toLocaleString("pt-BR")}</Text>
                        <Text size="xs" c="dimmed">Última atualização: {new Date(projeto.atualizadaEm).toLocaleString("pt-BR")}</Text>
                    </Stack>
                </Card>
            ))}

        </Stack>
    );
}
