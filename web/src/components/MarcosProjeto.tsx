import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Divider, Group, Loader, Menu, Modal, Progress, Radio, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { formatarPrazo, formatarValor } from "../lib/comercial";
import type { DadosProjeto } from "../lib/comercial";

type StatusMarco = "pendente" | "em_andamento" | "aguardando_validacao" | "concluido" | "cancelado";
type Pagamento = {id: string; valor: string; recebidoEm: string; anuladoEm: string | null};
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
    oculto?: boolean;
};
export type ResumoMarcos = {id: string; modoProgresso: DadosProjeto["modoProgresso"]; progresso: number | null; atualizadaEm: string; valorAcordado: string | null; totalPago: string; valorDistribuido?: string; valorRestante?: string | null; marcos: Marco[]};
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

//ver se o marco pode ser excluído
function podeExcluir(marco: Marco) {
    return marco.status === "pendente" && !marco.cobrancaIniciada && marco.pagamentos.length === 0;
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
    const [filtro, setFiltro] = useState(admin ? "ativos" : "todos");
    const [historicos, setHistoricos] = useState<string[]>([]);
    const [cancelamento, setCancelamento] = useState<{marco: Marco; dispensar: boolean} | null>(null);
    const [limpeza, setLimpeza] = useState<string[] | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [revisao, setRevisao] = useState(0);
    const versao = useRef(0);
    const cancelado = projeto.status === "cancelado";
    const somenteLeitura = !admin || !!projeto.arquivadaEm;
    const marcos = resumo?.marcos ?? [];
    const ativos = marcos.filter(m => m.status !== "cancelado");
    const concluidos = ativos.filter(m => m.status === "concluido").length;
    const progresso = resumo ? (ativos.length ? Math.round(100 * concluidos / ativos.length) : 0) : projeto.progresso;
    const distribuido = Math.round(Number(resumo?.valorDistribuido ?? 0) * 100);
    const restante = projeto.valorAcordado === null ? null : Math.round(Number(projeto.valorAcordado) * 100) - distribuido;
    const ocupado = salvando || !!edicao || !!pagamento || !!cancelamento || !!limpeza;
    const visiveis = marcos.filter(m => {
        if (edicao?.id === m.id || pagamento?.marcoId === m.id) return true;
        if (filtro === "ocultos") return !!m.oculto;
        if (m.oculto) return false;
        return filtro === "todos" || (filtro === "ativos" ? !["concluido", "cancelado"].includes(m.status) : m.status === filtro);
    });
    const elegiveis = marcos.filter(m => !m.oculto && podeExcluir(m));
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

    async function enviar(url: string, method: "POST" | "PATCH" | "DELETE", corpo: unknown) {
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
        const anterior = marcos.find(m => m.id === id);
        const valor = dados.valor.trim().replace(",", ".");
        if (valor && !/^\d{1,10}(?:\.\d{1,2})?$/.test(valor)) {setErro("Informe um valor válido"); return;}
        const recebido = Math.round(Number(anterior?.recebido ?? 0) * 100);
        const novoValor = Math.round(Number(valor || 0) * 100);
        if (novoValor < recebido) {setErro("O valor não pode ser menor que o recebido"); return;}
        const valorAnterior = anterior ? Math.round(Number(anterior.saldoDispensado ? anterior.recebido : anterior.valor ?? 0) * 100) : 0;
        const novoDistribuido = distribuido - valorAnterior + (dados.saldoDispensado ? recebido : novoValor);
        if (restante !== null && novoDistribuido > distribuido && novoDistribuido > Math.round(Number(projeto.valorAcordado) * 100) && !window.confirm("Os marcos ultrapassam o valor acordado. Continuar?")) return;
        if (await enviar(id ? `${endpoint}/${id}` : endpoint, id ? "PATCH" : "POST", dados)) {setEdicao(null); if (!id) setFiltro("ativos");}
    }

    async function concluirMarco(marco: Marco, concluido: boolean) {
        const {id, ...dados} = novaEdicao(marco);
        await enviar(`${endpoint}/${id}`, "PATCH", {...dados, status: concluido ? "concluido" : "pendente", saldoDispensado: false});
    }

    async function registrarPagamento() {
        if (!pagamento) return;
        const {marcoId, ...dados} = pagamento;
        if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(dados.valor.trim()) || Number(dados.valor.replace(",", ".")) <= 0) {setErro("Informe um valor válido"); return;}
        const marco = marcos.find(m => m.id === marcoId);
        if (!marco || Math.round(Number(dados.valor.replace(",", ".")) * 100) > Math.round(Number(marco.saldo) * 100)) {setErro("O valor excede o saldo pendente"); return;}
        if (!window.confirm(`Registrar recebimento de ${formatarValor(dados.valor.replace(",", "."))}?`)) return;
        if (await enviar(`${endpoint}/${marcoId}/pagamentos`, "POST", dados)) setPagamento(null);
    }

    //admin: anular recebimento
    async function anularPagamento(marco: Marco, p: Pagamento) {
        if (!window.confirm(`Desfazer recebimento de ${formatarValor(p.valor)}?`)) return;
        await enviar(`${endpoint}/${marco.id}/pagamentos/${p.id}/anular`, "PATCH", {});
    }

    //admin: excluir marco
    async function excluirMarco(marco: Marco) {
        if (!window.confirm(`Excluir o marco ${marco.titulo}?`)) return;
        await enviar(`${endpoint}/${marco.id}`, "DELETE", {});
    }

    //admin: cancelar marco
    function cancelarMarco(marco: Marco) {
        setCancelamento({marco, dispensar: marco.status === "cancelado" ? marco.saldoDispensado : false});
        setErro(null);
    }

    //admin: confirmar cancelamento
    async function confirmarCancelamento() {
        if (!cancelamento) return;
        const {marco, dispensar} = cancelamento;
        if (await enviar(`${endpoint}/${marco.id}/cancelamento`, "PATCH", {dispensar, valor: marco.valor, recebido: marco.recebido, saldoDispensado: marco.saldoDispensado, status: marco.status})) setCancelamento(null);
    }

    //admin: limpar marcos pendentes
    async function limparMarcos() {
        if (!limpeza) return;
        if (await enviar(endpoint, "DELETE", {ids: limpeza})) setLimpeza(null);
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
            <Select label="Status" data={statusMarcos.filter(s => (s.value !== "cancelado" || edicao.status === "cancelado") && (!cancelado || s.value === edicao.status))} value={edicao.status} allowDeselect={false} disabled={salvando} onChange={v => {if (v) setEdicao(atual => atual ? {...atual, status: v as StatusMarco, saldoDispensado: v === "cancelado" && atual.saldoDispensado} : atual);}}/>
            <TextInput label="Valor (R$)" inputMode="decimal" maxLength={13} value={edicao.valor} onChange={e => alterarEdicao("valor", e.currentTarget.value)} disabled={salvando}/>
            <TextInput label="Prazo de entrega" type="date" value={edicao.prazoEntrega} onChange={e => alterarEdicao("prazoEntrega", e.currentTarget.value)} disabled={salvando}/>
            <TextInput label="Vencimento do pagamento" type="date" value={edicao.vencimento} onChange={e => alterarEdicao("vencimento", e.currentTarget.value)} disabled={salvando}/>
        </SimpleGrid>
        <Checkbox label="Cobrança iniciada" checked={edicao.cobrancaIniciada} onChange={e => alterarEdicao("cobrancaIniciada", e.currentTarget.checked)} disabled={salvando}/>
        <Checkbox label="Aguardar pagamento para prosseguir" checked={edicao.bloqueiaProgresso} onChange={e => alterarEdicao("bloqueiaProgresso", e.currentTarget.checked)} disabled={salvando}/>

        {erro && <Alert color="red">{erro}</Alert>}
        <Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => {setEdicao(null); setErro(null);}}>Cancelar</Button><Button loading={salvando} disabled={!edicao.titulo.trim()} onClick={() => void salvarMarco()}>Salvar</Button></Group>
    </Stack></Card>;

    return <Card withBorder padding={admin ? "lg" : "sm"}><Stack gap="sm">
        <Modal opened={!!cancelamento} onClose={() => {if (!salvando) {setCancelamento(null); setErro(null);}}} title={cancelamento?.marco.status === "cancelado" ? "Revisar cobrança" : "Cancelar marco"} centered closeOnClickOutside={!salvando} closeOnEscape={!salvando} withCloseButton={!salvando}>
            {cancelamento && <Stack gap="sm">
                <Text fw={600} style={{overflowWrap: "anywhere"}}>{cancelamento.marco.titulo}</Text>
                <Text size="sm">Valor: {formatarValor(cancelamento.marco.valor)}</Text>
                <Text size="sm">Já recebido: {formatarValor(cancelamento.marco.recebido)}</Text>
                <Radio.Group label="O que fazer com o saldo restante?" value={cancelamento.dispensar ? "dispensar" : "manter"} onChange={v => setCancelamento(c => c ? {...c, dispensar: v === "dispensar"} : c)}>
                    <Stack gap="xs" mt="xs">
                        <Radio value="manter" label="Manter a cobrança" disabled={salvando}/>
                        <Radio value="dispensar" label="Dispensar a cobrança" disabled={salvando}/>
                    </Stack>
                </Radio.Group>
                <Divider/>
                <Text fw={600} size="sm">Após o cancelamento</Text>
                <Text size="sm">Recebimentos preservados: {formatarValor(cancelamento.marco.recebido)}</Text>
                <Text size="sm">Saldo a receber: {formatarValor((cancelamento.dispensar ? 0 : Math.max(0, Math.round(Number(cancelamento.marco.valor ?? 0) * 100) - Math.round(Number(cancelamento.marco.recebido) * 100)) / 100).toFixed(2))}</Text>
                <Text size="sm">Valor distribuído neste marco: {formatarValor(cancelamento.dispensar ? cancelamento.marco.recebido : cancelamento.marco.valor ?? "0")}</Text>
                <Text size="sm">Saldo liberado para outros marcos: {formatarValor((cancelamento.dispensar ? Math.max(0, Math.round(Number(cancelamento.marco.valor ?? 0) * 100) - Math.round(Number(cancelamento.marco.recebido) * 100)) / 100 : 0).toFixed(2))}</Text>
                {erro && <Alert color="red">{erro}</Alert>}
                <Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => {setCancelamento(null); setErro(null);}}>Voltar</Button><Button color="red" loading={salvando} onClick={() => void confirmarCancelamento()}>Confirmar</Button></Group>
            </Stack>}
        </Modal>
        <Modal opened={!!limpeza} onClose={() => {if (!salvando) {setLimpeza(null); setErro(null);}}} title="Limpar marcos pendentes" centered closeOnClickOutside={!salvando} closeOnEscape={!salvando} withCloseButton={!salvando}>
            <Stack gap="sm"><Text size="sm">Excluir {limpeza?.length ?? 0} marcos pendentes não ocultos, sem cobrança ou histórico de pagamentos?</Text><Text size="sm" c="dimmed">Esta ação não pode ser desfeita</Text>{erro && <Alert color="red">{erro}</Alert>}<Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => {setLimpeza(null); setErro(null);}}>Voltar</Button><Button color="red" loading={salvando} onClick={() => void limparMarcos()}>Excluir</Button></Group></Stack>
        </Modal>
        <Group justify="space-between" wrap="wrap"><Title order={4}>Marcos</Title><Group gap="xs"><Button size="xs" variant="subtle" disabled={ocupado} onClick={() => setAberto(v => !v)}>{aberto ? "Recolher" : "Ver marcos"}</Button>{aberto && <Button size="xs" variant="subtle" disabled={ocupado} onClick={() => setRevisao(v => v + 1)}>Atualizar</Button>}{aberto && !somenteLeitura && !cancelado && <Button size="xs" disabled={!resumo || ocupado} onClick={() => {setEdicao(novaEdicao()); setErro(null);}}>+ Novo marco</Button>}</Group></Group>
        {projeto.modoProgresso === "marcos" && <><Group justify="space-between"><Text size="sm" c="dimmed">{resumo ? `${concluidos} de ${ativos.length} concluídos` : "Progresso por marcos"}</Text><Text size="sm">{progresso == null ? "Não definido" : `${progresso}%`}</Text></Group>{progresso != null && <Progress value={progresso} color="violet" aria-label="Progresso por marcos"/>}</>}
        {aberto && <>
            {!resumo && !erro && <Loader size="sm"/>}
            {erro && !edicao && !pagamento && !cancelamento && !limpeza && <Alert color="red">{erro}</Alert>}
            {resumo && projeto.modoProgresso === "manual" && <Text size="sm" c="dimmed">{concluidos} de {ativos.length} concluídos</Text>}
            {resumo && <Card withBorder padding="sm"><Stack gap="xs">
                <SimpleGrid cols={{base: 1, sm: admin ? 4 : 2}}>
                    <Stack gap={2}><Text size="xs" c="dimmed">Valor acordado</Text><Text fw={500}>{formatarValor(projeto.valorAcordado)}</Text></Stack>
                    <Stack gap={2}><Text size="xs" c="dimmed">{admin ? "Total recebido" : "Total pago"}</Text><Text fw={500}>{formatarValor(resumo.totalPago)}</Text></Stack>
                    {admin && <>
                    <Stack gap={2}><Text size="xs" c="dimmed">Distribuído nos marcos</Text><Text fw={500}>{formatarValor((distribuido / 100).toFixed(2))}</Text></Stack>
                    <Stack gap={2}><Text size="xs" c="dimmed">{restante !== null && restante < 0 ? "Valor excedente" : "Valor não distribuído"}</Text><Text fw={500} c={restante !== null && restante < 0 ? "red" : undefined}>{restante === null ? "Não definido" : formatarValor((Math.abs(restante) / 100).toFixed(2))}</Text></Stack></>}
                </SimpleGrid>
                {admin && restante !== null && restante < 0 && <Alert color="yellow">Os marcos ultrapassam o valor acordado</Alert>}
                {!somenteLeitura && !cancelado && restante !== null && restante > 0 && <Group justify="flex-end"><Button size="xs" variant="light" disabled={ocupado} onClick={() => {setEdicao({...novaEdicao(), titulo: "Entrega final", valor: (restante / 100).toFixed(2)}); setErro(null);}}>+ Marco com valor restante</Button></Group>}
            </Stack></Card>}
            {aguardando && <Alert color="yellow">Aguardando pagamento para prosseguir</Alert>}
            {resumo && <Group align="flex-end" justify="space-between" wrap="wrap">
                <Select label="Exibir" size="sm" value={filtro} allowDeselect={false} disabled={ocupado} onChange={v => {if (v) setFiltro(v);}} data={[{value: "ativos", label: "Ativos"}, {value: "concluido", label: "Concluídos"}, {value: "cancelado", label: "Cancelados"}, {value: "todos", label: "Todos"}, ...(admin ? [{value: "ocultos", label: "Ocultos"}] : [])]}/>
                {!somenteLeitura && <Button size="xs" color="red" variant="subtle" disabled={ocupado || !elegiveis.length} onClick={() => {setLimpeza(elegiveis.slice(0, 500).map(m => m.id)); setErro(null);}}>Limpar pendentes ({Math.min(elegiveis.length, 500)})</Button>}
            </Group>}
            {resumo && !visiveis.length && <Text size="sm" c="dimmed">{marcos.length ? "Nenhum marco neste filtro" : "Nenhum marco cadastrado"}</Text>}
            {edicao && !edicao.id && !somenteLeitura && editor}
            {visiveis.map(marco => <Card key={marco.id} withBorder padding="sm"><Stack gap="xs">
                <Group justify="space-between" align="flex-start"><Group gap="xs" wrap="nowrap" style={{minWidth: 0, flex: 1}}>{!somenteLeitura && !cancelado && marco.status !== "cancelado" && <Checkbox aria-label={`Concluir ${marco.titulo}`} checked={marco.status === "concluido"} disabled={ocupado} onChange={e => void concluirMarco(marco, e.currentTarget.checked)}/>}<Text fw={600} style={{overflowWrap: "anywhere", minWidth: 0}}>{marco.titulo}</Text></Group><Badge color={cores[marco.status]}>{statusMarcos.find(s => s.value === marco.status)?.label}</Badge></Group>
                {marco.descricao && <Text size="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{marco.descricao}</Text>}
                <SimpleGrid cols={{base: 1, xs: 2, md: 3}}><Text size="sm">Entrega: {formatarPrazo(marco.prazoEntrega)}</Text><Text size="sm">Valor: {formatarValor(marco.valor)}</Text><Text size="sm">{admin ? "Recebido" : "Pago"}: {formatarValor(marco.recebido)}</Text><Text size="sm">Saldo: {formatarValor(marco.saldo)}</Text><Text size="sm">Vencimento: {formatarPrazo(marco.vencimento)}</Text><Text size="sm" fw={500}>{statusPagamento(marco, cancelado)}</Text></SimpleGrid>
                {marco.pagamentos.length > 0 && <><Divider/><Button size="xs" variant="subtle" onClick={() => setHistoricos(old => old.includes(marco.id) ? old.filter(id => id !== marco.id) : [...old, marco.id])}>{historicos.includes(marco.id) ? "Recolher histórico" : `Ver histórico (${marco.pagamentos.length})`}</Button>{historicos.includes(marco.id) && marco.pagamentos.map(p => <Group key={p.id} justify="space-between" wrap="wrap"><Stack gap={2}><Text size="xs" td={p.anuladoEm ? "line-through" : undefined}>{formatarPrazo(p.recebidoEm)} · {formatarValor(p.valor)}</Text>{p.anuladoEm && <Text size="xs" c="dimmed">Anulado em {new Date(p.anuladoEm).toLocaleString("pt-BR")}</Text>}</Stack>{!somenteLeitura && !p.anuladoEm && <Button size="xs" color="red" variant="subtle" disabled={ocupado} onClick={() => void anularPagamento(marco, p)}>Desfazer</Button>}</Group>)}</>}
                {!somenteLeitura && <Group justify="flex-end"><Menu shadow="md" position="bottom-end"><Menu.Target><Button size="xs" variant="light" disabled={ocupado} aria-label={`Opções de ${marco.titulo}`}>⋮</Button></Menu.Target><Menu.Dropdown><Menu.Item onClick={() => {setEdicao(novaEdicao(marco)); setErro(null);}}>Editar</Menu.Item><Menu.Item onClick={() => void enviar(`${endpoint}/${marco.id}/visibilidade`, "PATCH", {oculto: !marco.oculto})}>{marco.oculto ? "Exibir na lista" : "Ocultar da lista"}</Menu.Item><Menu.Item color="orange" onClick={() => cancelarMarco(marco)}>{marco.status === "cancelado" ? "Revisar cobrança" : "Cancelar marco"}</Menu.Item><Menu.Item color="red" disabled={!podeExcluir(marco)} onClick={() => void excluirMarco(marco)}>Excluir marco</Menu.Item>{!podeExcluir(marco) && <Menu.Label>{marco.pagamentos.length ? "Possui histórico de pagamentos" : marco.cobrancaIniciada ? "Cobrança iniciada" : "Marco não está pendente"}</Menu.Label>}</Menu.Dropdown></Menu>{Number(marco.saldo) > 0 && (!cancelado || ["concluido", "cancelado", "aguardando_validacao"].includes(marco.status) || marco.cobrancaIniciada) && <Button size="xs" variant="light" color="green" disabled={ocupado} onClick={() => abrirPagamento(marco)}>Registrar pagamento</Button>}</Group>}
                {edicao?.id === marco.id && !somenteLeitura && editor}
                {pagamento?.marcoId === marco.id && !somenteLeitura && <Stack gap="xs"><Divider/><TextInput label="Valor recebido (R$)" inputMode="decimal" maxLength={13} value={pagamento.valor} onChange={e => {const valor = e.currentTarget.value; setPagamento(p => p ? {...p, valor} : p);}} disabled={salvando}/><TextInput label="Data do recebimento" type="date" value={pagamento.recebidoEm} onChange={e => {const recebidoEm = e.currentTarget.value; setPagamento(p => p ? {...p, recebidoEm} : p);}} disabled={salvando}/>{erro && <Alert color="red">{erro}</Alert>}<Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => {setPagamento(null); setErro(null);}}>Cancelar</Button><Button loading={salvando} disabled={!pagamento.valor.trim() || !pagamento.recebidoEm} onClick={() => void registrarPagamento()}>Registrar</Button></Group></Stack>}
            </Stack></Card>)}
        </>}
    </Stack></Card>;
}
