import { Group, Text, Card, SimpleGrid, Badge, Stack, Title} from "@mantine/core";
import { useState, useEffect } from "react";

type ResumoDashboard = {
  totalClientes: number;
  projetosEmAndamento: number;
  solicitacoesPendentes: number;
  projetosConcluidos: number;
};


export function Dashboard() {
    //manter constantes antes do return

    const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        
        async function carregarDashboard() {
            try{
                const resposta = await fetch("/api/dashboard", {
                    signal: controller.signal,
                });

                if(!resposta.ok){
                    throw new Error("erro ao carregar dashboard");
                }

                const dados: ResumoDashboard = await resposta.json();
                setResumo(dados);
            }catch(erroRecebido){
                if(!controller.signal.aborted){
                    console.error(erroRecebido);
                    setErro("não deu para carregar os indicadores");
                }
            }finally{
                if(!controller.signal.aborted){
                    setCarregando(false);
                }
            }
        }

        void carregarDashboard();

        return () => controller.abort();
    },[]);

    //aparencia do dashboard
    return (
        <Stack gap="lg">
            <Stack gap="xs">
                <Title order={1}>Visão geral</Title>
                <Text c="dimmed">Meu espaço de trabalho</Text>
                {carregando && (<Text c="dimmed" size="sm">Carregando indicadores...</Text>)}
                {erro && (<Text c="red" size="sm">{erro}</Text>)}
            </Stack>
            {/*cards gerais*/}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">

                <Card withBorder padding="lg" shadow="sm">
                    <Group justify="space-between" mb="sm">
                        <Text c="dimmed" size="sm">Projetos em andamento</Text>
                    </Group>
                    <Text fw={700} size="32px">{resumo?.projetosEmAndamento ?? "—"}</Text>

                </Card>

                <Card withBorder padding="lg" shadow="sm">
                    <Text c="dimmed" size="sm">Solicitações Pendentes</Text>
                    <Text fw={700} size="32px">{resumo?.solicitacoesPendentes ?? "—"}</Text>
                </Card>

                <Card withBorder padding="lg" shadow="sm">
                    <Text c="dimmed" size="sm">Clientes cadastrados</Text>
                    <Text fw={700} size="32px">{resumo?.totalClientes ?? "—"}</Text>
                </Card>

                <Card withBorder padding="lg" shadow="sm">
                    <Text c="dimmed" size="sm">Projetos concluidos</Text>
                    <Text fw={700} size="32px">{resumo?.projetosConcluidos ?? "—"}</Text>
                </Card>
            </SimpleGrid>

            {/*extras*/}

            <Card withBorder shadow="sm">
                <Group justify="space-between" mb="md">
                    <Text fw={600}>Atividades recentes</Text>
                    
                </Group>

                <Text c="dimmed" size="sm">
                    Nenhuma atividade registrada ainda. As atividades recentes aparecerão aqui.
                </Text>
            </Card>
        </Stack>

    );
}