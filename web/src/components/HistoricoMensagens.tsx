
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EVENTO_LEITURA } from "../hooks/useMensagensNaoLidas";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { Alert, Box, Button, Center, Divider, Group, Loader, ScrollArea, Stack, Text, Textarea } from "@mantine/core";

type Mensagem = {
    id: string;
    remetenteTipo: "admin" | "cliente";
    conteudo: string;
    enviadaEm: string;
    lida?: boolean;
};

// As datas retornadas pela API são UTC com seis dígitos de precisão.
function unirMensagens(anteriores: Mensagem[], novas: Mensagem[]) {
    const unicas = new Map(anteriores.map(mensagem => [mensagem.id, mensagem]));
    for (const mensagem of novas) {
        const anterior = unicas.get(mensagem.id);
        unicas.set(mensagem.id, {...mensagem, lida: !!(anterior?.lida || mensagem.lida)});
    }

    const ordenadas = Array.from(unicas.values()).sort((a, b) =>
        a.enviadaEm < b.enviadaEm ? -1 :
        a.enviadaEm > b.enviadaEm ? 1 :
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    // Não recria o estado em polls que não trouxeram nenhuma mudança.
    return ordenadas.length === anteriores.length && ordenadas.every((m, i) => {
        const a = anteriores[i];
        return m.id === a.id && m.lida === !!a.lida && m.conteudo === a.conteudo && m.enviadaEm === a.enviadaEm && m.remetenteTipo === a.remetenteTipo;
    }) ? anteriores : ordenadas;
}

type Pagina = {mensagens: Mensagem[]; arquivadaEm: string | null; temMais: boolean};
type AjusteRolagem = {tipo: "final"} | {tipo: "ancora"; id: string; topo: number};

function pertoDoFinal(viewport: HTMLDivElement | null) {
    return !viewport || viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 80;
}

function diaMensagem(data: string) {
    return new Date(data).toLocaleDateString("pt-BR");
}

async function buscarPagina(endpoint: string, signal: AbortSignal, cursor?: {tipo: "antes" | "depois"; id: string}): Promise<Pagina> {
    const consulta = new URLSearchParams({estado: "true"});
    if (cursor) consulta.set(cursor.tipo, cursor.id);
    const resposta = await fetch(`${endpoint}?${consulta}`, {signal, cache: "no-store"});
    const dados = await resposta.json();
    if (!resposta.ok) throw Object.assign(new Error(dados.erro ?? "Erro ao carregar mensagens."), {status: resposta.status});
    if (!Array.isArray(dados.mensagens) || typeof dados.temMais !== "boolean" || !(dados.arquivadaEm === null || typeof dados.arquivadaEm === "string")) {
        throw new Error("Resposta de histórico inválida. Confira se a API foi atualizada.");
    }
    return dados;
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
    const viewportRef = useRef<HTMLDivElement>(null);
    const somenteLeitura = arquivada || arquivadaServidor;

    const endpoint = lado === "admin"
        ? `/api/conversas/${conversaId}/mensagens`
        : `/api/me/conversas/${conversaId}/mensagens`;

    const mensagensRef = useRef<Mensagem[]>([]);
    const cursorAntigo = useRef<string | null>(null);
    // A fronteira de sincronização avança apenas após GET, nunca após POST.
    const cursorRecente = useRef<string | null>(null);
    const inicializado = useRef(false);
    const paginaAnterior = useRef<AbortController | null>(null);
    const ajusteRolagem = useRef<AjusteRolagem | null>(null);
    const ultimaPosicao = useRef(0);
    const [temMaisAntigas, setTemMaisAntigas] = useState(false);
    const [carregandoAntigas, setCarregandoAntigas] = useState(false);
    const [erroAntigas, setErroAntigas] = useState<string | null>(null);
    const [novasMensagens, setNovasMensagens] = useState(0);
    const [longeDoFinal, setLongeDoFinal] = useState(false);

    const mesclarPagina = useCallback((recebidas: Mensagem[], modo: "inicial" | "antigas" | "recentes" | "envio") => {
        const anteriores = mensagensRef.current;
        const unidas = unirMensagens(anteriores, recebidas);
        const viewport = viewportRef.current;

        if (modo === "inicial" || modo === "envio" || (modo === "recentes" && pertoDoFinal(viewport) && ajusteRolagem.current?.tipo !== "ancora")) {
            if (unidas !== anteriores || modo === "envio") ajusteRolagem.current = {tipo: "final"};
            setNovasMensagens(0);
            setLongeDoFinal(false);
        } else if (modo === "antigas" && viewport && unidas !== anteriores && !ajusteRolagem.current) {
            const area = viewport.getBoundingClientRect();
            const ancora = Array.from(viewport.querySelectorAll<HTMLElement>("[data-mensagem-id]")).find(el => el.getBoundingClientRect().bottom > area.top);
            if (ancora?.dataset.mensagemId) ajusteRolagem.current = {tipo: "ancora", id: ancora.dataset.mensagemId, topo: ancora.getBoundingClientRect().top - area.top};
        } else if (modo === "recentes" && unidas !== anteriores) {
            const conhecidos = new Set(anteriores.map(m => m.id));
            const quantidade = recebidas.filter(m => !conhecidos.has(m.id) && m.remetenteTipo !== lado).length;
            if (quantidade) setNovasMensagens(n => n + quantidade);
        }

        if (unidas !== anteriores) {
            mensagensRef.current = unidas;
            setMensagens(unidas);
        } else if (modo === "envio" && viewport) {
            // O polling pode ter recebido a mesma mensagem antes da resposta do POST.
            viewport.scrollTop = viewport.scrollHeight;
            ajusteRolagem.current = null;
        }
    }, [lado]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const ajuste = ajusteRolagem.current;
        ajusteRolagem.current = null;
        if (!viewport || !ajuste) return;
        if (ajuste.tipo === "final") viewport.scrollTop = viewport.scrollHeight;
        else {
            const ancora = viewport.querySelector<HTMLElement>(`[data-mensagem-id="${ajuste.id}"]`);
            if (ancora) viewport.scrollTop += ancora.getBoundingClientRect().top - viewport.getBoundingClientRect().top - ajuste.topo;
        }
        ultimaPosicao.current = viewport.scrollTop;
    }, [mensagens]);

    const carregarMensagens = useCallback(async (signal: AbortSignal) => {
        const versao = revisao.current;
        const valido = () => !signal.aborted && versao === revisao.current;
        try {
            const pagina = await buscarPagina(endpoint, signal);
            if (!valido()) return;

            const estadoArquivada = !!pagina.arquivadaEm;
            setArquivadaServidor(estadoArquivada);
            if (estadoArquivada !== arquivada) onAtualizarConversas?.();

            if (!inicializado.current) {
                cursorAntigo.current = pagina.mensagens[0]?.id ?? null;
                cursorRecente.current = pagina.mensagens.at(-1)?.id ?? null;
                setTemMaisAntigas(pagina.temMais);
                inicializado.current = true;
                mesclarPagina(pagina.mensagens, "inicial");
            } else {
                const fronteira = cursorRecente.current;
                // Se chegaram mais de 50 mensagens, recupera o intervalo em ordem,
                // antes de incorporar a janela mais recente. Nunca descarta o histórico.
                if (fronteira && pagina.temMais && !pagina.mensagens.some(m => m.id === fronteira)) {
                    let cursor = fronteira;
                    let temMais = true;
                    for (let i = 0; i < 5 && temMais; i++) {
                        const lote = await buscarPagina(endpoint, signal, {tipo: "depois", id: cursor});
                        if (!valido()) return;
                        mesclarPagina(lote.mensagens, "recentes");
                        const ultimo = lote.mensagens.at(-1)?.id;
                        if (ultimo) {
                            cursor = ultimo;
                            cursorRecente.current = ultimo;
                        }
                        temMais = lote.temMais && !!ultimo;
                    }
                    // Se houver mais páginas, o próximo ciclo continua deste cursor.
                    if (!temMais) mesclarPagina(pagina.mensagens, "recentes");
                } else if (!fronteira && pagina.temMais) {
                    // A conversa estava vazia: pode ter recebido mais de 50 desde então.
                    // Adota a janela recente, disponibilizando o restante no histórico.
                    cursorAntigo.current = pagina.mensagens[0]?.id ?? null;
                    cursorRecente.current = pagina.mensagens.at(-1)?.id ?? null;
                    setTemMaisAntigas(true);
                    mesclarPagina(pagina.mensagens, "recentes");
                } else {
                    if (!cursorAntigo.current) cursorAntigo.current = pagina.mensagens[0]?.id ?? null;
                    cursorRecente.current = pagina.mensagens.at(-1)?.id ?? fronteira;
                    mesclarPagina(pagina.mensagens, "recentes");
                }
            }
            setErro(null);
        } catch (erroRecebido) {
            if (!valido()) return;
            const status = typeof erroRecebido === "object" && erroRecebido !== null && "status" in erroRecebido ? erroRecebido.status : null;
            if (status === 401 || status === 403 || status === 404) {
                paginaAnterior.current?.abort();
                paginaAnterior.current = null;
                setCarregandoAntigas(false);
                setErroAntigas(null);
                setNovasMensagens(0);
                setLongeDoFinal(false);
                mensagensRef.current = [];
                setMensagens([]);
                inicializado.current = false;
                cursorAntigo.current = null;
                cursorRecente.current = null;
                setTemMaisAntigas(false);
                onAtualizarConversas?.();
            }
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao atualizar mensagens.");
        } finally {
            if (!signal.aborted) setCarregando(false);
        }
    }, [endpoint, arquivada, onAtualizarConversas, mesclarPagina]);

    const atualizarMensagens = useAtualizacaoPeriodica(carregarMensagens, 5000);

    useEffect(() => () => {paginaAnterior.current?.abort();}, [endpoint]);

    async function carregarAnteriores() {
        const cursor = cursorAntigo.current;
        if (!cursor || !temMaisAntigas || paginaAnterior.current || carregando || erro) return;
        const controller = new AbortController();
        paginaAnterior.current = controller;
        setCarregandoAntigas(true);
        setErroAntigas(null);
        try {
            const pagina = await buscarPagina(endpoint, controller.signal, {tipo: "antes", id: cursor});
            if (controller.signal.aborted) return;
            mesclarPagina(pagina.mensagens, "antigas");
            cursorAntigo.current = pagina.mensagens[0]?.id ?? cursor;
            setTemMaisAntigas(pagina.temMais);
        } catch (erroRecebido) {
            if (!controller.signal.aborted) setErroAntigas(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar mensagens anteriores.");
        } finally {
            if (paginaAnterior.current === controller) {
                paginaAnterior.current = null;
                if (!controller.signal.aborted) setCarregandoAntigas(false);
            }
        }
    }

    function rolarAoFinal() {
        const viewport = viewportRef.current;
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
        setNovasMensagens(0);
        setLongeDoFinal(false);
    }

    function aoRolar({y}: {x: number; y: number}) {
        const subindo = y < ultimaPosicao.current;
        ultimaPosicao.current = y;
        const viewport = viewportRef.current;
        const noFinal = pertoDoFinal(viewport);
        setLongeDoFinal(!noFinal);
        if (noFinal) setNovasMensagens(0);
        if (subindo && y <= 60 && viewport && viewport.scrollHeight > viewport.clientHeight && !erroAntigas) void carregarAnteriores();
    }

    // Marca somente mensagens recebidas, visíveis no viewport e com a janela em foco.
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || carregando || erro || !mensagens.some(m => m.remetenteTipo !== lado && !m.lida)) return;

        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let executando = false;
        const prefixo = lado === "admin" ? "/api/conversas" : "/api/me/conversas";

        async function registrarVisiveis() {
            if (!viewport || executando || controller.signal.aborted || document.hidden || !document.hasFocus()) return;
            const area = viewport.getBoundingClientRect();
            const mensagemIds = Array.from(viewport.querySelectorAll<HTMLElement>("[data-nao-lida]"))
                .filter(elemento => {
                    const rect = elemento.getBoundingClientRect();
                    return Math.min(rect.bottom, area.bottom, window.innerHeight) > Math.max(rect.top, area.top, 0)
                        && Math.min(rect.right, area.right, window.innerWidth) > Math.max(rect.left, area.left, 0);
                })
                .map(elemento => elemento.dataset.naoLida!)
                .slice(0, 100);
            if (!mensagemIds.length) return;

            executando = true;
            try {
                const resposta = await fetch(`${prefixo}/${conversaId}/leituras`, {
                    method: "POST", signal: controller.signal,
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({mensagemIds}),
                });
                if (!resposta.ok) throw new Error("Falha ao registrar leitura.");
                const dados = await resposta.json();
                if (controller.signal.aborted || !Array.isArray(dados.mensagemIds)) return;
                const lidas = new Set<string>(dados.mensagemIds);
                const atualizadas = mensagensRef.current.map(m => lidas.has(m.id) && !m.lida ? {...m, lida: true} : m);
                mensagensRef.current = atualizadas;
                setMensagens(atualizadas);
                window.dispatchEvent(new Event(EVENTO_LEITURA));
            } catch (erroRecebido) {
                if (!controller.signal.aborted) {
                    console.error("Falha ao registrar leitura:", erroRecebido);
                    // O próximo poll pode não mudar o histórico; agenda uma nova tentativa.
                    clearTimeout(timer);
                    timer = setTimeout(() => {void registrarVisiveis();}, 5000);
                }
            } finally {
                executando = false;
            }
        }

        function agendar() {
            clearTimeout(timer);
            if (!document.hidden && document.hasFocus()) timer = setTimeout(() => {void registrarVisiveis();}, 300);
        }
        viewport.addEventListener("scroll", agendar, {passive: true});
        window.addEventListener("scroll", agendar, {passive: true});
        window.addEventListener("focus", agendar);
        window.addEventListener("resize", agendar);
        document.addEventListener("visibilitychange", agendar);
        agendar();
        return () => {
            controller.abort();
            clearTimeout(timer);
            viewport.removeEventListener("scroll", agendar);
            window.removeEventListener("scroll", agendar);
            window.removeEventListener("focus", agendar);
            window.removeEventListener("resize", agendar);
            document.removeEventListener("visibilitychange", agendar);
        };
    }, [mensagens, conversaId, lado, carregando, erro]);

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
            mesclarPagina([dados], "envio");
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

            <Box pos="relative">
                <ScrollArea h={440} viewportRef={viewportRef} onScrollPositionChange={aoRolar}>
                    <Stack gap="sm">

                        {carregando && <Center><Loader size="sm"/></Center>}

                        {erro && <Alert color="red">{erro}</Alert>}

                        {!carregando && !erro && mensagens.length === 0 && <Center h={400}><Text c="dimmed" size="sm">Nenhuma mensagem por enquanto.</Text></Center>}

                        {!carregando && mensagens.length > 0 && <Center h={36}>
                            {temMaisAntigas ? <Button size="compact-xs" variant="subtle" loading={carregandoAntigas} onClick={() => void carregarAnteriores()}>{erroAntigas ? "Tentar carregar anteriores novamente" : "↑ Carregar mensagens anteriores"}</Button> : <Text size="xs" c="dimmed">Início da conversa</Text>}
                        </Center>}
                        {mensagens.map((mensagem, indice) => (
                            <Box key={mensagem.id}>
                                {(indice === 0 || diaMensagem(mensagens[indice - 1].enviadaEm) !== diaMensagem(mensagem.enviadaEm)) && <Divider my="sm" label={diaMensagem(mensagem.enviadaEm)} labelPosition="center"/>}
                                <Group data-mensagem-id={mensagem.id} data-nao-lida={mensagem.remetenteTipo !== lado && !mensagem.lida ? mensagem.id : undefined} justify={mensagem.remetenteTipo === lado ? "flex-end" : "flex-start"}>
                                    <Box bg={mensagem.remetenteTipo === lado ? "violet.8" : "var(--mantine-color-default-hover)"} c={mensagem.remetenteTipo === lado ? "white" : undefined} p="sm" maw="80%" style={{borderRadius: 12}}>
                                        <Text size="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{mensagem.conteudo}</Text>
                                        <Text size="xs" opacity={0.7} ta="right">{new Date(mensagem.enviadaEm).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}</Text>
                                    </Box>
                                </Group>
                            </Box>
                        ))}

                    </Stack>
                </ScrollArea>
            {longeDoFinal && <Button pos="absolute" bottom={8} right={16} size="xs" radius="xl" onClick={rolarAoFinal}>{novasMensagens > 0 ? `${novasMensagens} ${novasMensagens === 1 ? "nova mensagem" : "novas mensagens"} ↓` : "↓ Ir ao final"}</Button>}
            </Box>

            <Divider/>

            {erroAntigas && <Alert color="yellow">{erroAntigas}</Alert>}
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
