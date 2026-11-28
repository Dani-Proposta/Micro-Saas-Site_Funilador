import { apiFetch } from "../lib/api-fetch";
import { useExpressivo } from "../lib/contextoAparencia";
import { NumeroModerno, ProgressoModerno } from "./InteracaoModerna";
import { CampoData } from "./CampoData";
import chat from "../styles/Chat.module.css";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { Link } from "react-router";
import { formatarPrazo, formatarValor } from "../lib/comercial";

export type EstadoProposta = "pendente" | "aceita" | "recusada" | "contraproposta" | "retirada";
export type Proposta = {
    id: string; tipo: "marco" | "dados"; autorTipo: "admin" | "cliente"; titulo: string; descricao: string | null;
    valor: string | null; prazoEntrega: string | null; vencimento: string | null; novoTotal: string | null; novoPrazo: string | null;
    totalBase: string | null; prazoBase: string | null; status: EstadoProposta; marcoId: string | null; anteriorId: string | null;
};
type Edicao = {tipo: Proposta["tipo"]; titulo: string; descricao: string; valor: string; prazoEntrega: string; vencimento: string; novoTotal: string; novoPrazo: string};
type Contexto = {endpoint: string; lado: "admin" | "cliente"; onAlterado: () => void};
const estados: Record<EstadoProposta, string> = {pendente: "Aguardando resposta", aceita: "Aceita", recusada: "Recusada", contraproposta: "Contraproposta enviada", retirada: "Retirada"};
const cores: Record<EstadoProposta, string> = {pendente: "yellow", aceita: "green", recusada: "red", contraproposta: "blue", retirada: "gray"};

function novaEdicao(p?: Proposta): Edicao {
    return {tipo: p?.tipo ?? "marco", titulo: p?.titulo ?? "", descricao: p?.descricao ?? "", valor: p?.valor ?? "", prazoEntrega: p?.prazoEntrega ?? "", vencimento: p?.vencimento ?? "", novoTotal: p?.novoTotal ?? "", novoPrazo: p?.novoPrazo ?? ""};
}

async function enviarProposta(url: string, metodo: "POST" | "PATCH", corpo: unknown) {
    const resposta = await apiFetch(url, {method: metodo, headers: {"Content-Type": "application/json"}, body: JSON.stringify(corpo)});
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível concluir a operação");
}

//formulário de proposta e contraproposta
export function FormularioProposta({endpoint, lado, onAlterado, anterior, onFechar}: Contexto & {anterior?: Proposta; onFechar: () => void}) {
    const [edicao, setEdicao] = useState(() => novaEdicao(anterior));
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const bloqueio = useRef(false);
    function alterar<K extends keyof Edicao>(campo: K, valor: Edicao[K]) {setEdicao(a => ({...a, [campo]: valor}));}
    async function salvar() {
        if (bloqueio.current) return;
        bloqueio.current = true; setSalvando(true); setErro(null);
        try {
            const dados = {...edicao, valor: edicao.tipo === "marco" ? edicao.valor : "", prazoEntrega: edicao.tipo === "marco" ? edicao.prazoEntrega : "", vencimento: edicao.tipo === "marco" ? edicao.vencimento : ""};
            await enviarProposta(anterior ? `${endpoint}/${anterior.id}` : endpoint, anterior ? "PATCH" : "POST", anterior ? {acao: "contrapor", proposta: dados} : dados);
            onAlterado(); onFechar();
        } catch (e) {setErro(e instanceof Error ? e.message : "Falha ao enviar proposta");}
        finally {bloqueio.current = false; setSalvando(false);}
    }
    return <Modal opened onClose={() => {if (!salvando) onFechar();}} title={anterior ? "Enviar contraproposta" : "Nova proposta"} centered size="lg" classNames={{content: chat.modalProposta}} closeOnClickOutside={!salvando} closeOnEscape={!salvando} withCloseButton={!salvando}>
        <Stack gap="sm">
            <Select label="Tipo" data={[{value: "marco", label: "Novo marco"}, {value: "dados", label: "Valor ou prazo do projeto"}]} value={edicao.tipo} allowDeselect={false} disabled={salvando || !!anterior} onChange={v => {if (v === "marco" || v === "dados") alterar("tipo", v);}}/>
            <TextInput label="Título" required maxLength={150} value={edicao.titulo} disabled={salvando} onChange={e => alterar("titulo", e.currentTarget.value)}/>
            <Textarea label="Descrição" autosize minRows={2} maxRows={6} maxLength={5000} value={edicao.descricao} disabled={salvando} onChange={e => alterar("descricao", e.currentTarget.value)}/>
            {edicao.tipo === "marco" && <fieldset className={chat.secaoProposta}><legend>Dados do marco</legend><Stack gap="sm"><TextInput label="Valor do marco" aria-label="Valor do marco (R$)" leftSection={<span className="funilador-moeda" aria-hidden="true">R$</span>} leftSectionWidth={36} leftSectionPointerEvents="none" inputMode="decimal" maxLength={13} value={edicao.valor} disabled={salvando} onChange={e => alterar("valor", e.currentTarget.value)}/><SimpleGrid cols={{base: 1, sm: 2}} className={`${chat.datasProposta} funilador-campos-alinhados`}><CampoData label="Prazo de entrega" value={edicao.prazoEntrega} disabled={salvando} onChange={valor => alterar("prazoEntrega", valor)}/><CampoData label="Vencimento do pagamento" value={edicao.vencimento} disabled={salvando} onChange={valor => alterar("vencimento", valor)}/></SimpleGrid></Stack></fieldset>}
            <fieldset className={chat.secaoProposta}><legend>Alterações no projeto</legend><Stack gap="sm">
            <TextInput label="Novo valor total do projeto" aria-label="Novo valor total do projeto (R$)" leftSection={<span className="funilador-moeda" aria-hidden="true">R$</span>} leftSectionWidth={36} leftSectionPointerEvents="none" description="Deixe vazio para manter o valor atual" inputMode="decimal" maxLength={13} value={edicao.novoTotal} disabled={salvando} onChange={e => alterar("novoTotal", e.currentTarget.value)}/>
            <CampoData label="Novo prazo do projeto" description="Deixe vazio para manter o prazo atual" value={edicao.novoPrazo} disabled={salvando} onChange={valor => alterar("novoPrazo", valor)}/>
            </Stack></fieldset>
            <Text size="xs" c="dimmed">{lado === "cliente" ? "A proposta depende do aceite da administração." : "A proposta depende do aceite do cliente."} Nenhum valor será alterado antes do aceite.</Text>
            {erro && <Alert color="red">{erro}</Alert>}
            <Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={onFechar}>Cancelar</Button><Button loading={salvando} disabled={!edicao.titulo.trim() || (edicao.tipo === "dados" && !edicao.novoTotal.trim() && !edicao.novoPrazo)} onClick={() => void salvar()}>Enviar proposta</Button></Group>
        </Stack>
    </Modal>;
}

//card dentro do histórico
export function CartaoProposta({proposta, endpoint, lado, somenteLeitura, onAlterado}: Contexto & {proposta: Proposta; somenteLeitura: boolean}) {
    const [decisao, setDecisao] = useState<"aceitar" | "recusar" | "retirar" | null>(null);
    const [contrapor, setContrapor] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [resultado, setResultado] = useState<EstadoProposta | null>(null);
    const bloqueio = useRef(false);
    const status = proposta.status === "pendente" ? resultado ?? proposta.status : proposta.status;
    const propria = proposta.autorTipo === lado;
    async function confirmar() {
        if (!decisao || bloqueio.current) return;
        bloqueio.current = true; setSalvando(true); setErro(null);
        try {
            await enviarProposta(`${endpoint}/${proposta.id}`, "PATCH", {acao: decisao});
            setResultado(decisao === "aceitar" ? "aceita" : decisao === "recusar" ? "recusada" : "retirada");
            setDecisao(null); onAlterado();
        } catch (e) {setErro(e instanceof Error ? e.message : "Falha ao responder proposta"); onAlterado();}
        finally {bloqueio.current = false; setSalvando(false);}
    }
    return <Card className={chat.proposta} withBorder padding="sm" c="var(--mantine-color-text)" miw={0} style={{overflowWrap: "anywhere"}}><Stack gap="xs">
        <Group justify="space-between" gap="xs"><Text size="xs" fw={600}>{proposta.anteriorId ? "Contraproposta" : proposta.tipo === "marco" ? "Proposta de marco" : "Proposta comercial"}</Text><Badge color={cores[status]} variant="light" size="sm">{estados[status]}</Badge></Group>
        <Text fw={600}>{proposta.titulo}</Text>
        {proposta.descricao && <Text size="sm" style={{whiteSpace: "pre-wrap"}}>{proposta.descricao}</Text>}
        {proposta.tipo === "marco" && <><Text size="sm">Valor do marco: {formatarValor(proposta.valor)}</Text><Text size="xs" c="dimmed">Entrega: {formatarPrazo(proposta.prazoEntrega)} · Pagamento: {formatarPrazo(proposta.vencimento)}</Text></>}
        <Text size="sm">Valor total do projeto: {proposta.novoTotal !== null ? `${formatarValor(proposta.totalBase)} → ${formatarValor(proposta.novoTotal)}` : `${formatarValor(proposta.totalBase)} (mantido)`}</Text>
        <Text size="sm">Prazo do projeto: {proposta.novoPrazo !== null ? `${formatarPrazo(proposta.prazoBase)} → ${formatarPrazo(proposta.novoPrazo)}` : `${formatarPrazo(proposta.prazoBase)} (mantido)`}</Text>
        {!somenteLeitura && status === "pendente" && <Group gap="xs">{propria ? <Button size="compact-xs" variant="subtle" color="gray" onClick={() => {setErro(null); setDecisao("retirar");}}>Retirar</Button> : <><Button size="compact-xs" color="green" onClick={() => {setErro(null); setDecisao("aceitar");}}>Aceitar</Button><Button size="compact-xs" variant="light" onClick={() => setContrapor(true)}>Contraproposta</Button><Button size="compact-xs" variant="subtle" color="red" onClick={() => {setErro(null); setDecisao("recusar");}}>Recusar</Button></>}</Group>}
        {decisao && <Modal opened onClose={() => {if (!salvando) setDecisao(null);}} title={decisao === "aceitar" ? "Aceitar proposta" : decisao === "recusar" ? "Recusar proposta" : "Retirar proposta"} centered closeOnClickOutside={!salvando} closeOnEscape={!salvando} withCloseButton={!salvando}><Stack gap="sm"><Text size="sm">{decisao === "aceitar" ? "Os termos exibidos serão aplicados ao projeto. Confirme se estão corretos." : "A proposta será encerrada e ficará no histórico."}</Text><Text fw={600}>{proposta.titulo}</Text>{erro && <Alert color="red">{erro}</Alert>}<Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => setDecisao(null)}>Voltar</Button><Button loading={salvando} disabled={somenteLeitura || status !== "pendente"} color={decisao === "aceitar" ? "green" : "red"} onClick={() => void confirmar()}>Confirmar</Button></Group></Stack></Modal>}
        {contrapor && <FormularioProposta endpoint={endpoint} lado={lado} anterior={proposta} onAlterado={() => {setResultado("contraproposta"); onAlterado();}} onFechar={() => setContrapor(false)}/>}
    </Stack></Card>;
}

//consultar projeto sem sair da conversa
export function ResumoProjetoChat({projetoId, lado, onFechar}: {projetoId: string; lado: "admin" | "cliente"; onFechar: () => void}) {
    const expressivo = useExpressivo();
    const [dados, setDados] = useState<{valorAcordado: string | null; prazoAcordado: string | null; totalPago: string; progresso: number | null; marcos: {id: string; titulo: string; status: string}[]} | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const endpoint = lado === "admin" ? `/api/projetos/${projetoId}/marcos` : `/api/me/projetos/${projetoId}/marcos`;
    useEffect(() => {
        const controller = new AbortController();
        async function carregar() {
            try {
                const resposta = await apiFetch(endpoint, {signal: controller.signal, cache: "no-store"});
                const resultado = await resposta.json();
                if (!resposta.ok) throw new Error(resultado.erro ?? "Projeto indisponível");
                if (!controller.signal.aborted) {setDados(resultado); setErro(null);}
            } catch (e) {if (!controller.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao carregar projeto");}
        }
        void carregar(); return () => controller.abort();
    }, [endpoint]);
    return <Modal opened onClose={onFechar} title="Dados do projeto" centered size={expressivo ? "xl" : undefined}><Stack gap={expressivo ? "lg" : "sm"}>{erro ? <Alert color="red">{erro}</Alert> : !dados ? <Text size="sm">Carregando...</Text> : expressivo ? <><div className="ex-resumo-projeto"><div><Text c="dimmed" size="xs">Valor acordado</Text><Text fw={800} size="xl"><NumeroModerno valor={dados.valorAcordado} moeda/></Text></div><div><Text c="dimmed" size="xs">{lado === "admin" ? "Recebido" : "Total pago"}</Text><Text fw={800} size="xl"><NumeroModerno valor={dados.totalPago} moeda/></Text></div><div><Text c="dimmed" size="xs">Prazo acordado</Text><Text fw={650}>{formatarPrazo(dados.prazoAcordado)}</Text></div><div><Text c="dimmed" size="xs">Marcos concluídos</Text><Text fw={800} size="xl">{dados.marcos.filter(m=>m.status==="concluido").length}/{dados.marcos.filter(m=>m.status!=="cancelado").length}</Text></div></div><Card withBorder><Stack gap="sm"><Group justify="space-between"><Text fw={700}>Progresso do projeto</Text><Text fw={800} size="xl"><NumeroModerno valor={dados.progresso} percentual/></Text></Group>{dados.progresso!=null&&<ProgressoModerno valor={dados.progresso}/>}</Stack></Card></> : <><Text size="sm">Valor acordado: {formatarValor(dados.valorAcordado)}</Text><Text size="sm">Prazo acordado: {formatarPrazo(dados.prazoAcordado)}</Text><Text size="sm">{lado === "admin" ? "Recebido" : "Total pago"}: {formatarValor(dados.totalPago)}</Text><Text size="sm">Progresso: {dados.progresso == null ? "Não definido" : `${dados.progresso}%`}</Text><Text size="sm">Marcos concluídos: {dados.marcos.filter(m => m.status === "concluido").length}/{dados.marcos.filter(m => m.status !== "cancelado").length}</Text></>}<Button component={Link} to={lado === "admin" ? `/projetos/${projetoId}` : `/portal/projetos?projeto=${projetoId}`} variant="light">Abrir projeto</Button></Stack></Modal>;
}
