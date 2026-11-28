import { apiFetch } from "../lib/api-fetch";
import { lazy, Suspense } from "react";
import { useExpressivo } from "../lib/contextoAparencia";
import { useModerno } from "../hooks/useInteracaoModerna";
import { useMovimentoReduzido } from "../lib/contextoAparencia";
import { NumeroModerno, TransicaoConteudo } from "../components/InteracaoModerna";
import { IconeModerno, CabecalhoModerno, CartaoRegistro } from "../components/AcabamentoModerno";
import { toast } from "../lib/toasts";
import { CampoData, CampoMes } from "../components/CampoData";
import { DistribuicaoFinanceira, type GrupoFinanceiro } from "../components/GraficosFinanceiros";
import fin from "../styles/Financeiro.module.css";
import estrutura from "../styles/Estrutura.module.css";
import { EstadoLista } from "../components/EstadoLista";
import { Carregamento } from "../components/Carregamento";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Group, Menu, Modal, Pagination, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { FinanceiroDashboard } from "../components/FinanceiroDashboard";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { useRelogio } from "../hooks/useRelogio";
import { formatarPrazo, formatarValor } from "../lib/comercial";
import { caminhoMensagens, registrarOrigem } from "../lib/navegacaoContextual";

const DispersaoPagamentos = lazy(()=>import("../components/expressivo/GraficosExpressivos").then(m=>({default:m.DispersaoPagamentos})));

type Item = {id:string; marcoId:string; projetoId:string; clienteId:string; marco:string; projeto:string; cliente:string; data:string|null; valor:string; categoria:string; arquivado:boolean; cobrancaIniciada:boolean; bloqueiaProgresso:boolean; status:string; projetoStatus:string; saldoDispensado:boolean; anuladoEm:string|null; valorMarco:string|null; recebido:string; ultimoLembrete:string|null};
type Opcao = {value:string; label:string};
type Detalhes = {quantidade:number; total:string; itens:Item[]; clientes:Opcao[]; projetos:(Opcao & {clienteId:string})[]; mes:string; porCliente?:GrupoFinanceiro[]; porProjeto?:GrupoFinanceiro[]};
type Operacao = {tipo:"cobrar"|"receber"|"lembrar"; item:Item; pagamentoId:string; valor:string; data:string};
const filtros = [{value:"todos",label:"Todas as pendências"},{value:"agenda",label:"Agenda de vencimentos"},{value:"atrasado",label:"Pagamentos atrasados"},{value:"mes",label:"A receber neste mês"},{value:"futuro",label:"Recebimentos futuros"},{value:"sem_data",label:"Sem vencimento"},{value:"cobrados",label:"Cobrança iniciada"},{value:"nao_cobrados",label:"Cobrança não iniciada"},{value:"recebidos",label:"Histórico de recebimentos"},{value:"cancelados",label:"Marcos e projetos cancelados"}];
const hojeBR = (agora = Date.now()) => new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(agora));

//evitar fórmulas em campos de texto exportados
function celulaCsv(valor:unknown) {
    let texto = String(valor ?? "");
    // Ignora espaços e controles iniciais ao identificar fórmulas.
    let indice = 0;
    while (indice < texto.length && (texto.charCodeAt(indice) <= 31 || /\s/u.test(texto.charAt(indice)))) indice++;
    if (/^[=+@-]/.test(texto.slice(indice)) || texto.startsWith("\t") || texto.startsWith("\r") || texto.startsWith("\n")) texto = "'" + texto;
    return '"' + texto.replaceAll('"','""') + '"';
}
function criarCsv(itens:Item[]) {
    const cabecalho = ["ID","Cliente","Projeto","Marco","Data","Valor (BRL)","Valor válido da seleção (BRL)","Situação","Cobrança iniciada","Arquivado","Anulado em","Valor do marco (BRL)","Recebido no marco (BRL)"];
    const dinheiro = (v:string|null) => v === null ? "" : v.replace(".",",");
    return [cabecalho,...itens.map(i=>[i.id,i.cliente,i.projeto,i.marco,i.data,dinheiro(i.valor),dinheiro(i.anuladoEm ? "0" : i.valor),i.categoria,i.cobrancaIniciada?"Sim":"Não",i.arquivado?"Sim":"Não",i.anuladoEm,dinheiro(i.valorMarco),dinheiro(i.recebido)])].map(l=>l.map(celulaCsv).join(";")).join("\r\n");
}

export function Financeiro() {
    const agora = useRelogio();
    const hoje = hojeBR(agora);
    const modernoDesktop = useModerno();
    const expressivo = useExpressivo();
    const reduzir = useMovimentoReduzido();
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const categoria = filtros.some(f => f.value === params.get("categoria")) ? params.get("categoria")! : "todos";
    const cliente = params.get("cliente") ?? "";
    const projeto = params.get("projeto") ?? "";
    const mes = params.get("mes") ?? hoje.slice(0,7);
    const inicio = params.get("inicio") ?? "";
    const fim = params.get("fim") ?? "";
    const periodoInvalido = !!inicio && !!fim && inicio > fim;
    const pagina = /^[1-9]\d{0,5}$/.test(params.get("pagina") ?? "") ? Number(params.get("pagina")) : 1;
    const consulta = new URLSearchParams({categoria, pagina:String(pagina), ...(cliente ? {cliente} : {}), ...(projeto ? {projeto} : {}), ...(categoria === "recebidos" ? {mes} : {}), ...(inicio ? {inicio} : {}), ...(fim ? {fim} : {})}).toString();
    const [resultado,setResultado] = useState<{consulta:string;dados:Detalhes}|null>(null);
    const [erro,setErro] = useState<string|null>(null);
    const [operacao,setOperacao] = useState<Operacao|null>(null);
    const [erroOperacao,setErroOperacao] = useState<string|null>(null);
    const [salvando,setSalvando] = useState(false);
    const [revisao,setRevisao] = useState(0);
    const [repeticaoRegistros,setRepeticaoRegistros] = useState(0);
    const repetirRegistros = useRef(false);
    const [exportando,setExportando] = useState(false);
    const [erroExportacao,setErroExportacao] = useState<string|null>(null);
    const bloqueio = useRef(false);
    const detalhesRef = useRef<HTMLDivElement>(null);
    const focoInicial = useRef(params.has("categoria"));
    const dados = resultado?.consulta === consulta ? resultado.dados : null;
    const [atualizando, setAtualizando] = useState(false);
    const carregar = useCallback(async (signal:AbortSignal) => {
        if (periodoInvalido) {setAtualizando(false); return;}
        setAtualizando(true);
        try {
            const resposta = await apiFetch(`/api/dashboard/financeiro/detalhes?${consulta}`, {signal,cache:"no-store"});
            const corpo = await resposta.json();
            if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível carregar os registros");
            if (!signal.aborted) {setResultado({consulta,dados:corpo});setErro(null);if (repetirRegistros.current) {repetirRegistros.current=false;setRepeticaoRegistros(v=>v+1);}}
        } catch(e) {if (!signal.aborted) {setErro(e instanceof Error ? e.message : "Não foi possível carregar os registros");repetirRegistros.current=false;}} finally {if (!signal.aborted) setAtualizando(false);}
    }, [consulta,periodoInvalido]);
    const atualizar = useAtualizacaoPeriodica(carregar,60000);
    useEffect(() => {
        if (!dados || !focoInicial.current) return;
        focoInicial.current = false;
        detalhesRef.current?.scrollIntoView({block:"start",behavior:modernoDesktop && !reduzir ? "smooth" : "auto"});
    }, [dados,modernoDesktop,reduzir]);

    function alterar(chave:string, valor:string) {
        const novos = new URLSearchParams(params);
        if (valor) novos.set(chave,valor); else novos.delete(chave);
        if (chave !== "pagina") novos.delete("pagina");
        if (chave === "cliente") novos.delete("projeto");
        if (chave === "categoria" || chave === "mes") {novos.delete("inicio");novos.delete("fim");}
        setErroExportacao(null);
        setErro(null);
        setParams(novos);
    }
    function selecionar(valor:string, periodo?:{mes?:string;inicio?:string;fim?:string}) {
        //cards do resumo geral sempre consultam todos os clientes e projetos
        const novos = new URLSearchParams({categoria:valor});
        if (periodo?.mes) novos.set("mes",periodo.mes);
        if (periodo?.inicio) novos.set("inicio",periodo.inicio);
        if (periodo?.fim) novos.set("fim",periodo.fim);
        setParams(novos);
        setErro(null);setErroExportacao(null);
        detalhesRef.current?.scrollIntoView({block:"start",behavior:modernoDesktop && !reduzir ? "smooth" : "auto"});
    }
    function filtrarGrupo(tipo:"cliente"|"projeto", id:string) {
        const novos = new URLSearchParams(params);
        novos.delete("pagina");
        if (tipo === "cliente") {novos.set("cliente",id);novos.delete("projeto");}
        else {novos.set("projeto",id);}
        setErro(null);setErroExportacao(null);setParams(novos);
    }
    async function exportarCsv() {
        if (exportando || periodoInvalido) return;
        setExportando(true);setErroExportacao(null);
        try {
            const resposta = await apiFetch(`/api/dashboard/financeiro/detalhes?${consulta}&exportar=true`,{cache:"no-store"});
            const corpo = await resposta.json();
            if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível exportar");
            const dados = corpo as Detalhes;
            if (dados.itens.length !== dados.quantidade) throw new Error("A exportação não contém todos os registros");
            const texto = criarCsv(dados.itens);
            const url = URL.createObjectURL(new Blob(["\uFEFF",texto],{type:"text/csv;charset=utf-8"}));
            const link = document.createElement("a");link.href=url;link.download=`funilador-${categoria}-${hojeBR()}.csv`;
            document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
            toast.mostrar("sucesso", {titulo:"CSV preparado", mensagem:"O download dos registros foi solicitado."});
        } catch(e) {setErroExportacao(e instanceof Error ? e.message : "Não foi possível exportar");}
        finally {setExportando(false);}
    }
    function abrir(item:Item, conversa = false) {
        const destino = conversa ? caminhoMensagens(item.clienteId,item.projetoId) : `/projetos/${item.projetoId}?marco=${item.marcoId}`;
        navigate(destino,{state:{...registrarOrigem(location.pathname + location.search,location.state), ...(conversa ? {projetoArquivado:item.arquivado} : {})}});
    }
    function iniciar(item:Item,tipo:Operacao["tipo"]) {
        setErroOperacao(null);
        setOperacao({tipo,item,pagamentoId:crypto.randomUUID(),valor:item.valor,data:hojeBR()});
    }
    async function confirmar() {
        if (!operacao || bloqueio.current) return;
        bloqueio.current = true;setSalvando(true);setErroOperacao(null);
        const {item,tipo,pagamentoId,valor,data} = operacao;
        try {
            const resposta = await apiFetch(`/api/projetos/${item.projetoId}/marcos/${item.marcoId}/${tipo === "cobrar" ? "cobranca" : tipo === "lembrar" ? "lembretes" : "pagamentos"}`,{
                method:tipo === "cobrar" ? "PATCH" : "POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tipo === "receber" ? {pagamentoId,valor,recebidoEm:data} : {})});
            const corpo = await resposta.json();
            if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível concluir a operação");
            setOperacao(null);
            toast.mostrar("sucesso", {titulo:tipo === "cobrar" ? "Cobrança iniciada" : tipo === "lembrar" ? "Lembrete enviado" : "Pagamento registrado", mensagem:tipo === "lembrar" ? (corpo.conversa ? "Notificação enviada no portal e na conversa." : "Notificação enviada no portal.") : "Os registros financeiros foram atualizados."});
            setRevisao(v=>v+1);atualizar();
        } catch(e) {setErroOperacao(e instanceof Error ? e.message : "Não foi possível concluir a operação");}
        finally {bloqueio.current=false;setSalvando(false);}
    }
    const historico = categoria === "recebidos";
    const totalPaginas = Math.max(1,Math.ceil((dados?.quantidade ?? 0)/25));
    const opcoes = resultado?.dados;
    return <Stack gap="md" className={fin.pagina}>
        <CabecalhoModerno titulo="Financeiro" descricao="Acompanhe recebimentos, previsões e cobranças." secao="Gestão financeira" icone="financeiro" classeTitulo={estrutura.heading} original={<Stack gap={2}><Title order={1} className={estrutura.heading}>Financeiro</Title><Text c="dimmed">Acompanhe recebimentos, previsões e cobranças.</Text></Stack>}/>
        <FinanceiroDashboard completo onSelecionar={selecionar} revisao={revisao}/>
        <Card withBorder padding="sm" className="funilador-financeiro-registros"><Stack gap="sm" ref={detalhesRef} style={{scrollMarginTop:80}}>
            <Group justify="space-between"><Title order={3}>Registros financeiros</Title><Group gap="xs"><Button size="xs" variant="light" loading={exportando} disabled={!dados || periodoInvalido} onClick={()=>void exportarCsv()}>Exportar CSV</Button><Button size="xs" variant="subtle" className="funilador-atualizar" loading={atualizando} disabled={periodoInvalido} leftSection={<IconeModerno nome="atualizar"/>} onClick={()=>{repetirRegistros.current=true;atualizar();}}>Atualizar</Button></Group></Group>
            <Text size="xs" c="dimmed">Os filtros abaixo afetam os registros, a distribuição e o total da seleção. O resumo e os gráficos acima são gerais.</Text>
            <SimpleGrid cols={{base:1,xs:2,lg:4}} className="funilador-financeiro-filtros">
                <Select label="Situação" data={filtros} value={categoria} allowDeselect={false} onChange={v=>alterar("categoria",v ?? "todos")}/>
                <Select searchable clearable label="Cliente" placeholder="Todos" data={opcoes?.clientes ?? []} value={cliente || null} onChange={v=>alterar("cliente",v ?? "")}/>
                <Select searchable clearable label="Projeto" placeholder="Todos" data={opcoes?.projetos.filter(p=>!cliente || p.clienteId===cliente).map(p=>({value:p.value,label:p.label})) ?? []} value={projeto || null} onChange={v=>alterar("projeto",v ?? "")}/>
                {historico && !inicio && !fim && <CampoMes label="Mês do recebimento" value={mes} maxDate={hoje} onChange={v=>alterar("mes",v)}/>}
                <CampoData label={historico ? "Recebido a partir de" : "Vencimento a partir de"} value={inicio} maxDate={historico ? (fim && fim < hoje ? fim : hoje) : fim || undefined} onChange={v=>alterar("inicio",v)}/>
                <CampoData label={historico ? "Recebido até" : "Vencimento até"} value={fim} minDate={inicio || undefined} maxDate={historico ? hoje : undefined} onChange={v=>alterar("fim",v)}/>
            </SimpleGrid>
            {categoria==="agenda" && <Text size="xs" c="dimmed">Agenda em ordem de vencimento. Sem datas selecionadas, mostra hoje e os próximos 29 dias.</Text>}
            {(inicio || fim) && <Text size="xs" c="dimmed">Intervalo inclusivo. Registros sem data não entram neste filtro.{historico ? " O intervalo substitui o filtro mensal." : ""}</Text>}
            {periodoInvalido && <Alert color="red">A data inicial deve ser anterior ou igual à final.</Alert>}
            {erroExportacao && <Alert color="red" withCloseButton onClose={()=>setErroExportacao(null)}>{erroExportacao}</Alert>}
            <Group justify="space-between"><Button size="xs" variant="subtle" onClick={()=>{setParams(new URLSearchParams());setErro(null);setErroExportacao(null);}}>Limpar filtros</Button>{dados && <Stack gap={2} align="flex-end"><Text size="xs" c="dimmed">{historico ? "Total recebido (sem anulados)" : "Saldo total da seleção"} · {dados.quantidade} registros</Text><Text fw={700}><NumeroModerno valor={dados.total} moeda repeticao={repeticaoRegistros}/></Text></Stack>}</Group>
            {erro && <Alert color="red">{erro}{dados && " · Última consulta disponível."}</Alert>}
            {!dados && !erro && !periodoInvalido && <Carregamento texto="Carregando registros..."/>}
            {dados && dados.itens.length===0 && <EstadoLista titulo="Nenhum registro nesta seleção" descricao="Ajuste os filtros ou o período para consultar outros lançamentos." acao="Limpar filtros" onAcao={()=>{setParams(new URLSearchParams());setErro(null);setErroExportacao(null);}}/>}
            {expressivo && historico && dados && <Suspense fallback={<Text size="sm">Carregando dispersão...</Text>}><DispersaoPagamentos itens={dados.itens} pagina={pagina}/></Suspense>}
            {dados && <DistribuicaoFinanceira clientes={dados.porCliente} projetos={dados.porProjeto} total={dados.total} historico={historico} onSelecionar={filtrarGrupo}/>}
            {dados && dados.itens.length > 0 && <Text fw={600} size="sm">Lançamentos</Text>}
            <TransicaoConteudo identidade={resultado?.consulta ?? consulta} className={`${fin.registros} funilador-lista-registros`}>{dados?.itens.map(item => {
                const pendente = !historico && Number(item.valor)>0 && !item.arquivado;
                const podeLembrar = pendente && (item.cobrancaIniciada || item.bloqueiaProgresso || (item.data !== null && item.data <= hoje));
                const lembreteRecente = !!item.ultimoLembrete && agora - new Date(item.ultimoLembrete).getTime() < 86400000;
                return <CartaoRegistro key={item.id} className={fin.registro} tipo="financeiro"><Stack gap={6}>
                    <Group className="ex-lancamento-topo" justify="space-between" align="start" wrap="wrap"><Stack gap={2} className={fin.identidade}><Text fw={600}>{item.marco}</Text><Text size="xs" c="dimmed">{item.projeto} · {item.cliente}</Text><Text size="xs" c="dimmed">{historico ? "Recebido em" : "Vencimento"}: {formatarPrazo(item.data)}</Text></Stack><Text fw={700} td={item.anuladoEm ? "line-through" : undefined} c={item.anuladoEm ? "dimmed" : historico ? "green" : item.categoria === "atrasado" && Number(item.valor)>0 ? "red" : undefined}>{formatarValor(item.valor)}</Text></Group>
                    <Group gap={5}>{historico ? <Badge color={item.anuladoEm ? "gray" : "green"} variant="light">{item.anuladoEm ? "Anulado" : "Recebido"}</Badge> : <><Badge color={item.categoria === "atrasado" && Number(item.valor)>0 ? "red" : "gray"} variant="light">{Number(item.valor)===0 ? "Sem saldo exigível" : filtros.find(f=>f.value===item.categoria)?.label ?? item.categoria}</Badge><Badge color="gray" variant="outline">{item.cobrancaIniciada ? "Cobrança iniciada" : "Cobrança não iniciada"}</Badge>{item.saldoDispensado && <Badge color="gray">Saldo dispensado</Badge>}{item.bloqueiaProgresso && Number(item.valor)>0 && <Badge color="orange">Aguardando pagamento</Badge>}</>}{item.arquivado && <Badge color="gray">Arquivado</Badge>}{(item.status==="cancelado" || item.projetoStatus==="cancelado") && <Badge color="gray">Cancelado</Badge>}</Group>
                    {!historico && <Text size="xs" c="dimmed">Valor do marco: {formatarValor(item.valorMarco)} · Recebido: {formatarValor(item.recebido)}</Text>}
                    {!historico && item.ultimoLembrete && <Text size="xs" c="dimmed">Último lembrete: {new Date(item.ultimoLembrete).toLocaleString("pt-BR")}</Text>}
                    {item.anuladoEm && <Text size="xs" c="dimmed">Anulado em {new Date(item.anuladoEm).toLocaleString("pt-BR")}</Text>}
                    <Group className="ex-lancamento-acoes" gap={5} justify="space-between" wrap="wrap">
                        <Button className="funilador-abrir-cartao" size="compact-xs" variant="subtle" onClick={()=>abrir(item)}>Abrir marco</Button>
                        <Menu position="bottom-end" withinPortal shadow="md">
                            <Menu.Target><Button size="compact-xs" variant="default" aria-label={`Ações de ${item.marco}`}>Ações ⋮</Button></Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item onClick={()=>abrir(item,true)}>Abrir conversa</Menu.Item>
                                {pendente && !item.cobrancaIniciada && <Menu.Item onClick={()=>iniciar(item,"cobrar")}>Iniciar cobrança</Menu.Item>}
                                {podeLembrar && <Menu.Item disabled={lembreteRecente} onClick={()=>iniciar(item,"lembrar")}>{lembreteRecente ? "Lembrete enviado nas últimas 24h" : "Lembrar cliente"}</Menu.Item>}
                                {pendente && <Menu.Item color="green" onClick={()=>iniciar(item,"receber")}>Registrar pagamento</Menu.Item>}
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Stack></CartaoRegistro>;
            })}</TransicaoConteudo>
            {dados && totalPaginas>1 && <Pagination total={totalPaginas} value={Math.min(pagina,totalPaginas)} onChange={v=>alterar("pagina",String(v))}/>}
            {dados && pagina>totalPaginas && <Button variant="light" onClick={()=>alterar("pagina",String(totalPaginas))}>Voltar à última página disponível</Button>}
        </Stack></Card>
        <Modal opened={!!operacao} onClose={()=>{if (!salvando) setOperacao(null);}} title={operacao?.tipo==="cobrar" ? "Iniciar cobrança" : operacao?.tipo==="lembrar" ? "Lembrar cliente" : "Registrar pagamento"} closeOnClickOutside={!salvando} closeOnEscape={!salvando} withCloseButton={!salvando}>
            {operacao && <Stack gap="sm"><Text fw={600}>{operacao.item.marco}</Text><Text size="sm" c="dimmed">Saldo pendente: {formatarValor(operacao.item.valor)}</Text>
                {operacao.tipo==="cobrar" ? <Text size="sm">O marco será sinalizado como cobrado e o cliente receberá a atualização do projeto. Nenhum pagamento será registrado.</Text> : operacao.tipo==="lembrar" ? <Text size="sm">Envia uma notificação importante e uma mensagem na conversa do projeto, se estiver ativa. Não altera o saldo.</Text> : <><Text size="sm">Informe somente o dinheiro efetivamente recebido.</Text><TextInput label="Valor recebido (R$)" inputMode="decimal" maxLength={13} value={operacao.valor} disabled={salvando} onChange={e=>{const valor=e.currentTarget.value;setOperacao(o=>o?{...o,valor}:o);}}/><CampoData label="Data do recebimento" maxDate={hoje} value={operacao.data} required disabled={salvando} onChange={data=>setOperacao(o=>o?{...o,data}:o)}/></>}
                {erroOperacao && <Alert color="red">{erroOperacao}</Alert>}<Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={()=>setOperacao(null)}>Cancelar</Button><Button loading={salvando} disabled={operacao.tipo==="receber" && (!operacao.valor.trim() || !operacao.data)} onClick={()=>void confirmar()}>Confirmar</Button></Group>
            </Stack>}
        </Modal>
    </Stack>;
}
