import { Group, Text, Card, SimpleGrid, Badge, Stack, Title, Button } from "@mantine/core";
import { useState } from "react";

export function Dashboard() {
    //manter constantes antes do return
    const [statusApi, setStatusApi] = useState("Não verificado");

    //funções assincronas
    async function verificarAPI(){
        setStatusApi("Verificando...");
        try{
            const resposta = await fetch("/api/health")

            if(!resposta.ok){
                throw new Error("Deu ruim na API");
            }

            const dados = await resposta.json();
            setStatusApi(dados.status);
        } catch{
            setStatusApi("Deu ruim na API no final");
        }
    }

    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Title order={1}>Visão geral</Title>
                <Text c="dimmed">Meu espaço de trabalho</Text>
            </Stack>
            {/*cards gerais*/}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">

                <Card withBorder padding="lg" shadow="sm">
                    <Group justify="space-between" mb="sm">
                        <Text c="dimmed" size="sm">
                            Projetos Ativos
                        </Text>
                        <Badge variant="light">
                            Prévia
                        </Badge>
                    </Group>
                    <Text fw={700} size="32px">
                        0
                    </Text>

                </Card>

                <Card withBorder padding="lg" shadow="sm">
                    <Text c="dimmed" size="sm">
                        Solicitações Pendentes
                    </Text>
                    <Text fw={700} size="32px">
                        0
                    </Text>
                </Card>

            </SimpleGrid>

            {/*extras*/}

            <Card withBorder shadow="sm">
                <Group justify="space-between" mb="md">
                    <Text fw={600}>Atividades recentes</Text>
                    <Badge variant="light"> em preparação</Badge>
                </Group>

                <Text c="dimmed" size="sm">
                    Nenhuma atividade registrada ainda. As atividades recentes aparecerão aqui.
                </Text>
            </Card>

            <Button onClick={verificarAPI}>Verificar API</Button>
            <Text>Resposta da API: {statusApi}</Text>
        </Stack>

    );
}