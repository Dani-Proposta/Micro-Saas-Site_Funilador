import { useExpressivo } from "../lib/contextoAparencia";
import { ProgressoCartaoAdmin } from "../components/expressivo/ProgressoExpressivo";
import { celebrarProjeto } from "../lib/celebrarProjeto";
import { TransicaoConteudo } from "../components/InteracaoModerna";
import { CabecalhoModerno, CartaoRegistro, IconeModerno, SegmentoModerno } from "../components/AcabamentoModerno";
import { toast } from "../lib/toasts";
import classes from "../styles/Trabalho.module.css";
import { FiltrosTrabalho } from "../components/FiltrosTrabalho";
import { correspondeBusca } from "../lib/buscaRegistros";
import { EstadoLista } from "../components/EstadoLista";
import { ordenarRegistros, type OrdemRegistros } from "../lib/ordenacaoRegistros";
import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
import { SeletorCliente } from "../components/SeletorCliente";


import { useNavigate, useSearchParams, useLocation } from "react-router";
import { comStatus, filtroStatus, statusProjetos } from "../lib/navegacaoContextual";
import { useEffect, useState } from "react";
import { Alert, Badge, Group, Stack, Select, Text, Title, Button, Modal, TextInput, Textarea } from "@mantine/core";
import type { SubmitEvent } from "react";

type Projeto = {
    id: string;
    clienteId: string;
    clienteNome: string;
    solicitacaoId: string | null;
    titulo: string;
    descricao: string;
    status: "planejado" | "em_andamento" | "concluido" | "cancelado";
    criadaEm: string;
    atualizadaEm: string;
};

type Cliente = {
    id: string;
    nome: string;
};

type FiltroProjetos = "ativos" | "arquivados";

export function Projetos() {
    const expressivo=useExpressivo();

    const [clientes, setClientes] = useState<Cliente[]>([]);

    const [modalAberto, setModalAberto] = useState(false);
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [cadastroClienteAberto, setCadastroClienteAberto] = useState(false);
    const [titulo, setTitulo] = useState("");
    const [descricao, setDescricao] = useState("");

    const [atualizandoId, setAtualizandoId] = useState<string | null>(null);
    const [erroStatus, setErroStatus] = useState<string | null>(null);

    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);

    const [projetos, setProjetos] = useState<Projeto[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const filtro: FiltroProjetos = params.get("arquivados") === "true" ? "arquivados" : "ativos";
    const status = filtroStatus(params, statusProjetos);
    const [busca, setBusca] = useState("");
    const [ordem, setOrdem] = useState<OrdemRegistros>("padrao");
    const [clienteFiltro, setClienteFiltro] = useState("todos");
    const projetosVisiveis = ordenarRegistros(projetos.filter(p => (status === "todos" || p.status === status) && (clienteFiltro === "todos" || p.clienteId === clienteFiltro) && correspondeBusca(busca, p.titulo, p.descricao, p.clienteNome)), ordem);
    const filtrosAtivos = !!busca.trim() || status !== "todos" || clienteFiltro !== "todos" || ordem !== "padrao";
    function limparFiltros() {
        setBusca(""); setOrdem("padrao"); setClienteFiltro("todos");
        setParams(comStatus(params, "todos"));
    }

    function setFiltro(valor: FiltroProjetos) {
        const proximo = new URLSearchParams(params);
        if (valor === "arquivados") proximo.set("arquivados", "true");
        else proximo.delete("arquivados");
        setParams(proximo);
    }

    const navigate = useNavigate();

    useEffect(() => {
        const controller = new AbortController();

        async function carregarProjetos() {
            setCarregando(true);
            setErro(null);
            setErroStatus(null);

            try {
                const endereco = filtro === "arquivados" ? "/api/projetos?arquivados=true" : "/api/projetos";
                const resposta = await fetch(endereco, { signal: controller.signal });

                if (!resposta.ok) {
                    throw new Error("Falhou pra procurar os projetos");
                }

                const dados: Projeto[] = await resposta.json();
                setProjetos(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) {
                    console.error(erroRecebido);
                    setErro("Não foi possível carregar os projetos");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setCarregando(false);
                }
            }
        }

        void carregarProjetos();

        return () => controller.abort();
    }, [filtro]);

    useEffect(() => {
        async function carregarClientes() {
            try {
                const resposta = await fetch("/api/clientes");

                if (!resposta.ok) {
                    throw new Error("Erro ao buscar os clientes");
                }

                const dados: Cliente[] = await resposta.json();
                setClientes(dados);

            } catch (erro) {
                console.error(erro);
            }
        }

        void carregarClientes();
    }, []);

    async function criarProjeto(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (enviando || cadastroClienteAberto) return;

        if (!clienteId) {
            setErroEnvio("Selecione um cliente");
            return;
        }

        setEnviando(true);
        setErroEnvio(null);

        try {
            const resposta = await fetch("/api/projetos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clienteId, titulo, descricao }),
            });

            if (!resposta.ok) {
                throw new Error("Falha ao criar projeto");
            }

            const novoProjeto: Omit<Projeto, "clienteNome"> = await resposta.json();
            const clienteSelecionado = clientes.find((cliente) => cliente.id === clienteId);

            if (filtro === "ativos") {
                setProjetos((anteriores) => [{
                    ...novoProjeto,
                    clienteNome: clienteSelecionado?.nome ?? "Cliente não identificado",
                }, ...anteriores]);
            }
            // O novo projeto deve ficar visível, mesmo vindo de um filtro.
            setBusca(""); setOrdem("padrao"); setClienteFiltro("todos");
            setParams(new URLSearchParams());

            setClienteId(null);
            setTitulo("");
            setDescricao("");
            setModalAberto(false);
            toast.mostrar("sucesso", {titulo:"Projeto criado", mensagem:"O projeto foi adicionado à lista."});

        } catch (erro) {
            console.error(erro);
            setErroEnvio("Não foi possível criar o projeto");
        } finally {
            setEnviando(false);
        }
    }

    async function alterarStatus(id: string, novoStatus: Projeto["status"]) {
        setAtualizandoId(id);
        setErroStatus(null);

        try {
            const resposta = await fetch(`/api/projetos/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: novoStatus }),
            });

            if (!resposta.ok) {
                throw new Error("Erro ao atualizar status");
            }

            const dados: Pick<Projeto, "id" | "status" | "atualizadaEm"> = await resposta.json();

            setProjetos((anteriores) => anteriores.map((projeto) =>
                projeto.id === dados.id ? { ...projeto, status: dados.status, atualizadaEm: dados.atualizadaEm } : projeto
            ));
            toast.mostrar("sucesso", {titulo:"Status atualizado", mensagem:"O status do projeto foi salvo."});
            if (dados.status === "concluido" && projetos.find(p=>p.id===id)?.status !== "concluido") celebrarProjeto();

        } catch (erro) {
            console.error(erro);
            setErroStatus("Não foi possível atualizar o projeto");
        } finally {
            setAtualizandoId(null);
        }
    }

    return (
        <Stack gap="md" className={classes.pagina}>

            <CabecalhoModerno titulo="Projetos" descricao="Organize e acompanhe o trabalho em andamento." secao="Área de trabalho" icone="projetos" classeTitulo={estrutura.heading} acoes={<Button size="xs" onClick={() => setModalAberto(true)}>+ Novo projeto</Button>} original={<Group justify="space-between"><Title order={1} className={estrutura.heading}>Projetos</Title><Button size="xs" onClick={() => setModalAberto(true)}>+ Novo projeto</Button></Group>}/>

            {erroStatus && <Alert color="red">{erroStatus}</Alert>}

            <FiltrosTrabalho ordem={ordem} onOrdem={setOrdem} onLimpar={limparFiltros} filtrosAtivos={filtrosAtivos} busca={busca} onBusca={setBusca} total={projetos.length} visiveis={projetosVisiveis.length} carregando={carregando || !!erro}>
            <Select label="Status" value={status} allowDeselect={false} data={[{value: "todos", label: "Todos os status"}, ...statusProjetos]} onChange={valor => setParams(comStatus(params, valor))}/>
            <Select label="Cliente" value={clienteFiltro} allowDeselect={false} searchable data={[{value:"todos",label:"Todos os clientes"}, ...clientes.map(c=>({value:c.id,label:c.nome}))]} onChange={v=>setClienteFiltro(v ?? "todos")}/>
            </FiltrosTrabalho>
            <SegmentoModerno value={filtro} onChange={(valor) => { if (valor === "ativos" || valor === "arquivados") setFiltro(valor);}} data={[{ value: "ativos", label: <span className="funilador-segmento-label"><IconeModerno nome="projetos" tamanho={17}/>Ativos</span> },{ value: "arquivados", label: <span className="funilador-segmento-label"><IconeModerno nome="calendario" tamanho={17}/>Arquivados</span> },]}/>
            <Modal opened={modalAberto} onClose={() => {if (cadastroClienteAberto || enviando) return; setModalAberto(false); setClienteId(null); setTitulo(""); setDescricao(""); setErroEnvio(null);}} title="Novo Projeto" centered closeOnEscape={!cadastroClienteAberto && !enviando} closeOnClickOutside={!cadastroClienteAberto && !enviando} withCloseButton={!cadastroClienteAberto && !enviando}>
                <form onSubmit={criarProjeto}>
                    <Stack gap="sm">
                        <SeletorCliente clientes={clientes} value={clienteId} onChange={setClienteId} disabled={enviando} onBloqueio={setCadastroClienteAberto} onCriado={cliente => setClientes(anteriores => [...anteriores.filter(c => c.id !== cliente.id), cliente])}/>
                        <TextInput label="Título" required value={titulo} onChange={(event) => setTitulo(event.currentTarget.value)}/>
                        <Textarea label="Descrição" required minRows={3} value={descricao} onChange={(event) => setDescricao(event.currentTarget.value)}/>
                        {erroEnvio && <Alert color="red">{erroEnvio}</Alert>}
                        <Button type="submit" loading={enviando} disabled={cadastroClienteAberto}>Criar projeto</Button>
                    </Stack>
                </form>
            </Modal>

            {carregando && <Carregamento/>}
            {!carregando && erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && projetosVisiveis.length === 0 && (<EstadoLista titulo={filtrosAtivos ? "Nenhum resultado" : "Nenhum projeto encontrado"} descricao={filtrosAtivos ? "Tente ajustar a pesquisa ou os filtros." : "Não há projetos nesta seleção."} acao={filtrosAtivos ? "Limpar filtros" : undefined} onAcao={limparFiltros}/>)}
            {!carregando && !erro && projetosVisiveis.length > 0 && <TransicaoConteudo identidade={`${filtro}-${projetosVisiveis.map(p=>p.id).join("|")}`} className={`${classes.grade} funilador-lista-registros`}>
                {projetosVisiveis.map(projeto => <CartaoRegistro key={projeto.id} className={classes.card} tipo="projetos" estado={filtro === "arquivados" ? "arquivado" : projeto.status}>
                    <div className={classes.cardTopo}><IconeModerno nome="projetos" tamanho={22}/>
                        <Stack gap={4} className={classes.minimo}>
                            <Text fw={650} className={`${classes.quebra} funilador-registro-titulo`}>{projeto.titulo}</Text>
                            <Text size="xs" c="dimmed" className={`${classes.quebra} funilador-registro-cliente`}><IconeModerno nome="pessoa" tamanho={14}/>{projeto.clienteNome}</Text>
                        </Stack>
                        <Badge variant="light" color={filtro === "arquivados" ? "gray" : ({planejado:"violet",em_andamento:"blue",concluido:"green",cancelado:"red"} as const)[projeto.status]}>{filtro === "arquivados" ? "Arquivado" : statusProjetos.find(p=>p.value===projeto.status)?.label}</Badge>
                    </div>
                    <Text size="sm" c="dimmed" lineClamp={2} className={`${classes.quebra} funilador-registro-descricao`}>{projeto.descricao}</Text>
                    <Text size="xs" c="dimmed"><IconeModerno nome="calendario" tamanho={14}/>Atualizado em {new Date(projeto.atualizadaEm).toLocaleDateString("pt-BR")}</Text>
                    {expressivo && <ProgressoCartaoAdmin id={projeto.id} atualizadaEm={projeto.atualizadaEm}/>}
                    <div className={classes.cardAcoes}>
                        {filtro === "ativos" && <Select aria-label={`Status de ${projeto.titulo}`} size="xs" value={projeto.status} disabled={atualizandoId !== null} allowDeselect={false} data={statusProjetos} onChange={v=>{if(v==="planejado"||v==="em_andamento"||v==="concluido"||v==="cancelado") void alterarStatus(projeto.id,v);}}/>}
                        <Button className="funilador-abrir-cartao funilador-acao-compacta" aria-label="Ver detalhes" size="xs" variant="light" onClick={()=>navigate(`/projetos/${projeto.id}`, {state:{voltarPara:location.pathname+location.search}})}><span>Ver detalhes</span> <IconeModerno nome="abrir" tamanho={15}/></Button>
                    </div>
                </CartaoRegistro>)}
            </TransicaoConteudo>}

        </Stack>
    );
}
