import { apiFetch } from "../lib/api-fetch";
import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";

export type PedidoReabertura = {
    id: string;
    status: "pendente" | "aprovada" | "recusada";
    solicitadaEm: string;
    decididaEm: string | null;
    justificativa: string | null;
};

type Props = {
    conversaId: string;
    pedido?: PedidoReabertura | null;
    lado: "admin" | "cliente";
    onAlterado: (pedido: PedidoReabertura, restaurada: boolean) => void;
    onAtualizar: () => void;
};

export function ReaberturaConversa({conversaId, pedido, lado, onAlterado, onAtualizar}: Props) {
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [decisao, setDecisao] = useState<"aprovada" | "recusada" | null>(null);
    const [justificativa, setJustificativa] = useState("");
    const [pedidoDecisao, setPedidoDecisao] = useState<string | null>(null);

    async function executar() {
        if (enviando || (lado === "admin" && (!decisao || !pedidoDecisao))) return;
        setEnviando(true);
        setErro(null);
        try {
            const resposta = await apiFetch(lado === "cliente" ? `/api/me/conversas/${conversaId}/reaberturas` : `/api/conversas/${conversaId}/reaberturas/${pedidoDecisao}`, {
                method: lado === "cliente" ? "POST" : "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(lado === "cliente" ? {} : {status: decisao, justificativa}),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível concluir a operação.");
            setDecisao(null);
            onAlterado(dados.reabertura, dados.restaurada === true);
        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha na operação.");
            onAtualizar();
        } finally {setEnviando(false);}
    }

    function abrirDecisao(status: "aprovada" | "recusada") {
        if (!pedido || pedido.status !== "pendente") return;
        setPedidoDecisao(pedido.id);
        setJustificativa("");
        setErro(null);
        setDecisao(status);
    }

    return (
        <Stack gap="xs">
            {pedido?.status === "pendente" ? (
                <>
                    <Text size="sm" fw={600} c="yellow">{lado === "cliente" ? "Reabertura solicitada — aguardando decisão." : "O cliente solicitou a reabertura."}</Text>
                    {lado === "admin" && <Group gap="xs"><Button size="xs" variant="outline" color="red" onClick={() => abrirDecisao("recusada")}>Recusar</Button><Button size="xs" color="green" onClick={() => abrirDecisao("aprovada")}>Reabrir conversa</Button></Group>}
                </>
            ) : (
                <>
                    {pedido?.status === "recusada" && <Text size="sm" c="red">Reabertura recusada.</Text>}
                    {pedido?.status === "recusada" && pedido.justificativa && <Text size="xs" style={{overflowWrap: "anywhere", whiteSpace: "pre-wrap", maxHeight: 80, overflowY: "auto"}}>Justificativa: {pedido.justificativa}</Text>}
                    {lado === "cliente" && <Button size="xs" variant="outline" loading={enviando} onClick={() => void executar()}>{pedido?.status === "recusada" ? "Solicitar novamente" : "Solicitar reabertura"}</Button>}
                </>
            )}
            {erro && !decisao && <Alert color="red">{erro}</Alert>}
            <Modal opened={!!decisao} onClose={() => {if (!enviando) setDecisao(null);}} title={decisao === "aprovada" ? "Aprovar reabertura" : "Recusar reabertura"} centered closeOnEscape={!enviando} closeOnClickOutside={!enviando} withCloseButton={!enviando}>
                <Stack gap="md">
                    <Text size="sm">{decisao === "aprovada" ? "A conversa voltará a aceitar mensagens de ambas as partes." : "A conversa permanecerá arquivada e o cliente poderá consultar sua decisão."}</Text>
                    <Textarea label="Justificativa (opcional)" value={justificativa} onChange={evento => setJustificativa(evento.currentTarget.value)} maxLength={1000} minRows={3} disabled={enviando}/>
                    {erro && <Alert color="red">{erro}</Alert>}
                    <Group justify="flex-end"><Button variant="default" disabled={enviando} onClick={() => setDecisao(null)}>Cancelar</Button><Button color={decisao === "aprovada" ? "green" : "red"} loading={enviando} onClick={() => void executar()}>Confirmar</Button></Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
