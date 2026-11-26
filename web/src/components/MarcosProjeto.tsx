import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Divider, Group, Loader, Progress, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { formatarPrazo, formatarValor } from "../lib/comercial";
import type { DadosProjeto } from "../lib/comercial";

type StatusMarco = "pendente" | "em_andamento" | "aguardando_validacao" | "concluido" | "cancelado";
type Pagamento = {id: string; valor: string; recebidoEm: string};
type Marco = {
    id: string;
    titulo: string;
    descricao: string | null;
    status: StatusMarco;
    valor: string | null;
    recebido: string;
    saldo: string | null;
    prazoEntrega: string | null;
    vencimento: string | null;
    cobrancaIniciada: boolean;
    bloqueiaProgresso: boolean;
    saldoDispensado: boolean;
    pagamentos: Pagamento[];
};
export type ResumoMarcos = {id: string; modoProgresso: DadosProjeto["modoProgresso"]; progresso: number | null; atualizadaEm: string; marcos: Marco[]};
type Edicao = {id: string | null; titulo: string; descricao: string; status: StatusMarco; valor: string; prazoEntrega: string; vencimento: string; cobrancaIniciada: boolean; bloqueiaProgresso: boolean; saldoDispensado: boolean};
type Projeto = DadosProjeto & {id: string; status: string; arquivadaEm?: string | null};

const statusMarcos: {value: StatusMarco; label: string}[] = [{value: "pendente", label: "Pendente"}, {value: "em_andamento", label: "Em andamento"}, {value: "aguardando_validacao", label: "Aguardando validação"}, {value: "concluido", label: "Concluído"}, {value: "cancelado", label: "Cancelado"}];
const cores: Record<StatusMarco, string> = {pendente: "gray", em_andamento: "blue", aguardando_validacao: "yellow", concluido: "green", cancelado: "red"};

//dados iniciais do marco
function novaEdicao(marco?: Marco): Edicao {
    return {id: marco?.id ?? null, titulo: marco?.titulo ?? "", descricao: marco?.descricao ?? "", status: marco?.status ?? "pendente", valor: marco?.valor ?? "", prazoEntrega: marco?.prazoEntrega ?? "", vencimento: marco?.vencimento ?? "", cobrancaIniciada: marco?.cobrancaIniciada ?? false, bloqueiaProgresso: marco?.bloqueiaProgresso ?? false, saldoDispensado: marco?.saldoDispensado ?? false};
}

//status financeiro do marco
function statusPagamento(marco: Marco, cancelado: boolean) {
    if (marco.valor === null || Number(marco.valor) === 0) return "Sem cobrança";
    if (marco.saldoDispensado) return "Saldo dispensado";
    if (Number(marco.saldo) === 0) return "Pago";
    if (cancelado && !["concluido", "cancelado", "aguardando_validacao"].includes(marco.status) && !marco.cobrancaIniciada) return "Previsão suspensa";
    if (Number(marco.recebido) > 0) return "Parcialmente pago";
    if (marco.cobrancaIniciada || marco.status === "concluido" || marco.status === "cancelado") return "Aguardando pagamento";
    return "Não cobrado";
}

//admin e cliente: acompanhar marcos
export function MarcosProjeto({projeto, lado = "admin", onAtualizado}: {projeto: Projeto; lado?: "admin" | "cliente"; onAtualizado?: (dados: ResumoMarcos) => void}) {
    const admin = lado === "admin";
    const endpoint = admin ? `/api/projetos/${projeto.id}/marcos` : `/api/me/projetos/${projeto.id}/marcos`;
    const [aberto, setAberto] = useState(admin);
    const [resumo, setResumo] = useState<ResumoMarcos | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [edicao, setEdicao] = useState<Edicao | null>(null);
    const [pagamento, setPagamento] = useState<{marcoId: string; pagamentoId: string; valor: string; recebidoEm: string} | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [revisao, setRevisao] = useState(0);
    const versao = useRef(0);
    const cancelado = projeto.status === "cancelado";
    const somenteLeitura = !admin || !!projeto.arquivadaEm;
    const marcos = resumo?.marcos ?? [];
    const ativos = marcos.filter(m => m.status !== "cancelado");
    const concluidos = ativos.filter(m => m.status === "concluido").length;
    const progresso = projeto.modoProgresso === "marcos" ? (ativos.length ? Math.round(100 * concluidos / ativos.length) : 0) : projeto.progresso;
    const aguardando = !cancelado && marcos.some(m => m.status !== "cancelado" && m.bloqueiaProgresso && Number(m.saldo) > 0 && (m.cobrancaIniciada || m.status === "concluido"));

    useEffect(() => {
        if (!aberto) return;
        const controller = new AbortController();
        const atual = versao.current;
        async function carregar() {
            try {
                const resposta = await fetch(endpoint, {signal: controller.signal, cache: "no-store"});
                const dados = await resposta.json();
                if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível carregar os marcos");
                if (!controller.signal.aborted && atual === versao.current) {setResumo(dados); setErro(null); onAtualizado?.(dados);}
            } catch (e) {
                if (!controller.signal.aborted && atual === versao.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os marcos");
            }
        }
        void carregar();
        return () => controller.abort();
    }, [aberto, endpoint, revisao, onAtualizado]);

    function alterarEdicao<K extends keyof Edicao>(campo: K, valor: Edicao[K]) {
        setEdicao(atual => atual ? {...atual, [campo]: valor} : atual);
    }

    async function enviar(url: string, method: "POST" | "PATCH", corpo: unknown) {
        if (somenteLeitura || salvando) return false;
        versao.current++;
        setSalvando(true);
        setErro(null);
        try {
            const resposta = await fetch(url, {method, headers: {"Content-Type": "application/json"}, body: JSON.stringify(corpo)});
            const dados: ResumoMarcos & {erro?: string} = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível salvar");
            setResumo(dados);
            onAtualizado?.(dados);
            return true;
        } catch (e) {setErro(e instanceof Error ? e.message : "Não foi possível salvar"); return false;}
        finally {setSalvando(false);}
    }

    async function salvarMarco() {
        if (!edicao) return;
        const {id, ...dados} = edicao;
        if (await enviar(id ? `${endpoint}/${id}` : endpoint, id ? "PATCH" : "POST", dados)) setEdicao(null);
    }

    async function concluirMarco(marco: Marco, concluido: boolean) {
        const {id, ...dados} = novaEdicao(marco);
        await enviar(`${endpoint}/${id}`, "PATCH", {...dados, status: concluido ? "concluido" : "pendente", saldoDispensado: false});
    }

    async function registrarPagamento() {
        if (!pagamento) return;
        const {marcoId, ...dados} = pagamento;
        if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(dados.valor.trim()) || Number(dados.valor.replace(",", ".")) <= 0) {setErro("Informe um valor válido"); return;}
        if (!window.confirm(`Registrar recebimento de ${formatarValor(dados.valor.replace(",", "."))}?`)) return;
        if (await enviar(`${endpoint}/${marcoId}/pagamentos`, "POST", dados)) setPagamento(null);
    }

    function abrirPagamento(marco: Marco) {
        const hoje = new Intl.DateTimeFormat("sv-SE", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
        setPagamento({marcoId: marco.id, pagamentoId: crypto.randomUUID(), valor: marco.saldo ?? "", recebidoEm: hoje});
        setErro(null);
    }

    const editor = edicao && <Card withBorder padding="sm"><Stack gap="sm">
        <Title order={5}>{edicao.id ? "Editar marco" : "Novo marco"}</Title>
        <TextInput label="Título" maxLength={150} value={edicao.titulo} onChange={e => alterarEdicao("titulo", e.currentTarget.value)} disabled={salvando}/>
        <Textarea label="Descrição" autosize minRows={2} maxRows={6} maxLength={5000} value={edicao.descricao} onChange={e => alterarEdicao("descricao", e.currentTarget.value)} disabled={salvando}/>
        <SimpleGrid cols={{base: 1, sm: 2}}>
            <Select label="Status" data={cancelado ? statusMarcos.filter(s => s.value === edicao.status || s.value === "cancelado") : statusMarcos} value={edicao.status} allowDeselect={false} disabled={salvando} onChange={v => {if (v) setEdicao(atual => atual ? {...atual, status: v as StatusMarco, saldoDispensado: v === "cancelado" && atual.saldoDispensado} : atual);}}/>
            <TextInput label="Valor (R$)" inputMode="decimal" maxLength={13} value={edicao.valor} onChange={e => alterarEdicao("valor", e.currentTarget.value)} disabled={salvando}/>
            <TextInput label="Prazo de entrega" type="date" value={edicao.prazoEntrega} onChange={e => alterarEdicao("prazoEntrega", e.currentTarget.value)} disabled={salvando}/>
            <TextInput label="Vencimento do pagamento" type="date" value={edicao.vencimento} onChange={e => alterarEdicao("vencimento", e.currentTarget.value)} disabled={salvando}/>
        </SimpleGrid>
        <Checkbox label="Cobrança iniciada" checked={edicao.cobrancaIniciada} onChange={e => alterarEdicao("cobrancaIniciada", e.currentTarget.checked)} disabled={salvando}/>
        <Checkbox label="Aguardar pagamento para prosseguir" checked={edicao.bloqueiaProgresso} onChange={e => alterarEdicao("bloqueiaProgresso", e.currentTarget.checked)} disabled={salvando}/>
        {edicao.status === "cancelado" && <Checkbox label="Dispensar saldo restante" checked={edicao.saldoDispensado} onChange={e => alterarEdicao("saldoDispensado", e.currentTarget.checked)} disabled={salvando}/>}
        <Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => {setEdicao(null); setErro(null);}}>Cancelar</Button><Button loading={salvando} disabled={!edicao.titulo.trim()} onClick={() => void salvarMarco()}>Salvar</Button></Group>
    </Stack></Card>;

    return <Card withBorder padding={admin ? "lg" : "sm"}><Stack gap="sm">
        <Group justify="space-between" wrap="wrap"><Title order={4}>Marcos</Title><Group gap="xs"><Button size="xs" variant="subtle" disabled={salvando} onClick={() => setAberto(v => !v)}>{aberto ? "Recolher" : "Ver marcos"}</Button>{aberto && <Button size="xs" variant="subtle" disabled={salvando || !!edicao || !!pagamento} onClick={() => setRevisao(v => v + 1)}>Atualizar</Button>}{aberto && !somenteLeitura && !cancelado && <Button size="xs" disabled={!resumo || salvando || !!edicao || !!pagamento} onClick={() => setEdicao(novaEdicao())}>+ Novo marco</Button>}</Group></Group>
        {aberto && <>
            {!resumo && !erro && <Loader size="sm"/>}
            {erro && <Alert color="red">{erro}</Alert>}
            {resumo && <><Group justify="space-between"><Text size="sm" c="dimmed">{concluidos} de {ativos.length} concluídos</Text><Text size="sm">{projeto.modoProgresso === "marcos" ? "Por marcos" : "Manual"} · {progresso == null ? "Não definido" : `${progresso}%`}</Text></Group>{progresso != null && <Progress value={progresso} color="violet"/>}</>}
            {aguardando && <Alert color="yellow">Aguardando pagamento para prosseguir</Alert>}
            {resumo && !marcos.length && <Text size="sm" c="dimmed">Nenhum marco cadastrado</Text>}
            {edicao && !edicao.id && !somenteLeitura && editor}
            {marcos.map(marco => <Card key={marco.id} withBorder padding="sm"><Stack gap="xs">
                <Group justify="space-between" align="flex-start"><Group gap="xs" wrap="nowrap" style={{minWidth: 0, flex: 1}}>{!somenteLeitura && !cancelado && marco.status !== "cancelado" && <Checkbox aria-label={`Concluir ${marco.titulo}`} checked={marco.status === "concluido"} disabled={salvando || !!edicao || !!pagamento} onChange={e => void concluirMarco(marco, e.currentTarget.checked)}/>}<Text fw={600} style={{overflowWrap: "anywhere", minWidth: 0}}>{marco.titulo}</Text></Group><Badge color={cores[marco.status]}>{statusMarcos.find(s => s.value === marco.status)?.label}</Badge></Group>
                {marco.descricao && <Text size="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{marco.descricao}</Text>}
                <SimpleGrid cols={{base: 1, xs: 2, md: 3}}><Text size="sm">Entrega: {formatarPrazo(marco.prazoEntrega)}</Text><Text size="sm">Valor: {formatarValor(marco.valor)}</Text><Text size="sm">Recebido: {formatarValor(marco.recebido)}</Text><Text size="sm">Saldo: {formatarValor(marco.saldo)}</Text><Text size="sm">Vencimento: {formatarPrazo(marco.vencimento)}</Text><Text size="sm" fw={500}>{statusPagamento(marco, cancelado)}</Text></SimpleGrid>
                {marco.pagamentos.length > 0 && <><Divider/><Text size="xs" c="dimmed">Recebimentos registrados</Text>{marco.pagamentos.map(p => <Text key={p.id} size="xs">{formatarPrazo(p.recebidoEm)} · {formatarValor(p.valor)}</Text>)}</>}
                {!somenteLeitura && <Group justify="flex-end"><Button size="xs" variant="light" disabled={salvando || !!edicao || !!pagamento} onClick={() => {setEdicao(novaEdicao(marco)); setErro(null);}}>Editar</Button>{Number(marco.saldo) > 0 && (!cancelado || ["concluido", "cancelado", "aguardando_validacao"].includes(marco.status) || marco.cobrancaIniciada) && <Button size="xs" variant="light" color="green" disabled={salvando || !!edicao || !!pagamento} onClick={() => abrirPagamento(marco)}>Registrar pagamento</Button>}</Group>}
                {edicao?.id === marco.id && !somenteLeitura && editor}
                {pagamento?.marcoId === marco.id && !somenteLeitura && <Stack gap="xs"><Divider/><TextInput label="Valor recebido (R$)" inputMode="decimal" maxLength={13} value={pagamento.valor} onChange={e => {const valor = e.currentTarget.value; setPagamento(p => p ? {...p, valor} : p);}} disabled={salvando}/><TextInput label="Data do recebimento" type="date" value={pagamento.recebidoEm} onChange={e => {const recebidoEm = e.currentTarget.value; setPagamento(p => p ? {...p, recebidoEm} : p);}} disabled={salvando}/><Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => {setPagamento(null); setErro(null);}}>Cancelar</Button><Button loading={salvando} disabled={!pagamento.valor.trim() || !pagamento.recebidoEm} onClick={() => void registrarPagamento()}>Registrar</Button></Group></Stack>}
            </Stack></Card>)}
        </>}
    </Stack></Card>;
}
