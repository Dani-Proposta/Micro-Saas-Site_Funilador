
import { useEffect, useState } from "react";
import { Alert, Box, Button, Center, Divider, Group, Loader, ScrollArea, Stack, Text, Textarea } from "@mantine/core";

type Mensagem = {
    id: string;
    remetenteTipo: "admin" | "cliente";
    conteudo: string;
    enviadaEm: string;
};

type HistoricoProps = {
    conversaId: string;
    arquivada?: boolean;
    lado?: "admin" | "cliente";
};

export function HistoricoMensagens({conversaId, arquivada = false, lado = "admin"}: HistoricoProps) {

    const [mensagens, setMensagens] = useState<Mensagem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [conteudo, setConteudo] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);

    const endpoint = lado === "admin"
        ? `/api/conversas/${conversaId}/mensagens`
        : `/api/me/conversas/${conversaId}/mensagens`;

    useEffect(() => {
        const controller = new AbortController();

        async function carregarMensagens() {
            try {
                const resposta = await fetch(endpoint, {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao carregar mensagens.");

                if (!controller.signal.aborted) setMensagens(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar mensagens.");
            } finally {
                if (!controller.signal.aborted) setCarregando(false);
            }
        }

        void carregarMensagens();
        return () => controller.abort();
    }, [endpoint]);

    async function enviarMensagem() {
        if (arquivada || enviando || carregando || erro || !conteudo.trim()) return;

        setEnviando(true);
        setErroEnvio(null);

        try {
            const resposta = await fetch(endpoint, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({conteudo}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível enviar a mensagem.");

            setMensagens(anteriores => [...anteriores, dados]);
            setConteudo("");

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

            {erroEnvio && <Alert color="red">{erroEnvio}</Alert>}

            {arquivada ? (
                <Alert color="gray">Esta conversa está arquivada e disponível somente para consulta.</Alert>
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
