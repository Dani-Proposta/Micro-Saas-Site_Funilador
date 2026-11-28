import { TransicaoConteudo, NumeroModerno } from "../components/InteracaoModerna";
import { CabecalhoModerno, CartaoRegistro, IconeModerno } from "../components/AcabamentoModerno";
import { toast } from "../lib/toasts";
import { CampoData } from "../components/CampoData";
import classes from "../styles/Trabalho.module.css";
import { FiltrosTrabalho } from "../components/FiltrosTrabalho";
import { correspondeBusca } from "../lib/buscaRegistros";
import { EstadoLista } from "../components/EstadoLista";
import { ordenarRegistros, type OrdemRegistros } from "../lib/ordenacaoRegistros";
import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
import { formatarPrazo } from "../lib/comercial";
import { SeletorCliente } from "../components/SeletorCliente";
import { DetalhesSolicitacao } from "../components/DetalhesSolicitacao";
import { statusSolicitacao } from "../lib/solicitacoes";
import type { SolicitacaoDetalhada, StatusSolicitacao } from "../lib/solicitacoes";
import { useState, useEffect, } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { comStatus, filtroStatus, statusSolicitacoes } from "../lib/navegacaoContextual";
import { Text, Badge, Alert, Stack, TextInput, Textarea, Button, Modal, Group, Title, Select} from "@mantine/core";
import type { SubmitEvent, } from 'react';

type Solicitacao = SolicitacaoDetalhada & {clienteNome: string; clienteId: string};

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
    const [busca, setBusca] = useState("");
    const [ordem, setOrdem] = useState<OrdemRegistros>("padrao");
    const [clienteFiltro, setClienteFiltro] = useState("todos");
    const solicitacoesVisiveis = ordenarRegistros(solicitacoes.filter(s => alvoNotificacao ? s.id === alvoNotificacao : (status === "todos" || s.status === status) && (clienteFiltro === "todos" || s.clienteId === clienteFiltro) && correspondeBusca(busca, s.titulo, s.descricao, s.clienteNome)), ordem);
    const filtrosAtivos = !!busca.trim() || status !== "todos" || clienteFiltro !== "todos" || ordem !== "padrao";
    function limparFiltros() {
        setBusca(""); setOrdem("padrao"); setClienteFiltro("todos");
        setParams(comStatus(params, "todos"));
    }
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
        toast.mostrar("sucesso", {titulo:"Solicitação criada", mensagem:"A solicitação foi adicionada à lista."});
        setBusca(""); setOrdem("padrao"); setClienteFiltro("todos");
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
            toast.mostrar("sucesso", {titulo:novoStatus === "aprovada" ? "Solicitação aprovada" : novoStatus === "recusada" ? "Solicitação recusada" : "Solicitação reconsiderada", mensagem:"A decisão foi registrada."});
        } catch (erro) {
            setErroDecisao(erro instanceof Error ? erro.message : "Não foi possível alterar a decisão");
        } finally {
            setAtualizandoId(null);
        }
    }

    function acoesSolicitacao(solicitacao: Solicitacao) {
        if (solicitacao.status === "pendente") return <>
            <Button size="xs" color="red" variant="outline" disabled={atualizandoId !== null} onClick={() => void atualizarStatus(solicitacao.id, "recusada")}>Recusar</Button>
            <Button size="xs" className="ex-acao-especial" color="green" disabled={atualizandoId !== null} onClick={() => void atualizarStatus(solicitacao.id, "aprovada")}>Aprovar</Button>
        </>;
        if (solicitacao.status === "recusada") return <Button size="xs" variant="light" disabled={atualizandoId !== null} onClick={() => void atualizarStatus(solicitacao.id, "pendente")}>Reconsiderar</Button>;
        if (solicitacao.projetoId) return <Button size="xs" variant="light" onClick={() => navigate(`/projetos/${solicitacao.projetoId}`, {state: {voltarPara: local.pathname + local.search}})}>Ver projeto</Button>;
        return null;
    }

    //aparencia da pagina
    return(
        <Stack gap="md" className={classes.pagina}>
            <CabecalhoModerno titulo="Solicitações" descricao="Revise pedidos e transforme solicitações em projetos." secao="Área de trabalho" icone="solicitacoes" classeTitulo={estrutura.heading} acoes={<Button size="xs" onClick={() => setModalAberto(true)}> + Nova Solicitação</Button>} original={<Group justify="space-between"><Title order={1} className={estrutura.heading}>Solicitações</Title><Button size="xs" onClick={() => setModalAberto(true)}> + Nova Solicitação</Button></Group>}/>
            <FiltrosTrabalho ordem={ordem} onOrdem={setOrdem} onLimpar={limparFiltros} filtrosAtivos={filtrosAtivos} busca={busca} onBusca={setBusca} total={solicitacoes.length} visiveis={solicitacoesVisiveis.length} carregando={carregando || !!erro} foco={!!alvoNotificacao}>
            <Select label="Status" value={status} allowDeselect={false} data={[{value: "todos", label: "Todos os status"}, ...statusSolicitacoes]} onChange={valor => {const proximo = comStatus(params, valor); proximo.delete("solicitacao"); proximo.delete("notificacao"); setParams(proximo);}}/>
                <Select label="Cliente" searchable value={clienteFiltro} allowDeselect={false} data={[{value:"todos",label:"Todos os clientes"},...clientes.map(c=>({value:c.id,label:c.nome}))]} onChange={v=>setClienteFiltro(v??"todos")}/>
            </FiltrosTrabalho>
            {alvoNotificacao && <Group gap="xs"><Text size="sm" c="dimmed">Exibindo registro da notificação.</Text><Button size="compact-xs" variant="subtle" onClick={limparAtalho}>Mostrar todos</Button></Group>}
            {carregando && <Carregamento/>}
            
            {!carregando && erro && (
                <Alert color="red" title="Erro">{erro}</Alert>
            )}

            {!carregando && !erro && solicitacoesVisiveis.length === 0 && (
                <EstadoLista titulo={filtrosAtivos ? "Nenhum resultado" : "Nenhuma solicitação encontrada"} descricao={filtrosAtivos ? "Tente ajustar a pesquisa ou os filtros." : "Não há solicitações nesta seleção."} acao={!alvoNotificacao && filtrosAtivos ? "Limpar filtros" : undefined} onAcao={limparFiltros}/>
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

                    <TextInput label="Título"
                    placeholder = "Ex.: Desenvolvimento de site"
                    required
                    value={titulo}
                    onChange={(event) => setTitulo(event.currentTarget.value)}></TextInput>
                    
                    <Textarea label="Descrição"
                    placeholder="Descreva a solicitação..."
                    required
                    value={descricao}
                    onChange={(event) => setDescricao(event.currentTarget.value)}></Textarea>

                    <div className="funilador-campos-alinhados">
                    <TextInput label="Orçamento esperado" aria-label="Orçamento esperado (R$)" leftSection={<span className="funilador-moeda" aria-hidden="true">R$</span>} leftSectionWidth={36} leftSectionPointerEvents="none" placeholder="Ex.: 1500,00" inputMode="decimal" value={orcamentoEsperado} onChange={evento => setOrcamentoEsperado(evento.currentTarget.value)} maxLength={13} disabled={enviando}/>
                    <CampoData label="Prazo esperado" value={prazoEsperado} onChange={valor => setPrazoEsperado(valor)} disabled={enviando}/>
                    </div>

                    {erroEnvio && ( <Alert color="red" title="Erro">{erroEnvio}</Alert>)}
                    <Button type="submit" loading={enviando} disabled={cadastroClienteAberto}>Criar Solicitação</Button>
                </Stack>
            </form>
            </Modal>




            {!carregando && !erro && solicitacoesVisiveis.length > 0 && <TransicaoConteudo identidade={solicitacoesVisiveis.map(s=>s.id).join("|")} className={`${classes.grade} funilador-lista-registros`}>
                {solicitacoesVisiveis.map(solicitacao=><CartaoRegistro key={solicitacao.id} className={classes.card} tipo="solicitacoes" estado={solicitacao.status}>
                    <div className={classes.cardTopo}><IconeModerno nome="solicitacoes" tamanho={22}/>
                        <Stack gap={4} className={classes.minimo}>
                            <Text fw={650} className={`${classes.quebra} funilador-registro-titulo`}>{solicitacao.titulo}</Text>
                            <Text size="xs" c="dimmed" className={`${classes.quebra} funilador-registro-cliente`}><IconeModerno nome="pessoa" tamanho={14}/>{solicitacao.clienteNome}</Text>
                        </Stack>
                        <Badge variant="light" color={statusSolicitacao[solicitacao.status].color}>{statusSolicitacao[solicitacao.status].label}</Badge>
                    </div>
                    <Text size="sm" c="dimmed" lineClamp={2} className={`${classes.quebra} funilador-registro-descricao`}>{solicitacao.descricao}</Text>
                    <div className={classes.dados}><div><Text size="xs" c="dimmed">Orçamento esperado</Text><Text size="sm" fw={500}>{<NumeroModerno valor={solicitacao.orcamentoEsperado} moeda/>}</Text></div><div><Text size="xs" c="dimmed">Prazo esperado</Text><Text size="sm" fw={500}>{formatarPrazo(solicitacao.prazoEsperado)}</Text></div></div>
                    <Text size="xs" c="dimmed"><IconeModerno nome="calendario" tamanho={14}/>Enviada em {new Date(solicitacao.criadaEm).toLocaleDateString("pt-BR")}</Text>
                    <div className={classes.cardAcoes}><Button className="funilador-abrir-cartao funilador-acao-compacta" aria-label="Ver detalhes" size="xs" variant="subtle" onClick={()=>{setErroDecisao(null);setDetalhesId(solicitacao.id);}}><span>Ver detalhes</span> <IconeModerno nome="abrir" tamanho={15}/></Button>{acoesSolicitacao(solicitacao)}</div>
                </CartaoRegistro>)}
            </TransicaoConteudo>}
        </Stack>
    );
}
