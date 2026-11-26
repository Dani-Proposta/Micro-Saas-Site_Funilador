import { PendenciasDashboard } from "../components/PendenciasDashboard";
import { FinanceiroDashboard } from "../components/FinanceiroDashboard";
import classes from "../styles/Usabilidade.module.css";
import { Group, Text, Card, SimpleGrid, Stack, Title, UnstyledButton} from "@mantine/core";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";

type ResumoDashboard = {
  totalClientes: number;
  projetosEmAndamento: number;
  solicitacoesPendentes: number;
  projetosConcluidos: number;
};

export function Dashboard({mensagensNaoLidas = null}: {mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    //manter constantes antes do return
    //dados do painel principal
    const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    //painel principal
    useEffect(() => {
        const controller = new AbortController();
        
        async function carregarDashboard() {
            try{
                const resposta = await fetch("/api/dashboard", {signal: controller.signal,});

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
            <PendenciasDashboard lado="admin"/>
            <FinanceiroDashboard esconderAlerta/>
            <Title order={3}>Acompanhamento geral</Title>
            {/*cards gerais*/}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">

                <Card withBorder padding="lg" shadow="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/projetos?status=em_andamento")} style={{textAlign: "left", cursor: "pointer"}}>
                    <Group justify="space-between" mb="sm">
                        <Text c="dimmed" size="sm">Projetos em andamento</Text>
                    </Group>
                    <Text fw={700} size="32px">{resumo?.projetosEmAndamento ?? "—"}</Text>

                </Card>

                <Card withBorder padding="lg" shadow="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/solicitacoes?status=pendente")} style={{textAlign: "left", cursor: "pointer"}}>
                    <Text c="dimmed" size="sm">Solicitações Pendentes</Text>
                    <Text fw={700} size="32px">{resumo?.solicitacoesPendentes ?? "—"}</Text>
                </Card>

                <Card withBorder padding="lg" shadow="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/mensagens")} style={{textAlign: "left", cursor: "pointer"}}>
                    <Text c="dimmed" size="sm">Mensagens não lidas</Text>
                    <Text fw={700} size="32px" c={mensagensNaoLidas ? "red" : undefined}>{mensagensNaoLidas ?? "—"}</Text>
                    <Text size="xs" c="dimmed">Abrir central de mensagens</Text>
                </Card>
            </SimpleGrid>

            <Group gap="md" wrap="wrap">
                <UnstyledButton onClick={() => navigate("/clientes")}><Text size="sm" c="dimmed">Clientes cadastrados: {resumo?.totalClientes ?? "—"}</Text></UnstyledButton>
                <UnstyledButton onClick={() => navigate("/projetos?status=concluido")}><Text size="sm" c="dimmed">Projetos concluídos: {resumo?.projetosConcluidos ?? "—"}</Text></UnstyledButton>
            </Group>
        </Stack>

    );
}