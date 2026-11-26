import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
import { formatarValor, formatarPrazo } from "../lib/comercial";
import { SeletorCliente } from "../components/SeletorCliente";
import { DetalhesSolicitacao } from "../components/DetalhesSolicitacao";
import { statusSolicitacao } from "../lib/solicitacoes";
import type { SolicitacaoDetalhada, StatusSolicitacao } from "../lib/solicitacoes";
import { useState, useEffect, } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { comStatus, filtroStatus, statusSolicitacoes } from "../lib/navegacaoContextual";
import { Card, Text, Badge, Alert, Stack, TextInput, Textarea, Button, Modal, Group, Title, Select} from "@mantine/core";
import type { SubmitEvent, } from 'react';

type Solicitacao = SolicitacaoDetalhada & {clienteNome: string};

type Cliente = {
  id: string;
  nome: string;
  email: string | null;
};

export function Solicitacoes(){
    
    const [modalAberto, setModalAberto] = useState(false);

    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);
    
    
    const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
    const [params, setParams] = useSearchParams();
    const status = filtroStatus(params, statusSolicitacoes);
    const alvoNotificacao = params.get("solicitacao");
    const eventoNotificacao = params.get("notificacao");
    const solicitacoesVisiveis = solicitacoes.filter(s => (!alvoNotificacao || s.id === alvoNotificacao) && (status === "todos" || s.status === status));
    function limparAtalho() {
        const proximo = new URLSearchParams(params);
        proximo.delete("solicitacao");
        proximo.delete("notificacao");
        setParams(proximo);
    }
    
    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    const [orcamentoEsperado, setOrcamentoEsperado] = useState("");
    const [prazoEsperado, setPrazoEsperado] = useState("");
    

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [cadastroClienteAberto, setCadastroClienteAberto] = useState(false);

    const [atualizandoId, setAtualizandoId] = useState<string | null>(null);
    const [detalhesId, setDetalhesId] = useState<string | null>(null);
    const [erroDecisao, setErroDecisao] = useState<string | null>(null);
    const navigate = useNavigate();
    const local = useLocation();
    const detalhes = solicitacoes.find(s => s.id === detalhesId);

    //carregar solicitações
    useEffect(() => {
        const controller = new AbortController();

        async function carregar(){
            
            setCarregando(true);
            setErro(null);

            try{
                const resposta = await fetch(`/api/solicitacoes`, { signal: controller.signal});

                if(!resposta.ok){
                    throw new Error("Falha ao buscar solicitações");
                }
                const dados: Solicitacao[] = await resposta.json();
                setSolicitacoes(dados);

            }catch(erroRecebido){
                if(!controller.signal.aborted){
                    console.error(erroRecebido);
                    setErro("Deu erro para carregar as solicitações")
                }
            }finally{
                if(!controller.signal.aborted){
                    setCarregando(false);
                }
            }
        }
        void carregar();

        return () => controller.abort();
    }, [eventoNotificacao]);

    
    useEffect(() => {
        const controller = new AbortController();

        async function carregarClientes() {
            try{
                const resposta = await fetch(`/api/clientes`,{signal: controller.signal,});

                if(!resposta.ok){
                    throw new Error("falha ao carregar clientes");
                }

                const dados: Cliente[] = await resposta.json();
                setClientes(dados);
            }catch(erro){
                if (!controller.signal.aborted){
                    console.error("erro ao buscar clientes:", erro);
                }
            }
        }
        void carregarClientes();

        return () => controller.abort();
    }, []);



    //criar solicição e mandar pro DB
    async function criarSolicitacao(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (enviando || cadastroClienteAberto) return;
        if (!clienteId) {
            setErroEnvio('Selecione um cliente.');
            return;
        }
        setEnviando(true);
        setErroEnvio(null);
        try{
            const resposta = await fetch(`/api/solicitacoes`, {
                method: "POST",
                headers:{ "Content-Type": "application/json",},
                body: JSON.stringify({
                    clienteId,
                    titulo,
                    descricao,
                    orcamentoEsperado,
                    prazoEsperado,
                }),
            

        });
        if(!resposta.ok){
            const dados = await resposta.json();
            throw new Error(dados.erro ?? "Falha ao criar solicitação");
        }

        const novaSolicitacao: Solicitacao = await resposta.json();
        const clienteSelecionado = clientes.find(
        (cliente) => cliente.id === clienteId
        );

        setSolicitacoes((anteriores) => [{

            ...novaSolicitacao, clienteNome:clienteSelecionado?.nome ?? "Cliente não indentificado"
        },
            ...anteriores,
        ]);
        setClienteId(null);
        setTitulo("");
        setDescricao(""); setOrcamentoEsperado(""); setPrazoEsperado("");
        setModalAberto(false);
        const proximo = comStatus(params, "todos");
            proximo.delete("solicitacao");
            proximo.delete("notificacao");
            setParams(proximo);
    }catch(erro){
        console.error(erro);
        setErroEnvio(erro instanceof Error ? erro.message : "Não deu pra enviar a solicitação");
    }finally{
        setEnviando(false);
    }

    }

    //admin: decidir solicitação
    async function atualizarStatus(id: string, novoStatus: StatusSolicitacao) {
        if (atualizandoId) return;
        setAtualizandoId(id);
        setErroDecisao(null);

        try {
            const resposta = await fetch(`/api/solicitacoes/${id}/status`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({status: novoStatus}),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível alterar a decisão");
            setSolicitacoes(anteriores => anteriores.map(s => s.id === id ? {...s, ...dados} : s));
        } catch (erro) {
            setErroDecisao(erro instanceof Error ? erro.message : "Não foi possível alterar a decisão");
        } finally {
            setAtualizandoId(null);
        }
    }

    function acoesSolicitacao(solicitacao: Solicitacao) {
        if (solicitacao.status === "pendente") return <>
            <Button size="xs" color="red" variant="outline" disabled={atualizandoId !== null} onClick={() => void atualizarStatus(solicitacao.id, "recusada")}>Recusar</Button>
            <Button size="xs" color="green" disabled={atualizandoId !== null} onClick={() => void atualizarStatus(solicitacao.id, "aprovada")}>Aprovar</Button>
        </>;
        if (solicitacao.status === "recusada") return <Button size="xs" variant="light" disabled={atualizandoId !== null} onClick={() => void atualizarStatus(solicitacao.id, "pendente")}>Reconsiderar</Button>;
        if (solicitacao.projetoId) return <Button size="xs" variant="light" onClick={() => navigate(`/projetos/${solicitacao.projetoId}`, {state: {voltarPara: local.pathname + local.search}})}>Ver projeto</Button>;
        return null;
    }

    //aparencia da pagina
    return(
        <div>
            <Group justify="space-between" mb={"md"}>
                <Title order={1} className={estrutura.heading}>Solicitações</Title>
                <Button size="xs" onClick={() => setModalAberto(true)}> + Nova Solicitação</Button>
            </Group>
            <Select label="Status" value={status} allowDeselect={false} data={[{value: "todos", label: "Todos os status"}, ...statusSolicitacoes]} onChange={valor => {const proximo = comStatus(params, valor); proximo.delete("solicitacao"); proximo.delete("notificacao"); setParams(proximo);}}/>
            {alvoNotificacao && <Group gap="xs"><Text size="sm" c="dimmed">Exibindo registro da notificação.</Text><Button size="compact-xs" variant="subtle" onClick={limparAtalho}>Mostrar todos</Button></Group>}
            {carregando && <Carregamento/>}
            
            {!carregando && erro && (
                <Alert color="red" title="Erro">{erro}</Alert>
            )}

            {!carregando && !erro && solicitacoesVisiveis.length === 0 && (
                <Text c="dimmed">Nenhuma solicitação encontrada neste filtro.</Text>
            )}
            {erroDecisao && <Alert color="red">{erroDecisao}</Alert>}
            {detalhes && <DetalhesSolicitacao key={detalhes.id} solicitacao={detalhes} onClose={() => setDetalhesId(null)} ocupado={atualizandoId !== null} acoes={<>{erroDecisao && <Text size="xs" c="red">{erroDecisao}</Text>}{acoesSolicitacao(detalhes)}</>}/>}
            <Modal 
            opened={modalAberto}
            onClose={() => {if (cadastroClienteAberto || enviando) return; setModalAberto(false); setClienteId(null); setTitulo("");setDescricao(""); setOrcamentoEsperado(""); setPrazoEsperado("");setErroEnvio(null);}}
            title= "Nova solicitação"
            centered
            size={"md"} closeOnEscape={!cadastroClienteAberto && !enviando} closeOnClickOutside={!cadastroClienteAberto && !enviando} withCloseButton={!cadastroClienteAberto && !enviando}>

            <form onSubmit={criarSolicitacao}>
                <Stack gap={"sm"}>
                    <SeletorCliente clientes={clientes} value={clienteId} onChange={setClienteId} disabled={enviando} onBloqueio={setCadastroClienteAberto} onCriado={cliente => setClientes(anteriores => [...anteriores.filter(c => c.id !== cliente.id), cliente])}/>

                    <TextInput label="Titulo"
                    placeholder = "Nome da solicitação(Ex: Desenvolvimento de X, Edição de video)"
                    required
                    value={titulo}
                    onChange={(event) => setTitulo(event.currentTarget.value)}></TextInput>
                    
                    <Textarea label="Descrição"
                    placeholder="Escreve mais sobre a solicitação..."
                    required
                    value={descricao}
                    onChange={(event) => setDescricao(event.currentTarget.value)}></Textarea>

                    <TextInput label="Orçamento esperado (R$)" placeholder="Ex.: 1500,00" inputMode="decimal" value={orcamentoEsperado} onChange={evento => setOrcamentoEsperado(evento.currentTarget.value)} maxLength={13} disabled={enviando}/>
                    <TextInput label="Prazo esperado" type="date" value={prazoEsperado} onChange={evento => setPrazoEsperado(evento.currentTarget.value)} disabled={enviando}/>

                    {erroEnvio && ( <Alert color="red" title="Erro">{erroEnvio}</Alert>)}
                    <Button type="submit" loading={enviando} disabled={cadastroClienteAberto}>Criar Solicitação</Button>
                </Stack>
            </form>
            </Modal>




            {!carregando && !erro && solicitacoesVisiveis.map((solicitacao) => (
                <Card key={solicitacao.id} withBorder padding="lg" mt="lg">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={700} lineClamp={2} style={{overflowWrap: "anywhere"}}>{solicitacao.titulo}</Text>
                            <Text size="sm" lineClamp={4} style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{solicitacao.descricao}</Text>
                            <Text size="xs" c="dimmed">Orçamento: {formatarValor(solicitacao.orcamentoEsperado)} · Prazo: {formatarPrazo(solicitacao.prazoEsperado)}</Text>
                        </Stack>

                        <Stack align="flex-end" style={{maxWidth: "40%"}}>
                            <Badge color={statusSolicitacao[solicitacao.status].color}>{statusSolicitacao[solicitacao.status].label}</Badge>
                            <Text size="sm" c="dimmed" ta="right">Cliente: {solicitacao.clienteNome}</Text>
                        </Stack>
                    </Group>
                    <Group justify="space-between" mt="sm" gap="xs">
                        <Button size="xs" variant="subtle" onClick={() => {setErroDecisao(null); setDetalhesId(solicitacao.id);}}>Ver detalhes</Button>
                        <Group gap="xs">{acoesSolicitacao(solicitacao)}</Group>
                    </Group>
                </Card>
            ))}
        </div>
    );
}