import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation, useSearchParams } from "react-router";
import { Alert, Avatar, Badge, Button, Card, Group, Modal, Select, Stack, Tabs, Text, TextInput, Title } from "@mantine/core";
import { GerenciarAcesso } from "../components/GerenciarAcesso";
import { Carregamento } from "../components/Carregamento";
import { IconePainel } from "../components/MenuConta";
import { caminhoMensagens, destinoRetorno, registrarOrigem, estadoRetorno, statusProjetos, statusSolicitacoes } from "../lib/navegacaoContextual";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Clientes.module.css";

type ProjetoRelacionado = {id:string; titulo:string; status:string; arquivadaEm:string | null};
type SolicitacaoRelacionada = {id:string; titulo:string; status:string};
type ClienteDetalhado = {id:string; nome:string; email:string | null; usuarioId:string | null; criadoEm:string; projetos:ProjetoRelacionado[]; solicitacoes:SolicitacaoRelacionada[]};
const abas = ["geral", "projetos", "solicitacoes", "acesso"];
const coresProjeto: Record<string,string> = {planejado:"violet",em_andamento:"blue",concluido:"teal",cancelado:"gray"};
const coresSolicitacao: Record<string,string> = {pendente:"yellow",aprovada:"teal",recusada:"red"};

export function ClienteDetalhes() {
    const {id} = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [params,setParams] = useSearchParams();
    const aba = abas.includes(params.get("aba") ?? "") ? params.get("aba")! : "geral";
    const voltarPara = destinoRetorno(location.state,"/clientes");
    const origemAnterior = estadoRetorno(location.state)?.estadoAnterior;
    const rotuloVoltar = voltarPara.startsWith("/projetos/") ? "Voltar ao projeto" : "Voltar aos clientes";
    const [cliente,setCliente] = useState<ClienteDetalhado | null>(null);
    const [carregando,setCarregando] = useState(true);
    const [erro,setErro] = useState("");
    const [versao,setVersao] = useState(0);
    const [editando,setEditando] = useState(false);
    const [nomeEdicao,setNomeEdicao] = useState("");
    const [emailEdicao,setEmailEdicao] = useState("");
    const [salvando,setSalvando] = useState(false);
    const [erroEdicao,setErroEdicao] = useState("");
    const [filtroProjeto,setFiltroProjeto] = useState("todos");
    const [filtroSolicitacao,setFiltroSolicitacao] = useState("todos");

    useEffect(()=>{
        const controller = new AbortController();
        async function carregar() {
            setCarregando(true); setErro(""); setEditando(false);
            try {
                if (!id) throw new Error("ID do cliente não informado");
                const resposta = await fetch(`/api/clientes/${id}`, {signal:controller.signal,cache:"no-store"});
                if (!resposta.ok) throw new Error("Não foi possível carregar o cliente");
                const dados:ClienteDetalhado = await resposta.json();
                if (!controller.signal.aborted) setCliente(dados);
            } catch(e) {if (!controller.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao carregar cliente");}
            finally {if (!controller.signal.aborted) setCarregando(false);}
        }
        void carregar(); return ()=>controller.abort();
    },[id,versao]);
    function selecionarAba(valor:string | null) {
        if (!valor || !abas.includes(valor)) return;
        const proximo = new URLSearchParams(params);
        if (valor === "geral") proximo.delete("aba"); else proximo.set("aba",valor);
        setParams(proximo,{replace:true,state:location.state});
    }
    function abrirEdicao() {
        if (!cliente) return;
        setNomeEdicao(cliente.nome);setEmailEdicao(cliente.email??"");setErroEdicao("");setEditando(true);
    }
    async function salvarEdicao() {
        if (!cliente || salvando) return;
        if (!nomeEdicao.trim()) {setErroEdicao("O nome do cliente é obrigatório");return;}
        setSalvando(true);setErroEdicao("");
        const clienteId = cliente.id;
        try {
            const resposta = await fetch(`/api/clientes/${clienteId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({nome:nomeEdicao.trim(),email:emailEdicao.trim()})});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível salvar as alterações");
            setCliente(anterior=>anterior?.id===clienteId ? {...anterior,nome:dados.nome,email:dados.email,usuarioId:dados.usuarioId} : anterior);
            setEditando(false);
        } catch(e) {setErroEdicao(e instanceof Error ? e.message : "Não foi possível salvar as alterações");}
        finally {setSalvando(false);}
    }
    const voltar = ()=>navigate(voltarPara,{state:origemAnterior});
    if (carregando || (cliente && cliente.id!==id && !erro)) return <Carregamento tipo="detalhes" quantidade={3}/>;
    if (erro || !cliente) return <Stack><Alert color="red">{erro || "Cliente não encontrado"}</Alert><Group><Button variant="light" onClick={voltar}>{rotuloVoltar}</Button><Button variant="default" onClick={()=>setVersao(v=>v+1)}>Tentar novamente</Button></Group></Stack>;
    const ativos = cliente.projetos.filter(p=>!p.arquivadaEm && ["planejado","em_andamento"].includes(p.status)).length;
    const pendentes = cliente.solicitacoes.filter(s=>s.status==="pendente").length;
    const arquivados = cliente.projetos.filter(p=>Boolean(p.arquivadaEm)).length;
    const projetosVisiveis = cliente.projetos.filter(p=>filtroProjeto==="todos" || (filtroProjeto==="arquivados" ? Boolean(p.arquivadaEm) : !p.arquivadaEm && (filtroProjeto==="ativos" ? ["planejado","em_andamento"].includes(p.status) : p.status===filtroProjeto)));
    const solicitacoesVisiveis = cliente.solicitacoes.filter(s=>filtroSolicitacao==="todos" || s.status===filtroSolicitacao);
    const iniciais = cliente.nome.trim().split(/\s+/).slice(0,2).map(p=>Array.from(p)[0]??"").join("").toLocaleUpperCase("pt-BR");
    const origem = ()=>registrarOrigem(location.pathname+location.search,location.state);

    return <Stack gap="md" className={classes.pagina}>
        <Modal opened={editando} onClose={()=>{if(!salvando)setEditando(false);}} title="Editar cliente" centered closeOnEscape={!salvando} closeOnClickOutside={!salvando} withCloseButton={!salvando}>
            <form onSubmit={e=>{e.preventDefault();void salvarEdicao();}}><Stack gap="sm">
                <TextInput label="Nome" maxLength={150} required value={nomeEdicao} onChange={e=>setNomeEdicao(e.currentTarget.value)}/>
                <TextInput label="E-mail de contato" description={cliente.usuarioId ? "Não altera o e-mail de acesso à conta." : undefined} type="email" maxLength={254} value={emailEdicao} onChange={e=>setEmailEdicao(e.currentTarget.value)}/>
                {erroEdicao && <Alert color="red">{erroEdicao}</Alert>}
                <Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={()=>setEditando(false)}>Cancelar</Button><Button type="submit" loading={salvando}>Salvar alterações</Button></Group>
            </Stack></form>
        </Modal>
        <Button variant="subtle" size="xs" className={classes.voltar} onClick={voltar}>← {rotuloVoltar}</Button>
        <Card withBorder padding="md"><div className={classes.fichaCabecalho}>
            <div className={classes.fichaIdentidade}><Avatar size="lg" radius="xl" color="grape">{iniciais}</Avatar><Stack gap={4} className={classes.minimo}><Title order={1} className={`${estrutura.heading} ${classes.quebra}`}>{cliente.nome}</Title><Text size="sm" c="dimmed" className={classes.quebra}>{cliente.email ?? "Sem e-mail de contato"}</Text><Group gap={6}><Badge variant="light" color={cliente.usuarioId ? "teal" : "gray"}>{cliente.usuarioId ? "Conta vinculada" : "Sem conta"}</Badge></Group></Stack></div>
            <Group gap="xs" className={classes.fichaAcoes}><Button size="xs" leftSection={<IconePainel nome="mensagens" tamanho={15}/>} onClick={()=>navigate(caminhoMensagens(cliente.id),{state:origem()})}>Mensagem</Button><Button size="xs" variant="light" onClick={abrirEdicao}>Editar cadastro</Button></Group>
        </div></Card>
        <Tabs value={aba} onChange={selecionarAba} keepMounted={false} className={classes.abas}>
            <Tabs.List className={classes.abasLista}>
                <Tabs.Tab value="geral">Visão geral</Tabs.Tab><Tabs.Tab value="projetos">Projetos ({cliente.projetos.length})</Tabs.Tab><Tabs.Tab value="solicitacoes">Solicitações ({cliente.solicitacoes.length})</Tabs.Tab><Tabs.Tab value="acesso">Acesso e segurança</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="geral" pt="md"><Stack gap="sm">
                <div className={classes.indicadores}>{[{label:"Projetos ativos",valor:ativos,aba:"projetos"},{label:"Solicitações pendentes",valor:pendentes,aba:"solicitacoes"},{label:"Projetos arquivados",valor:arquivados,aba:"projetos"}].map((i,index)=><button type="button" className={classes.indicador} key={i.label} onClick={()=>{if(index===0)setFiltroProjeto("ativos");if(index===1)setFiltroSolicitacao("pendente");if(index===2)setFiltroProjeto("arquivados");selecionarAba(i.aba);}}><Text size="xs" c="dimmed">{i.label}</Text><Text size="xl" fw={700} className={classes.numero}>{i.valor}</Text></button>)}</div>
                <Card withBorder padding="md"><Stack gap="sm"><Title order={4}>Cadastro</Title><dl className={classes.dados}><div><dt>Nome</dt><dd>{cliente.nome}</dd></div><div><dt>E-mail de contato</dt><dd>{cliente.email??"Não cadastrado"}</dd></div><div><dt>Cliente desde</dt><dd>{new Date(cliente.criadoEm).toLocaleDateString("pt-BR")}</dd></div><div><dt>Conta de acesso</dt><dd>{cliente.usuarioId?"Vinculada":"Sem conta"}</dd></div></dl></Stack></Card>
            </Stack></Tabs.Panel>
            <Tabs.Panel value="projetos" pt="md"><Card withBorder padding="md"><Stack gap="sm"><Group justify="space-between" align="flex-end"><Title order={4}>Projetos</Title><Select label="Filtrar projetos" size="xs" value={filtroProjeto} onChange={v=>setFiltroProjeto(v??"todos")} allowDeselect={false} data={[{value:"todos",label:"Todos"},{value:"ativos",label:"Ativos"},...statusProjetos,{value:"arquivados",label:"Arquivados"}]}/></Group>
                <Text size="xs" c="dimmed">{projetosVisiveis.length} de {cliente.projetos.length} projetos</Text>
                {!projetosVisiveis.length && <Text size="sm" c="dimmed">Nenhum projeto neste filtro.</Text>}
                {projetosVisiveis.map(p=><div key={p.id} className={classes.relacionado}><Stack gap={5} className={classes.minimo}><Text fw={600} size="sm" className={classes.quebra}>{p.titulo}</Text><Group gap={5}><Badge variant="light" color={coresProjeto[p.status]??"gray"}>{statusProjetos.find(s=>s.value===p.status)?.label??p.status}</Badge>{p.arquivadaEm && <Badge variant="light" color="gray">Arquivado</Badge>}</Group></Stack><Button size="xs" variant="light" onClick={()=>navigate(`/projetos/${p.id}`,{state:origem()})}>Abrir</Button></div>)}
            </Stack></Card></Tabs.Panel>
            <Tabs.Panel value="solicitacoes" pt="md"><Card withBorder padding="md"><Stack gap="sm"><Group justify="space-between" align="flex-end"><Title order={4}>Solicitações</Title><Select label="Filtrar solicitações" size="xs" value={filtroSolicitacao} onChange={v=>setFiltroSolicitacao(v??"todos")} allowDeselect={false} data={[{value:"todos",label:"Todas"},...statusSolicitacoes]}/></Group>
                <Text size="xs" c="dimmed">{solicitacoesVisiveis.length} de {cliente.solicitacoes.length} solicitações</Text>
                {!solicitacoesVisiveis.length && <Text size="sm" c="dimmed">Nenhuma solicitação neste filtro.</Text>}
                {solicitacoesVisiveis.map(s=><div key={s.id} className={classes.relacionado}><Stack gap={5} className={classes.minimo}><Text fw={600} size="sm" className={classes.quebra}>{s.titulo}</Text><Badge variant="light" color={coresSolicitacao[s.status]??"gray"}>{statusSolicitacoes.find(x=>x.value===s.status)?.label??s.status}</Badge></Stack><Button size="xs" variant="light" onClick={()=>navigate(`/solicitacoes?solicitacao=${encodeURIComponent(s.id)}`,{state:origem()})}>Abrir</Button></div>)}
            </Stack></Card></Tabs.Panel>
            <Tabs.Panel value="acesso" pt="md"><GerenciarAcesso key={cliente.id} clienteId={cliente.id}/></Tabs.Panel>
        </Tabs>
    </Stack>;
}
