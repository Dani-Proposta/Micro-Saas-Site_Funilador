import { Carregamento } from "../components/Carregamento";
import { PendenciasDashboard } from "../components/PendenciasDashboard";
import { FinanceiroDashboard } from "../components/FinanceiroDashboard";
import { IndicadorDashboard } from "../components/IndicadorDashboard";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Dashboard.module.css";
import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

type ResumoDashboard = {totalClientes: number; projetosEmAndamento: number; solicitacoesPendentes: number; projetosConcluidos: number};

export function Dashboard({mensagensNaoLidas = null}: {mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const carregar = useCallback(async (signal: AbortSignal) => {
        try {
            const resposta = await fetch("/api/dashboard", {signal, cache:"no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar os indicadores");
            const dados: ResumoDashboard = await resposta.json();
            if (!signal.aborted) {setResumo(dados); setErro(null);}
        } catch {
            if (!signal.aborted) setErro("Não foi possível atualizar os indicadores.");
        }
    }, []);
    const atualizar = useAtualizacaoPeriodica(carregar, 30000);
    return <Stack className={`${estrutura.dashboard} ${classes.pagina}`}>
        <Stack gap={4}>
            <Title order={1} className={estrutura.heading}>Visão geral</Title>
            <Text c="dimmed" size="sm">Meu espaço de trabalho</Text>
        </Stack>
        <FinanceiroDashboard esconderAlerta/>
        <PendenciasDashboard lado="admin">
            <Stack gap="xs" mt="sm">
                <Group justify="space-between" wrap="wrap"><Title order={3}>Acompanhamento geral</Title><Button size="xs" variant="subtle" onClick={atualizar}>Atualizar</Button></Group>
                {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
                {!resumo && !erro ? <Carregamento tipo="indicadores" texto="Carregando indicadores..."/> : <div className={classes.grade}>
                    <IndicadorDashboard titulo="Projetos em andamento" valor={resumo?.projetosEmAndamento ?? null} icone="projetos" abrir={() => navigate("/projetos?status=em_andamento")}/>
                    <IndicadorDashboard titulo="Solicitações pendentes" valor={resumo?.solicitacoesPendentes ?? null} icone="solicitacoes" abrir={() => navigate("/solicitacoes?status=pendente")}/>
                    <IndicadorDashboard titulo="Mensagens não lidas" valor={mensagensNaoLidas} icone="mensagens" cor={mensagensNaoLidas ? "red" : undefined} abrir={() => navigate("/mensagens")}/>
                    <IndicadorDashboard titulo="Clientes cadastrados" valor={resumo?.totalClientes ?? null} icone="clientes" abrir={() => navigate("/clientes")}/>
                    <IndicadorDashboard titulo="Projetos concluídos" valor={resumo?.projetosConcluidos ?? null} icone="projetos" abrir={() => navigate("/projetos?status=concluido")}/>
                </div>}
            </Stack>
        </PendenciasDashboard>
    </Stack>;
}
