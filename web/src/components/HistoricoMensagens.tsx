
import { useCallback, useRef, useState } from "react";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { Alert, Box, Button, Center, Divider, Group, Loader, ScrollArea, Stack, Text, Textarea } from "@mantine/core";

type Mensagem = {
    id: string;
    remetenteTipo: "admin" | "cliente";
    conteudo: string;
    enviadaEm: string;
};

// As datas retornadas pela API são UTC com seis dígitos de precisão.
function unirMensagens(anteriores: Mensagem[], novas: Mensagem[]) {
    const unicas = new Map(anteriores.map(mensagem => [mensagem.id, mensagem]));
    for (const mensagem of novas) unicas.set(mensagem.id, mensagem);

    return Array.from(unicas.values()).sort((a, b) =>
        a.enviadaEm < b.enviadaEm ? -1 :
        a.enviadaEm > b.enviadaEm ? 1 :
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
}

type HistoricoProps = {
    conversaId: string;
    arquivada?: boolean;
    lado?: "admin" | "cliente";
    onAtualizarConversas?: () => void;
};

export function HistoricoMensagens({conversaId, arquivada = false, lado = "admin", onAtualizarConversas}: HistoricoProps) {

    const [mensagens, setMensagens] = useState<Mensagem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [conteudo, setConteudo] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);
    const [arquivadaServidor, setArquivadaServidor] = useState(false);
    const revisao = useRef(0);
    const somenteLeitura = arquivada || arquivadaServidor;

    const endpoint = lado === "admin"
        ? `/api/conversas/${conversaId}/mensagens`
        : `/api/me/conversas/${conversaId}/mensagens`;

    const carregarMensagens = useCallback(async (signal: AbortSignal) => {
        const versao = revisao.current;

        try {
            const resposta = await fetch(`${endpoint}?estado=true`, {signal, cache: "no-store"});
            const dados = await resposta.json();

            if (signal.aborted || versao !== revisao.current) return;

            if (!resposta.ok) {
                if ([401, 403, 404].includes(resposta.status)) {
                    setMensagens([]);
                    onAtualizarConversas?.();
                }
                throw new Error(dados.erro ?? "Erro ao carregar mensagens.");
            }

            if (!Array.isArray(dados.mensagens) || !(dados.arquivadaEm === null || typeof dados.arquivadaEm === "string")) {
                throw new Error("Resposta de histórico inválida.");
            }

            const recebidas: Mensagem[] = dados.mensagens;
            const estadoArquivada = !!dados.arquivadaEm;

            setMensagens(anteriores => {
                // Se a janela inteira mudou, não apresente um histórico com lacunas.
                // O carregamento de mensagens antigas será implementado na paginação.
                if (anteriores.length && recebidas.length && !recebidas.some(m => anteriores.some(a => a.id === m.id))) {
                    return recebidas;
                }

                return unirMensagens(anteriores, recebidas);
            });

            setArquivadaServidor(estadoArquivada);
            setErro(null);

            if (estadoArquivada !== arquivada) onAtualizarConversas?.();

        } catch (erroRecebido) {
            if (!signal.aborted && versao === revisao.current) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao atualizar mensagens.");
        } finally {
            if (!signal.aborted) setCarregando(false);
        }
    }, [endpoint, arquivada, onAtualizarConversas]);

    const atualizarMensagens = useAtualizacaoPeriodica(carregarMensagens, 5000);

    async function enviarMensagem() {
        if (somenteLeitura || enviando || carregando || erro || !conteudo.trim()) return;

        setEnviando(true);
        setErroEnvio(null);

        try {
            const resposta = await fetch(endpoint, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({conteudo}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) {
                if (resposta.status === 409 && dados.codigo === "CONVERSA_ARQUIVADA") {
                    revisao.current++;
                    setArquivadaServidor(true);
                    onAtualizarConversas?.();
                    atualizarMensagens();
                    return;
                }
                throw new Error(dados.erro ?? "Não foi possível enviar a mensagem.");
            }

            revisao.current++;
            setMensagens(anteriores => unirMensagens(anteriores, [dados]));
            setConteudo("");
            atualizarMensagens();

        } catch (erroRecebido) {
            setErroEnvio(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao enviar mensagem.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Stack gap="sm">

            <ScrollArea h={440}>
                <Stack gap="sm">

                    {carregando && <Center><Loader size="sm"/></Center>}

                    {erro && <Alert color="red">{erro}</Alert>}

                    {!carregando && !erro && mensagens.length === 0 && <Center h={400}><Text c="dimmed" size="sm">Nenhuma mensagem por enquanto.</Text></Center>}

                    {mensagens.map(mensagem => (
                        <Group key={mensagem.id} justify={mensagem.remetenteTipo === lado ? "flex-end" : "flex-start"}>
                            <Box bg={mensagem.remetenteTipo === lado ? "violet.8" : "var(--mantine-color-default-hover)"} c={mensagem.remetenteTipo === lado ? "white" : undefined} p="sm" maw="80%" style={{borderRadius: 12}}>
                                <Text size="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{mensagem.conteudo}</Text>
                                <Text size="xs" opacity={0.7} ta="right">{new Date(mensagem.enviadaEm).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}</Text>
                            </Box>
                        </Group>
                    ))}

                </Stack>
            </ScrollArea>

            <Divider/>

            {erroEnvio && !somenteLeitura && <Alert color="red">{erroEnvio}</Alert>}

            {somenteLeitura ? (
                <Alert color="gray" title="Conversa arquivada">{lado === "cliente" ? "Esta conversa foi arquivada pela administração. Você pode consultar o histórico, mas não enviar novas mensagens." : "Esta conversa está arquivada e disponível somente para consulta."}</Alert>
            ) : (
                <form onSubmit={evento => {
                    evento.preventDefault();
                    void enviarMensagem();
                }}>
                    <Group align="flex-end" wrap="nowrap">
                        <Textarea flex={1} aria-label="Mensagem" placeholder="Digite sua mensagem..." value={conteudo} onChange={evento => setConteudo(evento.currentTarget.value)} autosize minRows={1} maxRows={4} maxLength={5000} disabled={enviando}/>
                        <Button type="submit" loading={enviando} disabled={carregando || !!erro || !conteudo.trim()}>Enviar</Button>
                    </Group>
                </form>
            )}

        </Stack>
    );
}
