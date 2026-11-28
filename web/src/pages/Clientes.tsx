import { NumeroModerno, TransicaoConteudo } from "../components/InteracaoModerna";
import { CabecalhoModerno, IconeModerno } from "../components/AcabamentoModerno";
import { toast } from "../lib/toasts";
import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { ActionIcon, Alert, Avatar, Badge, Button, Card, Group, Menu, Modal, Pagination, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { CampoBusca } from "../components/CampoBusca";
import { Carregamento } from "../components/Carregamento";
import { IconePainel } from "../components/MenuConta";
import { caminhoMensagens, registrarOrigem } from "../lib/navegacaoContextual";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Clientes.module.css";

type Cliente = {id: string; nome: string; email: string | null; usuarioId: string | null; projetosAtivos: number};
const porPagina = 20;
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map(p => Array.from(p)[0] ?? "").join("").toLocaleUpperCase("pt-BR");

export function Clientes() {
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const filtro = ["todos", "vinculado", "sem_conta"].includes(params.get("acesso") ?? "") ? params.get("acesso")! : "todos";
    const ordem = params.get("ordem") === "ativos" ? "ativos" : "nome";
    const [busca, setBusca] = useState("");
    const paginaSolicitada = Math.max(1, Number(params.get("pagina")) || 1);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");
    const [versao, setVersao] = useState(0);
    const [repeticao,setRepeticao] = useState(0);
    const [modalAberto, setModalAberto] = useState(false);
    const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erroCadastro, setErroCadastro] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        async function carregar() {
            setCarregando(true); setErro("");
            try {
                const resposta = await fetch("/api/clientes", {signal: controller.signal, cache:"no-store"});
                if (!resposta.ok) throw new Error("Não foi possível carregar os clientes");
                const dados: Cliente[] = await resposta.json();
                if (!controller.signal.aborted) {setClientes(dados);setRepeticao(v=>v+1);}
            } catch (e) {if (!controller.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao carregar clientes");}
            finally {if (!controller.signal.aborted) setCarregando(false);}
        }
        void carregar();
        return () => controller.abort();
    }, [versao]);

    function filtroUrl(chave: string, valor: string) {
        const proximo = new URLSearchParams(params);
        if (!valor || valor === "todos" || (chave === "ordem" && valor === "nome") || (chave === "pagina" && valor === "1")) proximo.delete(chave);
        else proximo.set(chave, valor);
        if (chave !== "pagina") proximo.delete("pagina");
        setParams(proximo, {replace:true});
    }
    function abrir(cliente: Cliente | null = null) {
        setClienteEditando(cliente); setNome(cliente?.nome ?? ""); setEmail(cliente?.email ?? ""); setErroCadastro(""); setModalAberto(true);
    }
    function fechar() {if (!enviando) {setModalAberto(false); setClienteEditando(null); setErroCadastro("");}}
    async function salvar(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault(); if (enviando) return;
        setEnviando(true); setErroCadastro("");
        try {
            const resposta = await fetch(clienteEditando ? `/api/clientes/${clienteEditando.id}` : "/api/clientes", {
                method: clienteEditando ? "PATCH" : "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({nome, email}),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível salvar o cliente");
            setClientes(anteriores => clienteEditando ? anteriores.map(c => c.id === dados.id ? {...c, ...dados} : c) : [{usuarioId:null, projetosAtivos:0, ...dados}, ...anteriores]);
            toast.mostrar("sucesso", {titulo:clienteEditando ? "Cadastro atualizado" : "Cliente cadastrado", mensagem:"As informações do cliente foram salvas."});
            setModalAberto(false); setClienteEditando(null);
            setVersao(v => v+1);
        } catch (e) {setErroCadastro(e instanceof Error ? e.message : "Não foi possível salvar o cliente");}
        finally {setEnviando(false);}
    }
    const vinculados = clientes.filter(c => Boolean(c.usuarioId)).length;
    const termo = normalizar(busca);
    const filtrados = clientes.filter(c => (filtro === "todos" || (filtro === "vinculado" ? Boolean(c.usuarioId) : !c.usuarioId)) && (!termo || normalizar(`${c.nome} ${c.email ?? ""}`).includes(termo)))
        .sort((a,b) => (ordem === "ativos" ? b.projetosAtivos-a.projetosAtivos : 0) || a.nome.localeCompare(b.nome,"pt-BR") || a.id.localeCompare(b.id));
    const paginas = Math.max(1, Math.ceil(filtrados.length/porPagina));
    const pagina = Math.min(paginas, Math.floor(paginaSolicitada));
    const origem = () => registrarOrigem(location.pathname+location.search, location.state);
    const detalhes = (c: Cliente, aba?: string) => navigate(`/clientes/${c.id}${aba ? `?aba=${aba}` : ""}`, {state:origem()});
    const indicadores = [{label:"Total de clientes",valor:clientes.length,id:"todos"},{label:"Com acesso",valor:vinculados,id:"vinculado"},{label:"Sem conta",valor:clientes.length-vinculados,id:"sem_conta"}];

    return <Stack gap="md" className={`${classes.pagina} funilador-lista-clientes`}>
        <CabecalhoModerno titulo="Clientes" descricao="Gerencie cadastros e contas de acesso." secao="Área de trabalho" icone="clientes" classeTitulo={estrutura.heading} acoes={<Button size="sm" onClick={()=>abrir()}>+ Novo cliente</Button>} original={<Group justify="space-between" align="flex-start" wrap="wrap"><Stack gap={3}><Title order={1} className={estrutura.heading}>Clientes</Title><Text size="sm" c="dimmed">Gerencie cadastros e contas de acesso.</Text></Stack><Button size="sm" onClick={()=>abrir()}>+ Novo cliente</Button></Group>}/>
        <Modal opened={modalAberto} onClose={fechar} title={clienteEditando ? "Editar cliente" : "Novo cliente"} centered closeOnEscape={!enviando} closeOnClickOutside={!enviando} withCloseButton={!enviando}>
            <form onSubmit={salvar}><Stack gap="sm">
                <TextInput label="Nome" required maxLength={150} value={nome} onChange={e=>setNome(e.currentTarget.value)}/>
                <TextInput label="E-mail de contato" description={clienteEditando?.usuarioId ? "Não altera o e-mail de acesso à conta." : undefined} type="email" maxLength={254} placeholder="Opcional" value={email} onChange={e=>setEmail(e.currentTarget.value)}/>
                {erroCadastro && <Alert color="red">{erroCadastro}</Alert>}
                <Group justify="flex-end"><Button variant="default" disabled={enviando} onClick={fechar}>Cancelar</Button><Button type="submit" loading={enviando}>{clienteEditando ? "Salvar alterações" : "Cadastrar cliente"}</Button></Group>
            </Stack></form>
        </Modal>
        {carregando && clientes.length===0 ? <Carregamento tipo="lista" quantidade={3}/> : erro ? <Alert color="red">{erro}<Button size="xs" variant="subtle" onClick={()=>setVersao(v=>v+1)}>Tentar novamente</Button></Alert> : <>
            <div className={classes.indicadores}>{indicadores.map(i=><button key={i.id} type="button" className={classes.indicador} data-ativo={filtro===i.id} aria-pressed={filtro===i.id} onClick={()=>filtroUrl("acesso",i.id)}><Group gap={6} wrap="nowrap"><IconeModerno nome="clientes" tamanho={20}/><Text size="xs" c="dimmed">{i.label}</Text></Group><Text fw={700} size="xl" className={classes.numero}>{<NumeroModerno valor={i.valor} repeticao={repeticao}/>}</Text></button>)}</div>
            <div className={`${classes.filtros} funilador-clientes-filtros`}>
                <CampoBusca placeholder="Nome ou e-mail" value={busca} onChange={v=>{setBusca(v);if(params.has("pagina"))filtroUrl("pagina","1");}}/>
                <Select label="Acesso" allowDeselect={false} value={filtro} onChange={v=>filtroUrl("acesso",v??"todos")} data={[{value:"todos",label:"Todos"},{value:"vinculado",label:"Com acesso"},{value:"sem_conta",label:"Sem conta"}]}/>
                <Select label="Ordenar" allowDeselect={false} value={ordem} onChange={v=>filtroUrl("ordem",v??"nome")} data={[{value:"nome",label:"Nome (A–Z)"},{value:"ativos",label:"Mais projetos ativos"}]}/>
            </div>
            <TransicaoConteudo identidade={`${filtro}-${ordem}-${pagina}`}><Card withBorder padding={0} className={`${classes.tabelaCard} funilador-tabela-clientes`}>
                <Group justify="space-between" p="sm" className={classes.cabecalhoTabela}><Text size="sm" fw={600}>{filtrados.length} de {clientes.length} clientes</Text><Group gap="xs">{(busca.trim() || filtro !== "todos" || ordem !== "nome") && <Button size="compact-xs" variant="subtle" onClick={()=>{setBusca("");setParams({}, {replace:true});}}>Limpar filtros</Button>}<Button size="compact-xs" variant="subtle" className="funilador-atualizar" leftSection={<IconeModerno nome="atualizar"/>} loading={carregando} onClick={()=>setVersao(v=>v+1)}>Atualizar</Button></Group></Group>
                {filtrados.length===0 ? <Stack align="center" p="xl" gap="xs"><IconePainel nome="clientes" tamanho={26}/><Text size="sm" c="dimmed">{clientes.length ? "Nenhum cliente corresponde aos filtros." : "Nenhum cliente cadastrado."}</Text><Button variant="light" size="xs" onClick={()=>clientes.length ? (setBusca(""), setParams({}, {replace:true})) : abrir()}>{clientes.length ? "Limpar filtros" : "Cadastrar cliente"}</Button></Stack> : <Table className={classes.tabela} verticalSpacing="xs" horizontalSpacing="sm">
                    <Table.Thead><Table.Tr><Table.Th>Cliente</Table.Th><Table.Th>Acesso</Table.Th><Table.Th>Projetos ativos</Table.Th><Table.Th><span className={classes.srOnly}>Ações</span></Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>{filtrados.slice((pagina-1)*porPagina,pagina*porPagina).map(c=><Table.Tr key={c.id}>
                        <Table.Td className={classes.identidade}><button type="button" className={classes.clienteLink} onClick={()=>detalhes(c)}><Avatar radius="xl" size="sm" color="grape">{iniciais(c.nome)}</Avatar><span className={classes.clienteTexto}><Text component="span" fw={600} size="sm" className={classes.quebra}>{c.nome}</Text><Text component="span" size="xs" c="dimmed" className={classes.quebra}>{c.email ?? "Sem e-mail de contato"}</Text></span></button></Table.Td>
                        <Table.Td className={classes.acesso}><Badge variant="light" color={c.usuarioId ? "teal" : "gray"}>{c.usuarioId ? "Vinculado" : "Sem conta"}</Badge></Table.Td>
                        <Table.Td className={classes.ativos}><Text size="sm" className={classes.numero}>{c.projetosAtivos ?? 0}<span className={classes.rotuloMobile}> ativos</span></Text></Table.Td>
                        <Table.Td className={classes.acoes}><Menu position="bottom-end" withinPortal><Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${c.nome}`} title="Ações do cliente"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></ActionIcon></Menu.Target><Menu.Dropdown>
                            <Menu.Item onClick={()=>detalhes(c)}>Ver ficha</Menu.Item><Menu.Item onClick={()=>abrir(c)}>Editar cadastro</Menu.Item><Menu.Item onClick={()=>navigate(caminhoMensagens(c.id),{state:origem()})}>Enviar mensagem</Menu.Item><Menu.Divider/><Menu.Item onClick={()=>detalhes(c,"acesso")}>Gerenciar acesso</Menu.Item>
                        </Menu.Dropdown></Menu></Table.Td>
                    </Table.Tr>)}</Table.Tbody>
                </Table>}
                {paginas>1 && <Group justify="center" p="sm"><Pagination size="sm" total={paginas} value={pagina} onChange={v=>filtroUrl("pagina",String(v))} siblings={0}/></Group>}
            </Card></TransicaoConteudo>
            <Text size="xs" c="dimmed">Projetos ativos: planejados ou em andamento, sem arquivamento.</Text>
        </>}
    </Stack>;
}
