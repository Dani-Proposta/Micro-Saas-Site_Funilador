
import { useEffect, useState } from "react";
import { Alert, Card, Loader, SimpleGrid, Stack, Text, Title } from "@mantine/core";

type Resumo = {
    projetosPlanejados: number;
    projetosEmAndamento: number;
    projetosConcluidos: number;
    solicitacoesPendentes: number;
};

type Cliente = {
    id: string;
    nome: string;
    email: string | null;
};

export function DashboardCliente({cliente}: {cliente: Cliente}) {

    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const carregando = resumo === null && erro === null;

    useEffect(() => {
        const controller = new AbortController();

        async function carregarResumo() {
            try {
                const resposta = await fetch("/api/me/dashboard", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao carregar dashboard.");

                if (!controller.signal.aborted) setResumo(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar dashboard.");
            }
        }

        void carregarResumo();
        return () => controller.abort();
    }, []);

    return (
        <Stack gap="md">

            <Title order={2}>Olá, {cliente.nome}!</Title>
            <Text c="dimmed">Acompanhe seus projetos e solicitações.</Text>

            <Card withBorder padding="lg">
                <Stack gap="xs">
                    <Title order={4}>Minha conta</Title>
                    <Text size="sm">Nome: {cliente.nome}</Text>
                    <Text size="sm">E-mail: {cliente.email ?? "Não informado"}</Text>
                </Stack>
            </Card>
            
            {carregando && <Loader size="sm"/>}
            {erro && <Alert color="red">{erro}</Alert>}

            {resumo && (
                <SimpleGrid cols={{base: 1, xs: 2, lg: 4}}>

                    <Card withBorder padding="lg">
                        <Text size="sm" c="dimmed">Projetos planejados</Text>
                        <Title order={2} c="violet">{resumo.projetosPlanejados}</Title>
                    </Card>

                    <Card withBorder padding="lg">
                        <Text size="sm" c="dimmed">Em andamento</Text>
                        <Title order={2} c="blue">{resumo.projetosEmAndamento}</Title>
                    </Card>

                    <Card withBorder padding="lg">
                        <Text size="sm" c="dimmed">Projetos concluídos</Text>
                        <Title order={2} c="green">{resumo.projetosConcluidos}</Title>
                    </Card>

                    <Card withBorder padding="lg">
                        <Text size="sm" c="dimmed">Solicitações pendentes</Text>
                        <Title order={2} c="yellow">{resumo.solicitacoesPendentes}</Title>
                    </Card>

                </SimpleGrid>
            )}


        </Stack>
    );
}
