import { IconeModerno } from "../components/AcabamentoModerno";
import { Carregamento } from "../components/Carregamento";
import { PendenciasDashboard } from "../components/PendenciasDashboard";
import { FinanceiroDashboard } from "../components/FinanceiroDashboard";
import { IndicadorDashboard } from "../components/IndicadorDashboard";
import { BentoDashboard } from "../components/BentoDashboard";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Dashboard.module.css";
import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";

type ResumoDashboard = {totalClientes: number; projetosEmAndamento: number; solicitacoesPendentes: number; projetosConcluidos: number};

export function Dashboard({mensagensNaoLidas = null}: {mensagensNaoLidas?: number | null}) {
    const navigate = useNavigate();
    const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [repeticao,setRepeticao] = useState(0);
    const [atualizando,setAtualizando] = useState(false);
    const repetir = useRef(false);
    const carregar = useCallback(async (signal: AbortSignal) => {
        setAtualizando(true);
        try {
            const resposta = await fetch("/api/dashboard", {signal, cache:"no-store"});
            if (!resposta.ok) throw new Error("Não foi possível carregar os indicadores");
            const dados: ResumoDashboard = await resposta.json();
            if (!signal.aborted) {setResumo(dados); setErro(null); if (repetir.current) {repetir.current=false;setRepeticao(v=>v+1);}}
        } catch {
            if (!signal.aborted) {setErro("Não foi possível atualizar os indicadores.");repetir.current=false;}
        } finally {if (!signal.aborted) setAtualizando(false);}
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
                <Group justify="space-between" wrap="wrap"><Title order={3}>Acompanhamento geral</Title><Button size="xs" variant="subtle" className="funilador-atualizar" loading={atualizando} leftSection={<IconeModerno nome="atualizar"/>} onClick={()=>{repetir.current=true;atualizar();}}>Atualizar</Button></Group>
                {erro && <Alert color="red">{erro}{resumo && " Exibindo a última consulta."}</Alert>}
                {!resumo && !erro ? <Carregamento tipo="indicadores" texto="Carregando indicadores..."/> : <BentoDashboard className={classes.grade}>
                    <IndicadorDashboard repeticao={repeticao} titulo="Projetos em andamento" valor={resumo?.projetosEmAndamento ?? null} icone="projetos" abrir={() => navigate("/projetos?status=em_andamento")}/>
                    <IndicadorDashboard repeticao={repeticao} titulo="Solicitações pendentes" valor={resumo?.solicitacoesPendentes ?? null} icone="solicitacoes" abrir={() => navigate("/solicitacoes?status=pendente")}/>
                    <IndicadorDashboard repeticao={repeticao} titulo="Mensagens não lidas" valor={mensagensNaoLidas} icone="mensagens" cor={mensagensNaoLidas ? "red" : undefined} abrir={() => navigate("/mensagens")}/>
                    <IndicadorDashboard repeticao={repeticao} titulo="Clientes cadastrados" valor={resumo?.totalClientes ?? null} icone="clientes" abrir={() => navigate("/clientes")}/>
                    <IndicadorDashboard repeticao={repeticao} titulo="Projetos concluídos" valor={resumo?.projetosConcluidos ?? null} icone="projetos" abrir={() => navigate("/projetos?status=concluido")}/>
                </BentoDashboard>}
            </Stack>
        </PendenciasDashboard>
    </Stack>;
}
