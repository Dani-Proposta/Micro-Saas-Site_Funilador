import classes from "../styles/Trabalho.module.css";
import { correspondeBusca, FiltrosTrabalho } from "../components/FiltrosTrabalho";
import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
import { formatarValor, formatarPrazo } from "../lib/comercial";
import { DetalhesSolicitacao } from "../components/DetalhesSolicitacao";
import { statusSolicitacao } from "../lib/solicitacoes";
import type { SolicitacaoDetalhada } from "../lib/solicitacoes";

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { comStatus, filtroStatus, statusSolicitacoes } from "../lib/navegacaoContextual";
import { Alert, Badge, Button, Card, Group, Modal, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";

type Solicitacao = SolicitacaoDetalhada;

export function MinhasSolicitacoes() {

    const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
    const [params, setParams] = useSearchParams();
    const status = filtroStatus(params, statusSolicitacoes);
    const alvoNotificacao = params.get("solicitacao");
    const eventoNotificacao = params.get("notificacao");
    const [busca, setBusca] = useState("");
    const solicitacoesVisiveis = solicitacoes.filter(s => alvoNotificacao ? s.id === alvoNotificacao : (status === "todos" || s.status === status) && correspondeBusca(busca, s.titulo, s.descricao, s.clienteNome));
    function limparAtalho() {
        const proximo = new URLSearchParams(params);
        proximo.delete("solicitacao");
        proximo.delete("notificacao");
        setParams(proximo);
    }
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [modalAberto, setModalAberto] = useState(false);
    const [detalhesId, setDetalhesId] = useState<string | null>(null);
    const navigate = useNavigate();
    const detalhes = solicitacoes.find(s => s.id === detalhesId);
    const [titulo, setTitulo] = useState("");
    const [descricao, setDescricao] = useState("");
    const [orcamentoEsperado, setOrcamentoEsperado] = useState("");
    const [prazoEsperado, setPrazoEsperado] = useState("");

    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarSolicitacoes() {
            try {
                const resposta = await fetch("/api/me/solicitacoes", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao carregar solicitações.");

                if (!controller.signal.aborted) setSolicitacoes(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar solicitações.");
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarSolicitacoes();
        return () => controller.abort();
    }, [eventoNotificacao]);

    function fecharModal() {
        if (enviando) return;

        setModalAberto(false);
        setTitulo("");
        setDescricao(""); setOrcamentoEsperado(""); setPrazoEsperado("");
        setErroEnvio(null);
    }

    async function criarSolicitacao() {
        if (enviando) return;

        if (!titulo.trim() || !descricao.trim()) {
            setErroEnvio("Preencha o título e a descrição.");
            return;
        }

        setEnviando(true);
        setErroEnvio(null);

        try {
            const resposta = await fetch("/api/me/solicitacoes", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({titulo, descricao, orcamentoEsperado, prazoEsperado}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível criar a solicitação.");

            setSolicitacoes((anteriores) => [dados, ...anteriores]);
            setModalAberto(false);
            setTitulo("");
            setDescricao(""); setOrcamentoEsperado(""); setPrazoEsperado("");
            setErroEnvio(null);
            setBusca("");
            const proximo = comStatus(params, "todos");
            proximo.delete("solicitacao");
            proximo.delete("notificacao");
            setParams(proximo);

        } catch (erroRecebido) {
            setErroEnvio(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao enviar solicitação.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Stack gap="md" className={classes.pagina}>

            <Group justify="space-between">
                <Title order={1} className={estrutura.heading}>Minhas solicitações</Title>
                <Button size="xs" disabled={carregando || !!erro} onClick={() => setModalAberto(true)}>+ Nova solicitação</Button>
            </Group>

            <Text size="sm" c="dimmed">Envie novas solicitações e acompanhe suas respostas.</Text>

            {detalhes && <DetalhesSolicitacao key={detalhes.id} solicitacao={detalhes} onClose={() => setDetalhesId(null)} acoes={detalhes.projetoId && <Button size="xs" variant="light" onClick={() => navigate(`/portal/projetos?projeto=${detalhes.projetoId}`)}>Ver projeto</Button>}/>}
            <Modal opened={modalAberto} onClose={fecharModal} title="Nova solicitação" centered closeOnEscape={!enviando} closeOnClickOutside={!enviando} withCloseButton={!enviando}>
                <Stack gap="md">
                    <TextInput label="Título" placeholder="Sobre o que é sua solicitação?" value={titulo} onChange={(evento) => setTitulo(evento.currentTarget.value)} maxLength={150} disabled={enviando} required/>
                    <Textarea label="Descrição" placeholder="Descreva o que você precisa..." value={descricao} onChange={(evento) => setDescricao(evento.currentTarget.value)} minRows={5} maxLength={5000} disabled={enviando} required/>

                    <div className={classes.campos}>
                    <TextInput label="Orçamento esperado (R$)" placeholder="Ex.: 1500,00" inputMode="decimal" value={orcamentoEsperado} onChange={evento => setOrcamentoEsperado(evento.currentTarget.value)} maxLength={13} disabled={enviando}/>
                    <TextInput label="Prazo esperado" type="date" value={prazoEsperado} onChange={evento => setPrazoEsperado(evento.currentTarget.value)} disabled={enviando}/>
                    </div>

                    {erroEnvio && <Alert color="red">{erroEnvio}</Alert>}

                    <Button loading={enviando} onClick={() => void criarSolicitacao()}>Enviar solicitação</Button>
                </Stack>
            </Modal>

            <FiltrosTrabalho busca={busca} onBusca={setBusca} total={solicitacoes.length} visiveis={solicitacoesVisiveis.length} carregando={carregando || !!erro} foco={!!alvoNotificacao}>
            <Select label="Status" value={status} allowDeselect={false} data={[{value: "todos", label: "Todos os status"}, ...statusSolicitacoes]} onChange={valor => {const proximo = comStatus(params, valor); proximo.delete("solicitacao"); proximo.delete("notificacao"); setParams(proximo);}}/>
            </FiltrosTrabalho>
            {alvoNotificacao && <Group gap="xs"><Text size="sm" c="dimmed">Exibindo registro da notificação.</Text><Button size="compact-xs" variant="subtle" onClick={limparAtalho}>Mostrar todos</Button></Group>}
            {carregando && <Carregamento/>}
            {erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && solicitacoesVisiveis.length === 0 && <Text c="dimmed">Nenhuma solicitação encontrada neste filtro.</Text>}

            {!carregando && !erro && <div className={classes.grade}>
                {solicitacoesVisiveis.map(solicitacao=><Card key={solicitacao.id} withBorder padding="sm" className={classes.card}>
                    <div className={classes.cardTopo}>
                        <Stack gap={4} className={classes.minimo}>
                            <Text fw={650} className={classes.quebra}>{solicitacao.titulo}</Text>
                            
                        </Stack>
                        <Badge variant="light" color={statusSolicitacao[solicitacao.status].color}>{statusSolicitacao[solicitacao.status].label}</Badge>
                    </div>
                    <Text size="sm" c="dimmed" lineClamp={2} className={classes.quebra}>{solicitacao.descricao}</Text>
                    <div className={classes.dados}><div><Text size="xs" c="dimmed">Orçamento esperado</Text><Text size="sm" fw={500}>{formatarValor(solicitacao.orcamentoEsperado)}</Text></div><div><Text size="xs" c="dimmed">Prazo esperado</Text><Text size="sm" fw={500}>{formatarPrazo(solicitacao.prazoEsperado)}</Text></div></div>
                    <Text size="xs" c="dimmed">Enviada em {new Date(solicitacao.criadaEm).toLocaleDateString("pt-BR")}</Text>
                    <div className={classes.cardAcoes}><Button size="xs" variant="subtle" onClick={()=>setDetalhesId(solicitacao.id)}>Ver detalhes</Button>{solicitacao.projetoId && <Button size="xs" variant="light" onClick={()=>navigate(`/portal/projetos?projeto=${solicitacao.projetoId}`)}>Ver projeto</Button>}</div>
                </Card>)}
            </div>}

        </Stack>
    );
}
