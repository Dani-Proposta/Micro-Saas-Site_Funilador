import { Carregamento } from "../components/Carregamento";
import { PendenciasDashboard } from "../components/PendenciasDashboard";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Usabilidade.module.css";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Card, SimpleGrid, Stack, Text, Title } from "@mantine/core";

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

export function DashboardCliente({cliente, mensagensNaoLidas = null}: {cliente: Cliente; mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();

    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const [mostrarZerados, setMostrarZerados] = useState(false);
    const outrosZerados = mensagensNaoLidas === 0 || !!resumo && Object.values(resumo).some(v => v === 0);
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
        <Stack gap="lg" className={estrutura.dashboard}>

            <Stack gap={4}><Title order={1} className={estrutura.heading}>Olá, {cliente.nome}!</Title>
            <Text c="dimmed">Acompanhe seus projetos e solicitações.</Text></Stack>

            <PendenciasDashboard lado="cliente" mostrarZerados={mostrarZerados} onMostrarZerados={setMostrarZerados} outrosZerados={outrosZerados}/>

            {carregando && <Carregamento tipo="indicadores" texto="Carregando indicadores..."/>}
            {erro && <Alert color="red">{erro}</Alert>}

            {resumo && (mostrarZerados || Object.values(resumo).some(v => v !== 0) || mensagensNaoLidas !== 0) && (
                <SimpleGrid cols={{base: 1, xs: 2, lg: 4}} spacing="xs">

                    {(mostrarZerados || resumo.projetosPlanejados !== 0) && <Card withBorder padding="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/portal/projetos?status=planejado")} style={{textAlign: "left", cursor: "pointer"}}>
                        <Text size="sm" c="dimmed">Projetos planejados</Text>
                        <Text size="xl" fw={700} c="violet">{resumo.projetosPlanejados}</Text>
                    </Card>}

                    {(mostrarZerados || resumo.projetosEmAndamento !== 0) && <Card withBorder padding="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/portal/projetos?status=em_andamento")} style={{textAlign: "left", cursor: "pointer"}}>
                        <Text size="sm" c="dimmed">Em andamento</Text>
                        <Text size="xl" fw={700} c="blue">{resumo.projetosEmAndamento}</Text>
                    </Card>}

                    {(mostrarZerados || resumo.projetosConcluidos !== 0) && <Card withBorder padding="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/portal/projetos?status=concluido")} style={{textAlign: "left", cursor: "pointer"}}>
                        <Text size="sm" c="dimmed">Projetos concluídos</Text>
                        <Text size="xl" fw={700} c="green">{resumo.projetosConcluidos}</Text>
                    </Card>}

                    {(mostrarZerados || resumo.solicitacoesPendentes !== 0) && <Card withBorder padding="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/portal/solicitacoes?status=pendente")} style={{textAlign: "left", cursor: "pointer"}}>
                        <Text size="sm" c="dimmed">Solicitações pendentes</Text>
                        <Text size="xl" fw={700} c="yellow">{resumo.solicitacoesPendentes}</Text>
                    </Card>}

                    {(mostrarZerados || mensagensNaoLidas !== 0) && <Card withBorder padding="sm" className={classes.interativo} component="button" type="button" onClick={() => navigate("/portal/mensagens")} style={{textAlign: "left", cursor: "pointer"}}>
                        <Text size="sm" c="dimmed">Mensagens não lidas</Text>
                        <Text size="xl" fw={700} c={mensagensNaoLidas ? "red" : undefined}>{mensagensNaoLidas ?? "—"}</Text>
                        <Text size="xs" c="dimmed">Abrir mensagens</Text>
                    </Card>}
                </SimpleGrid>
            )}


            {resumo && !mostrarZerados && !Object.values(resumo).some(v => v > 0) && mensagensNaoLidas === 0 && <Text size="sm" c="dimmed">Nenhum indicador geral com movimentação.</Text>}
        </Stack>
    );
}
