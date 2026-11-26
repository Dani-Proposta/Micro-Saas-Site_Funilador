import { Group, Text, Card, SimpleGrid, Stack, Title, Badge} from "@mantine/core";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";

type ResumoDashboard = {
  totalClientes: number;
  projetosEmAndamento: number;
  solicitacoesPendentes: number;
  projetosConcluidos: number;
};

type ProjetoRecente = {
  id: string;
  titulo: string;
  clienteNome: string;
  status: "planejado" | "em_andamento" | "concluido" | "cancelado";
};

export function Dashboard({mensagensNaoLidas = null}: {mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    //manter constantes antes do return
    //dados do painel principal
    const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    //dados do painel de projetos recentes
    const [projetosRecentes, setProjetosRecentes] = useState<ProjetoRecente[]>([]);
    const [carregandoProjetos, setCarregandoProjetos] = useState(true);
    const [erroProjetos, setErroProjetos] = useState<string | null>(null);

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
    
    //painel de projetos recentes
    useEffect(() => {
        const controller = new AbortController();

        async function carregarProjetosRecentes(){
            try{
                const resposta = await fetch("/api/projetos", { signal: controller.signal});

                if(!resposta.ok){
                    throw new Error("falha ao carregar projetos recentes");
                }

                const dados : ProjetoRecente[] = await resposta.json();

                setProjetosRecentes(dados.slice(0,4));
            }catch(erro){
                if(!controller.signal.aborted){
                    console.error(erro);
                    setErroProjetos("não foi possivel carregar os ultimos projetos");
                }
            }finally{
                if(!controller.signal.aborted){
                    setCarregandoProjetos(false);
                }
            }
        }

        void carregarProjetosRecentes();

        return () => controller.abort();

    }, []);



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
                <Card withBorder padding="lg" shadow="sm" component="button" type="button" onClick={() => navigate("/mensagens")} style={{textAlign: "left", cursor: "pointer"}}>
                    <Text c="dimmed" size="sm">Mensagens não lidas</Text>
                    <Text fw={700} size="32px" c={mensagensNaoLidas ? "red" : undefined}>{mensagensNaoLidas ?? "—"}</Text>
                    <Text size="xs" c="dimmed">Abrir central de mensagens</Text>
                </Card>
            </SimpleGrid>

            {/*extras*/}

            <Card withBorder shadow="sm">
                <Group justify="space-between" mb="md">
                    <Text fw={600}>Atividades recentes</Text>
                </Group>
                <Stack gap="sm">
                    {carregandoProjetos && (<Text c="dimmed" size="sm">Carregando projetos...</Text>)}
                    {erroProjetos && (<Text c="red" size="sm">{erroProjetos}</Text>)}
                    {!carregandoProjetos && !erroProjetos && projetosRecentes.length === 0 && (<Text c="dimmed" size="sm">nenhum projeto cadastrado ainda.</Text>)}
                    {!carregandoProjetos && !erroProjetos && projetosRecentes.map((projeto) => (
                        <Group key={projeto.id} justify="space-between" wrap="nowrap"> 
                            <Stack gap={2} style={{ minWidth: 0 }}>
                                <Text fw={500} lineClamp={1}>{projeto.titulo}</Text>
                                <Text c="dimmed" size="xs" lineClamp={1}>{projeto.clienteNome}</Text>
                            </Stack>
                        <Badge style={{ flexShrink: 0 }}  color={ projeto.status === "concluido"  ? "green" : projeto.status === "em_andamento" ? "blue" : projeto.status === "cancelado" ? "red" : "violet" }> {projeto.status === "em_andamento" ? "Em andamento" : projeto.status === "concluido" ? "Concluído" : projeto.status === "cancelado" ? "Cancelado" :  "Planejado"}</Badge>
                    </Group>))}
                </Stack>
            </Card>
        </Stack>

    );
}