import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Group, Modal, Pagination, Select, SimpleGrid, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { FinanceiroDashboard } from "../components/FinanceiroDashboard";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { formatarPrazo, formatarValor } from "../lib/comercial";
import { caminhoMensagens, registrarOrigem } from "../lib/navegacaoContextual";

type Item = {id:string; marcoId:string; projetoId:string; clienteId:string; marco:string; projeto:string; cliente:string; data:string|null; valor:string; categoria:string; arquivado:boolean; cobrancaIniciada:boolean; bloqueiaProgresso:boolean; status:string; projetoStatus:string; saldoDispensado:boolean; anuladoEm:string|null; valorMarco:string|null; recebido:string; ultimoLembrete:string|null};
type Opcao = {value:string; label:string};
type Detalhes = {quantidade:number; total:string; itens:Item[]; clientes:Opcao[]; projetos:(Opcao & {clienteId:string})[]; mes:string};
type Operacao = {tipo:"cobrar"|"receber"|"lembrar"; item:Item; pagamentoId:string; valor:string; data:string};
const filtros = [{value:"todos",label:"Todas as pendências"},{value:"atrasado",label:"Pagamentos atrasados"},{value:"mes",label:"A receber neste mês"},{value:"futuro",label:"Recebimentos futuros"},{value:"sem_data",label:"Sem vencimento"},{value:"cobrados",label:"Cobrança iniciada"},{value:"nao_cobrados",label:"Cobrança não iniciada"},{value:"recebidos",label:"Histórico de recebimentos"},{value:"cancelados",label:"Marcos e projetos cancelados"}];
const hojeBR = () => new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export function Financeiro() {
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const categoria = filtros.some(f => f.value === params.get("categoria")) ? params.get("categoria")! : "todos";
    const cliente = params.get("cliente") ?? "";
    const projeto = params.get("projeto") ?? "";
    const mes = params.get("mes") ?? hojeBR().slice(0,7);
    const pagina = /^[1-9]\d{0,5}$/.test(params.get("pagina") ?? "") ? Number(params.get("pagina")) : 1;
    const consulta = new URLSearchParams({categoria, pagina:String(pagina), ...(cliente ? {cliente} : {}), ...(projeto ? {projeto} : {}), ...(categoria === "recebidos" ? {mes} : {})}).toString();
    const [resultado,setResultado] = useState<{consulta:string;dados:Detalhes}|null>(null);
    const [erro,setErro] = useState<string|null>(null);
    const [operacao,setOperacao] = useState<Operacao|null>(null);
    const [erroOperacao,setErroOperacao] = useState<string|null>(null);
    const [salvando,setSalvando] = useState(false);
    const [revisao,setRevisao] = useState(0);
    const [aviso,setAviso] = useState<string|null>(null);
    const bloqueio = useRef(false);
    const detalhesRef = useRef<HTMLDivElement>(null);
    const focoInicial = useRef(params.has("categoria"));
    const dados = resultado?.consulta === consulta ? resultado.dados : null;
    const carregar = useCallback(async (signal:AbortSignal) => {
        try {
            const resposta = await fetch(`/api/dashboard/financeiro/detalhes?${consulta}`, {signal,cache:"no-store"});
            const corpo = await resposta.json();
            if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível carregar os registros");
            if (!signal.aborted) {setResultado({consulta,dados:corpo});setErro(null);}
        } catch(e) {if (!signal.aborted) setErro(e instanceof Error ? e.message : "Não foi possível carregar os registros");}
    }, [consulta]);
    const atualizar = useAtualizacaoPeriodica(carregar,30000);
    useEffect(() => {
        if (!dados || !focoInicial.current) return;
        focoInicial.current = false;
        detalhesRef.current?.scrollIntoView({block:"start"});
    }, [dados]);

    function alterar(chave:string, valor:string) {
        const novos = new URLSearchParams(params);
        if (valor) novos.set(chave,valor); else novos.delete(chave);
        if (chave !== "pagina") novos.delete("pagina");
        if (chave === "cliente") novos.delete("projeto");
        setErro(null);
        setParams(novos);
    }
    function selecionar(valor:string) {
        //cards do resumo geral sempre consultam todos os clientes e projetos
        setParams(new URLSearchParams({categoria:valor}));
        setErro(null);
        detalhesRef.current?.scrollIntoView({block:"start"});
    }
    function abrir(item:Item, conversa = false) {
        const destino = conversa ? caminhoMensagens(item.clienteId,item.projetoId) : `/projetos/${item.projetoId}?marco=${item.marcoId}`;
        navigate(destino,{state:{...registrarOrigem(location.pathname + location.search,location.state), ...(conversa ? {projetoArquivado:item.arquivado} : {})}});
    }
    function iniciar(item:Item,tipo:Operacao["tipo"]) {
        setErroOperacao(null);setAviso(null);
        setOperacao({tipo,item,pagamentoId:crypto.randomUUID(),valor:item.valor,data:hojeBR()});
    }
    async function confirmar() {
        if (!operacao || bloqueio.current) return;
        bloqueio.current = true;setSalvando(true);setErroOperacao(null);
        const {item,tipo,pagamentoId,valor,data} = operacao;
        try {
            const resposta = await fetch(`/api/projetos/${item.projetoId}/marcos/${item.marcoId}/${tipo === "cobrar" ? "cobranca" : tipo === "lembrar" ? "lembretes" : "pagamentos"}`,{
                method:tipo === "cobrar" ? "PATCH" : "POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tipo === "receber" ? {pagamentoId,valor,recebidoEm:data} : {})});
            const corpo = await resposta.json();
            if (!resposta.ok) throw new Error(corpo.erro ?? "Não foi possível concluir a operação");
            setOperacao(null);setAviso(tipo === "cobrar" ? "Cobrança iniciada" : tipo === "lembrar" ? (corpo.conversa ? "Lembrete enviado no portal e na conversa" : "Lembrete enviado no portal") : "Pagamento registrado");setRevisao(v=>v+1);atualizar();
        } catch(e) {setErroOperacao(e instanceof Error ? e.message : "Não foi possível concluir a operação");}
        finally {bloqueio.current=false;setSalvando(false);}
    }
    const historico = categoria === "recebidos";
    const totalPaginas = Math.max(1,Math.ceil((dados?.quantidade ?? 0)/25));
    const opcoes = resultado?.dados;
    return <Stack gap="lg">
        <Stack gap={2}><Title order={1}>Financeiro</Title><Text c="dimmed">Acompanhe recebimentos, previsões e cobranças.</Text></Stack>
        <FinanceiroDashboard completo onSelecionar={selecionar} revisao={revisao}/>
        <Card withBorder padding="md"><Stack gap="md" ref={detalhesRef} style={{scrollMarginTop:80}}>
            <Group justify="space-between"><Title order={3}>Registros financeiros</Title><Button size="xs" variant="subtle" onClick={atualizar}>Atualizar</Button></Group>
            <Text size="xs" c="dimmed">Os filtros abaixo afetam os registros e o total da seleção, não o resumo geral acima.</Text>
            <SimpleGrid cols={{base:1,sm:2,lg:4}}>
                <Select label="Situação" data={filtros} value={categoria} allowDeselect={false} onChange={v=>alterar("categoria",v ?? "todos")}/>
                <Select searchable clearable label="Cliente" placeholder="Todos" data={opcoes?.clientes ?? []} value={cliente || null} onChange={v=>alterar("cliente",v ?? "")}/>
                <Select searchable clearable label="Projeto" placeholder="Todos" data={opcoes?.projetos.filter(p=>!cliente || p.clienteId===cliente).map(p=>({value:p.value,label:p.label})) ?? []} value={projeto || null} onChange={v=>alterar("projeto",v ?? "")}/>
                {historico && <TextInput type="month" label="Mês do recebimento" value={mes} max={hojeBR().slice(0,7)} onChange={e=>{if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(e.currentTarget.value)) alterar("mes",e.currentTarget.value);}}/>}
            </SimpleGrid>
            <Group justify="space-between"><Button size="xs" variant="subtle" onClick={()=>{setParams(new URLSearchParams());setErro(null);}}>Limpar filtros</Button>{dados && <Stack gap={2} align="flex-end"><Text size="xs" c="dimmed">{historico ? "Total recebido (sem anulados)" : "Saldo total da seleção"} · {dados.quantidade} registros</Text><Text fw={700}>{formatarValor(dados.total)}</Text></Stack>}</Group>
            {aviso && <Alert color="green" withCloseButton onClose={()=>setAviso(null)}>{aviso}</Alert>}
            {erro && <Alert color="red">{erro}{dados && " · Última consulta disponível."}</Alert>}
            {!dados && !erro && <Text size="sm" c="dimmed">Carregando registros...</Text>}
            {dados && dados.itens.length===0 && <Text size="sm" c="dimmed">Nenhum registro nesta seleção.</Text>}
            {dados?.itens.map(item => {
                const pendente = !historico && Number(item.valor)>0 && !item.arquivado;
                const podeLembrar = pendente && (item.cobrancaIniciada || item.bloqueiaProgresso || (item.data !== null && item.data <= hojeBR()));
                const lembreteRecente = !!item.ultimoLembrete && Date.now() - new Date(item.ultimoLembrete).getTime() < 86400000;
                return <Card key={item.id} withBorder padding="sm"><Stack gap="xs">
                    <Group justify="space-between" align="start" wrap="wrap"><Stack gap={2}><Text fw={600}>{item.marco}</Text><Text size="xs" c="dimmed">{item.projeto} · {item.cliente}</Text><Text size="xs" c="dimmed">{historico ? "Recebido em" : "Vencimento"}: {formatarPrazo(item.data)}</Text></Stack><Text fw={700} td={item.anuladoEm ? "line-through" : undefined} c={item.anuladoEm ? "dimmed" : historico ? "green" : item.categoria === "atrasado" && Number(item.valor)>0 ? "red" : undefined}>{formatarValor(item.valor)}</Text></Group>
                    <Group gap={5}>{historico ? <Badge color={item.anuladoEm ? "gray" : "green"} variant="light">{item.anuladoEm ? "Anulado" : "Recebido"}</Badge> : <><Badge color={item.categoria === "atrasado" && Number(item.valor)>0 ? "red" : "gray"} variant="light">{Number(item.valor)===0 ? "Sem saldo exigível" : filtros.find(f=>f.value===item.categoria)?.label ?? item.categoria}</Badge><Badge color="gray" variant="outline">{item.cobrancaIniciada ? "Cobrança iniciada" : "Cobrança não iniciada"}</Badge>{item.saldoDispensado && <Badge color="gray">Saldo dispensado</Badge>}{item.bloqueiaProgresso && Number(item.valor)>0 && <Badge color="orange">Aguardando pagamento</Badge>}</>}{item.arquivado && <Badge color="gray">Arquivado</Badge>}{(item.status==="cancelado" || item.projetoStatus==="cancelado") && <Badge color="gray">Cancelado</Badge>}</Group>
                    {!historico && <Text size="xs" c="dimmed">Valor do marco: {formatarValor(item.valorMarco)} · Recebido: {formatarValor(item.recebido)}</Text>}
                    {!historico && item.ultimoLembrete && <Text size="xs" c="dimmed">Último lembrete: {new Date(item.ultimoLembrete).toLocaleString("pt-BR")}</Text>}
                    {item.anuladoEm && <Text size="xs" c="dimmed">Anulado em {new Date(item.anuladoEm).toLocaleString("pt-BR")}</Text>}
                    <Group gap="xs" wrap="wrap">
                        <Tooltip label="Abre o marco na ficha do projeto." events={{hover:true,focus:true,touch:true}}><Button size="xs" variant="default" onClick={()=>abrir(item)}>Abrir marco</Button></Tooltip>
                        <Tooltip label="Abre a conversa vinculada ao projeto." events={{hover:true,focus:true,touch:true}}><Button size="xs" variant="subtle" onClick={()=>abrir(item,true)}>Abrir conversa</Button></Tooltip>
                        {pendente && !item.cobrancaIniciada && <Tooltip label="Sinaliza a cobrança; não registra pagamento." events={{hover:true,focus:true,touch:true}}><Button size="xs" variant="light" color="orange" onClick={()=>iniciar(item,"cobrar")}>Iniciar cobrança</Button></Tooltip>}
                        {podeLembrar && <Tooltip label={lembreteRecente ? "Um lembrete por marco a cada 24 horas." : "Envia um lembrete no portal e na conversa, se disponível."} events={{hover:true,focus:true,touch:true}}><span><Button size="xs" variant="light" disabled={lembreteRecente} onClick={()=>iniciar(item,"lembrar")}>Lembrar cliente</Button></span></Tooltip>}
                        {pendente && <Tooltip label="Registra dinheiro efetivamente recebido." events={{hover:true,focus:true,touch:true}}><Button size="xs" variant="light" color="green" onClick={()=>iniciar(item,"receber")}>Registrar pagamento</Button></Tooltip>}
                    </Group>
                </Stack></Card>;
            })}
            {dados && totalPaginas>1 && <Pagination total={totalPaginas} value={Math.min(pagina,totalPaginas)} onChange={v=>alterar("pagina",String(v))}/>}
            {dados && pagina>totalPaginas && <Button variant="light" onClick={()=>alterar("pagina",String(totalPaginas))}>Voltar à última página disponível</Button>}
        </Stack></Card>
        <Modal opened={!!operacao} onClose={()=>{if (!salvando) setOperacao(null);}} title={operacao?.tipo==="cobrar" ? "Iniciar cobrança" : operacao?.tipo==="lembrar" ? "Lembrar cliente" : "Registrar pagamento"} closeOnClickOutside={!salvando} closeOnEscape={!salvando} withCloseButton={!salvando}>
            {operacao && <Stack gap="sm"><Text fw={600}>{operacao.item.marco}</Text><Text size="sm" c="dimmed">Saldo pendente: {formatarValor(operacao.item.valor)}</Text>
                {operacao.tipo==="cobrar" ? <Text size="sm">O marco será sinalizado como cobrado e o cliente receberá a atualização do projeto. Nenhum pagamento será registrado.</Text> : operacao.tipo==="lembrar" ? <Text size="sm">Envia uma notificação importante e uma mensagem na conversa do projeto, se estiver ativa. Não altera o saldo.</Text> : <><Text size="sm">Informe somente o dinheiro efetivamente recebido.</Text><TextInput label="Valor recebido (R$)" inputMode="decimal" maxLength={13} value={operacao.valor} disabled={salvando} onChange={e=>{const valor=e.currentTarget.value;setOperacao(o=>o?{...o,valor}:o);}}/><TextInput label="Data do recebimento" type="date" max={hojeBR()} value={operacao.data} disabled={salvando} onChange={e=>{const data=e.currentTarget.value;setOperacao(o=>o?{...o,data}:o);}}/></>}
                {erroOperacao && <Alert color="red">{erroOperacao}</Alert>}<Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={()=>setOperacao(null)}>Cancelar</Button><Button loading={salvando} disabled={operacao.tipo==="receber" && (!operacao.valor.trim() || !operacao.data)} onClick={()=>void confirmar()}>Confirmar</Button></Group>
            </Stack>}
        </Modal>
    </Stack>;
}
