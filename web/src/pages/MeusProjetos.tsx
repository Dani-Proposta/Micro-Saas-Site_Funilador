import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
import { MarcosProjeto } from "../components/MarcosProjeto";
import type { ResumoMarcos } from "../components/MarcosProjeto";
import { ResumoProjeto } from "../components/DadosComerciaisProjeto";
import type { DadosProjeto } from "../lib/comercial";
import { TextoExpansivel } from "../components/TextoExpansivel";

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { comStatus, filtroStatus, statusProjetos } from "../lib/navegacaoContextual";
import { Alert, Badge, Button, Card, Group, Select, Stack, Text, Title } from "@mantine/core";

type Projeto = DadosProjeto & {
    id: string;
    titulo: string;
    descricao: string;
    status: "planejado" | "em_andamento" | "concluido" | "cancelado";
    criadaEm: string;
    atualizadaEm: string;
    entregasPendentes: number;
};

const statusProjeto = {
    planejado: {label: "Planejado", color: "violet"},
    em_andamento: {label: "Em andamento", color: "blue"},
    concluido: {label: "Concluído", color: "green"},
    cancelado: {label: "Cancelado", color: "red"},
};

export function MeusProjetos() {

    const [projetos, setProjetos] = useState<Projeto[]>([]);
    const atualizarMarcos = useCallback((dados: ResumoMarcos) => setProjetos(anteriores => anteriores.map(p => p.id === dados.id ? {...p, progresso: dados.progresso, modoProgresso: dados.modoProgresso, atualizadaEm: dados.atualizadaEm, valorAcordado: dados.valorAcordado, prazoAcordado: dados.prazoAcordado, entregasPendentes: p.status === "cancelado" ? 0 : dados.marcos.filter(m => m.status === "aguardando_validacao").length} : p)), []);
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const status = filtroStatus(params, statusProjetos);
    const alvoNotificacao = params.get("projeto");
    const eventoNotificacao = params.get("notificacao");
    const focoValidacao = !!alvoNotificacao && params.get("validar") === "1";
    const focoPagamento = !!alvoNotificacao && !focoValidacao && params.get("pagar") === "1";
    const focoMarco = params.get("marco") ?? undefined;
    const projetosPendentes = projetos.filter(p => p.entregasPendentes > 0 && p.status !== "cancelado");
    function abrirValidacao(id: string) {
        setParams(new URLSearchParams({projeto: id, validar: "1"}));
    }
    function sairValidacao() {
        const proximo = new URLSearchParams(params);
        proximo.delete("validar"); proximo.delete("pagar"); proximo.delete("marco");
        setParams(proximo);
    }
    const projetosVisiveis = projetos.filter(p => (!alvoNotificacao || p.id === alvoNotificacao) && (status === "todos" || p.status === status));
    function limparAtalho() {
        const proximo = new URLSearchParams(params);
        proximo.delete("projeto");
        proximo.delete("notificacao");
        proximo.delete("validar"); proximo.delete("pagar"); proximo.delete("marco");
        setParams(proximo);
    }
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
    }, [eventoNotificacao]);

    return (
        <Stack gap="md">

            <Title order={1} className={estrutura.heading}>Meus projetos</Title>
            <Text c="dimmed" size="sm">Acompanhe o andamento dos seus projetos.</Text>

            {!carregando && !erro && !focoValidacao && !focoPagamento && projetosPendentes.length > 0 && <Card withBorder padding="md"><Stack gap="sm">
                <Group justify="space-between"><Title order={4}>Entregas aguardando validação</Title><Badge color="yellow">{projetosPendentes.reduce((n, p) => n + p.entregasPendentes, 0)}</Badge></Group>
                {projetosPendentes.map(p => <Group key={p.id} justify="space-between" wrap="wrap">
                    <Stack gap={2} style={{minWidth: 0, flex: 1}}><Text fw={500} style={{overflowWrap: "anywhere"}}>{p.titulo}</Text><Text size="xs" c="dimmed">{p.entregasPendentes} {p.entregasPendentes === 1 ? "entrega pendente" : "entregas pendentes"}</Text></Stack>
                    <Button size="xs" variant="light" onClick={() => abrirValidacao(p.id)}>Validar entregas</Button>
                </Group>)}
            </Stack></Card>}
            {!focoValidacao && !focoPagamento && <Select label="Status" value={status} allowDeselect={false} data={[{value: "todos", label: "Todos os status"}, ...statusProjetos]} onChange={valor => {const proximo = comStatus(params, valor); proximo.delete("projeto"); proximo.delete("notificacao"); proximo.delete("validar"); proximo.delete("pagar"); proximo.delete("marco"); setParams(proximo);}}/>}
            {alvoNotificacao && <Group gap="xs"><Text size="sm" c="dimmed">{focoValidacao ? "Entregas para validar" : focoPagamento ? "Pagamentos pendentes" : "Exibindo projeto selecionado."}</Text><Button size="compact-xs" variant="subtle" onClick={limparAtalho}>Mostrar todos</Button></Group>}
            {carregando && <Carregamento/>}
            {erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && projetosVisiveis.length === 0 && <Text c="dimmed">Nenhum projeto encontrado neste filtro.</Text>}

            {!carregando && !erro && projetosVisiveis.map((projeto) => (
                <Card key={projeto.id} withBorder padding="md">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={600} style={{overflowWrap: "anywhere", minWidth: 0}}>{projeto.titulo}</Text>
                            <Badge color={statusProjeto[projeto.status].color}>{statusProjeto[projeto.status].label}</Badge>
                        </Group>

                        {focoValidacao || focoPagamento ? <>
                            <MarcosProjeto key={`${projeto.id}-${focoValidacao ? "validacao" : "pagamento"}-${focoMarco ?? "todos"}-${eventoNotificacao ?? "direto"}`} projeto={projeto} lado="cliente" onAtualizado={atualizarMarcos} focoValidacao={focoValidacao} focoPagamento={focoPagamento} focoMarco={focoMarco}/>
                            <Button size="xs" variant="subtle" onClick={sairValidacao}>Ver todos os dados do projeto</Button>
                        </> : <>
                            {projeto.entregasPendentes > 0 && <Button size="sm" color="yellow" variant="light" onClick={() => abrirValidacao(projeto.id)}>Validar entregas ({projeto.entregasPendentes})</Button>}
                            <TextoExpansivel texto={projeto.descricao} linhas={5}/>
                            <ResumoProjeto projeto={projeto}/>
                            <MarcosProjeto key={projeto.id} projeto={projeto} lado="cliente" onAtualizado={atualizarMarcos}/>
                            <Text size="xs" c="dimmed">Criado em: {new Date(projeto.criadaEm).toLocaleString("pt-BR")}</Text>
                            <Text size="xs" c="dimmed">Última atualização: {new Date(projeto.atualizadaEm).toLocaleString("pt-BR")}</Text>
                        </>}
                        <Group justify="flex-end"><Button size="xs" variant="light" onClick={() => navigate(`/portal/mensagens?projeto=${encodeURIComponent(projeto.id)}`, {state: {voltarPara: location.pathname + location.search}})}>Conversa do projeto</Button></Group>
                    </Stack>
                </Card>
            ))}

        </Stack>
    );
}
