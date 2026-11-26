import chat from "../styles/Chat.module.css";
import { Carregamento } from "./Carregamento";
import classes from "../styles/Usabilidade.module.css";
import { CartaoProposta, FormularioProposta, ResumoProjetoChat } from "./NegociacaoProjeto";
import type { Proposta, EstadoProposta } from "./NegociacaoProjeto";
import { TextoExpansivel } from "./TextoExpansivel";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EVENTO_LEITURA } from "../hooks/useMensagensNaoLidas";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { ActionIcon, Alert, Box, Button, Center, Divider, Group, Menu, ScrollArea, Stack, Text, Textarea } from "@mantine/core";

type Mensagem = {
    id: string;
    remetenteTipo: "admin" | "cliente";
    conteudo: string;
    enviadaEm: string;
    lida?: boolean;
    proposta?: Proposta | null;
    decisaoProposta?: {id: string; status: EstadoProposta} | null;
};

// As datas retornadas pela API são UTC com seis dígitos de precisão.
function unirMensagens(anteriores: Mensagem[], novas: Mensagem[]) {
    const unicas = new Map(anteriores.map(mensagem => [mensagem.id, mensagem]));
    for (const mensagem of novas) {
        const anterior = unicas.get(mensagem.id);
        const proposta = anterior?.proposta && anterior.proposta.status !== "pendente" && mensagem.proposta?.status === "pendente" ? anterior.proposta : mensagem.proposta;
        unicas.set(mensagem.id, {...mensagem, proposta, lida: !!(anterior?.lida || mensagem.lida)});
    }

    const decisoes = new Map(Array.from(unicas.values()).flatMap(m => m.decisaoProposta ? [[m.decisaoProposta.id, m.decisaoProposta.status] as const] : []));
    const ordenadas = Array.from(unicas.values()).map(m => m.proposta && decisoes.has(m.proposta.id) ? {...m, proposta: {...m.proposta, status: decisoes.get(m.proposta.id)!}} : m).sort((a, b) =>
        a.enviadaEm < b.enviadaEm ? -1 :
        a.enviadaEm > b.enviadaEm ? 1 :
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    // Não recria o estado em polls que não trouxeram nenhuma mudança.
    return ordenadas.length === anteriores.length && ordenadas.every((m, i) => {
        const a = anteriores[i];
        return m.id === a.id && m.lida === !!a.lida && m.conteudo === a.conteudo && m.enviadaEm === a.enviadaEm && m.remetenteTipo === a.remetenteTipo && m.proposta?.status === a.proposta?.status && m.proposta?.marcoId === a.proposta?.marcoId && m.proposta?.id === a.proposta?.id && m.decisaoProposta?.id === a.decisaoProposta?.id;
    }) ? anteriores : ordenadas;
}

type Pagina = {mensagens: Mensagem[]; arquivadaEm: string | null; temMais: boolean; primeiraNaoLidaId?: string | null};
type AjusteRolagem = {tipo: "final"} | {tipo: "ancora"; id: string; topo: number} | {tipo: "nao-lida"; id: string};

function pertoDoFinal(viewport: HTMLDivElement | null) {
    return !viewport || viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 80;
}

function diaMensagem(data: string) {
    return new Date(data).toLocaleDateString("pt-BR");
}

async function buscarPagina(endpoint: string, signal: AbortSignal, cursor?: {tipo: "antes" | "depois" | "aPartir"; id: string}, inicio = false): Promise<Pagina> {
    const consulta = new URLSearchParams({estado: "true"});
    if (cursor) consulta.set(cursor.tipo, cursor.id);
    if (inicio) consulta.set("inicio", "true");
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
    projetoId?: string | null;
    arquivada?: boolean;
    lado?: "admin" | "cliente";
    onAtualizarConversas?: () => void;
    acoesArquivada?: ReactNode;
    identidade?: ReactNode;
    estadoConversa?: ReactNode;
    acoesConversa?: ReactNode;
};

export function HistoricoMensagens({conversaId, projetoId, arquivada = false, lado = "admin", onAtualizarConversas, acoesArquivada, identidade, estadoConversa, acoesConversa}: HistoricoProps) {

    const [mensagens, setMensagens] = useState<Mensagem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [novaProposta, setNovaProposta] = useState(false);
    const [dadosProjeto, setDadosProjeto] = useState(false);
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
    const [marcadorInicial, setMarcadorInicial] = useState<string | null>(null);
    const [marcandoTodas, setMarcandoTodas] = useState(false);
    const [erroLeitura, setErroLeitura] = useState<string | null>(null);
    const filaLeitura = useRef(new Set<string>());
    const capturarLeituras = useRef<(() => void) | null>(null);
    const prefixo = lado === "admin" ? "/api/conversas" : "/api/me/conversas";
    const endpointLeitura = `${prefixo}/${conversaId}/leituras`;

    const mesclarPagina = useCallback((recebidas: Mensagem[], modo: "inicial" | "antigas" | "recentes" | "envio") => {
        const anteriores = mensagensRef.current;
        const unidas = unirMensagens(anteriores, recebidas);
        const viewport = viewportRef.current;

        if (modo === "inicial" || modo === "envio" || (modo === "recentes" && pertoDoFinal(viewport) && (!ajusteRolagem.current || ajusteRolagem.current.tipo === "final"))) {
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
            if (ancora) viewport.scrollTop += ancora.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (ajuste.tipo === "nao-lida" ? 65 : ajuste.topo);
        }
        ultimaPosicao.current = viewport.scrollTop;
    }, [mensagens]);

    const carregarMensagens = useCallback(async (signal: AbortSignal) => {
        const versao = revisao.current;
        const valido = () => !signal.aborted && versao === revisao.current;
        try {
            const pagina = await buscarPagina(endpoint, signal, undefined, !inicializado.current);
            if (!valido()) return;

            const estadoArquivada = !!pagina.arquivadaEm;
            setArquivadaServidor(estadoArquivada);
            if (estadoArquivada !== arquivada) onAtualizarConversas?.();

            if (!inicializado.current) {
                const primeira = pagina.primeiraNaoLidaId ?? null;
                let janela = pagina.mensagens;
                let temMaisAntigas = pagina.temMais;
                if (primeira && !janela.some(m => m.id === primeira)) {
                    // Começa na primeira pendente mesmo se estiver longe das 50 recentes.
                    const [anteriores, seguintes] = await Promise.all([
                        buscarPagina(endpoint, signal, {tipo: "antes", id: primeira}),
                        buscarPagina(endpoint, signal, {tipo: "aPartir", id: primeira}),
                    ]);
                    if (!valido()) return;
                    janela = unirMensagens(anteriores.mensagens, seguintes.mensagens);
                    temMaisAntigas = anteriores.temMais;
                }
                cursorAntigo.current = janela[0]?.id ?? null;
                cursorRecente.current = janela.at(-1)?.id ?? null;
                setTemMaisAntigas(temMaisAntigas);
                inicializado.current = true;
                mesclarPagina(janela, "inicial");
                if (primeira && janela.some(m => m.id === primeira)) {
                    ajusteRolagem.current = {tipo: "nao-lida", id: primeira};
                    setMarcadorInicial(primeira);
                    setLongeDoFinal(true);
                }
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
                setMarcadorInicial(null);
                filaLeitura.current.clear();
                onAtualizarConversas?.();
            }
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao atualizar mensagens.");
        } finally {
            if (!signal.aborted) setCarregando(false);
        }
    }, [endpoint, arquivada, onAtualizarConversas, mesclarPagina]);

    const atualizarMensagens = useAtualizacaoPeriodica(carregarMensagens, 5000);
    const endpointPropostas = `${prefixo}/${conversaId}/propostas`;
    const atualizarNegociacao = () => {atualizarMensagens(); onAtualizarConversas?.();};

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

    // A captura acontece durante a rolagem; a rede recebe lotes sem reiniciar o timer.
    const aplicarLeituras = useCallback((ids: string[]) => {
        const lidas = new Set(ids);
        const anteriores = mensagensRef.current;
        const atualizadas = anteriores.map(m => lidas.has(m.id) && !m.lida ? {...m, lida: true} : m);
        if (atualizadas.some((m, i) => m !== anteriores[i])) {
            mensagensRef.current = atualizadas;
            setMensagens(atualizadas);
        }
        window.dispatchEvent(new Event(EVENTO_LEITURA));
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const controller = new AbortController();
        const fila = filaLeitura.current;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let executando = false;
        let quadro: number | undefined;

        function agendarEnvio(atraso = 250) {
            if (timer !== undefined || executando || !fila.size || controller.signal.aborted) return;
            timer = setTimeout(() => {timer = undefined; void enviarLote();}, atraso);
        }

        async function enviarLote() {
            if (executando || controller.signal.aborted || !fila.size) return;
            const mensagemIds = Array.from(fila).slice(0, 100);
            executando = true;
            let falhou = false;
            try {
                const resposta = await fetch(endpointLeitura, {method: "POST", signal: controller.signal, headers: {"Content-Type": "application/json"}, body: JSON.stringify({mensagemIds})});
                if (!resposta.ok) throw new Error("Falha ao registrar leitura.");
                const dados = await resposta.json();
                if (controller.signal.aborted) return;
                if (!Array.isArray(dados.mensagemIds)) throw new Error("Resposta de leitura inválida.");
                mensagemIds.forEach(id => fila.delete(id));
                aplicarLeituras(dados.mensagemIds);
            } catch (erroRecebido) {
                if (!controller.signal.aborted) {falhou = true; console.error("Falha ao registrar leitura:", erroRecebido);}
            } finally {
                executando = false;
                agendarEnvio(falhou ? 3000 : 250);
            }
        }

        function capturar() {
            if (!viewport || controller.signal.aborted || document.hidden || !document.hasFocus()) return;
            const area = viewport.getBoundingClientRect();
            for (const elemento of viewport.querySelectorAll<HTMLElement>("[data-nao-lida]")) {
                const rect = elemento.getBoundingClientRect();
                if (Math.min(rect.bottom, area.bottom, window.innerHeight) > Math.max(rect.top, area.top, 0)
                    && Math.min(rect.right, area.right, window.innerWidth) > Math.max(rect.left, area.left, 0)) {
                    if (elemento.dataset.naoLida) fila.add(elemento.dataset.naoLida);
                }
            }
            agendarEnvio();
        }
        function agendarCaptura() {
            if (quadro !== undefined) return;
            quadro = requestAnimationFrame(() => {quadro = undefined; capturar();});
        }
        const observer = new ResizeObserver(agendarCaptura);
        observer.observe(viewport);
        const conteudoViewport = viewport.firstElementChild;
        if (conteudoViewport) observer.observe(conteudoViewport);
        capturarLeituras.current = agendarCaptura;
        viewport.addEventListener("scroll", capturar, {passive: true});
        window.addEventListener("scroll", capturar, {passive: true, capture: true});
        window.addEventListener("focus", agendarCaptura);
        window.addEventListener("resize", agendarCaptura);
        document.addEventListener("visibilitychange", agendarCaptura);
        agendarCaptura();
        return () => {
            controller.abort();
            clearTimeout(timer);
            if (quadro !== undefined) cancelAnimationFrame(quadro);
            capturarLeituras.current = null;
            observer.disconnect();
            viewport.removeEventListener("scroll", capturar);
            window.removeEventListener("scroll", capturar, true);
            window.removeEventListener("focus", agendarCaptura);
            window.removeEventListener("resize", agendarCaptura);
            document.removeEventListener("visibilitychange", agendarCaptura);
        };
    }, [endpointLeitura, aplicarLeituras]);

    useEffect(() => {
        if (!carregando && !erro) capturarLeituras.current?.();
    }, [mensagens, carregando, erro]);

    function irParaNaoLida() {
        const primeira = mensagensRef.current.find(m => m.remetenteTipo !== lado && !m.lida);
        const viewport = viewportRef.current;
        if (!primeira || !viewport) return;
        const elemento = viewport.querySelector<HTMLElement>(`[data-mensagem-id="${primeira.id}"]`);
        if (elemento) viewport.scrollTop += elemento.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 65;
    }

    async function marcarTodasComoLidas() {
        if (marcandoTodas) return;
        setMarcandoTodas(true);
        setErroLeitura(null);
        const ids = mensagensRef.current.filter(m => m.remetenteTipo !== lado && !m.lida).map(m => m.id);
        try {
            const resposta = await fetch(endpointLeitura, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({todas: true})});
            if (!resposta.ok) throw new Error("Não foi possível marcar a conversa como lida.");
            aplicarLeituras(ids);
            ids.forEach(id => filaLeitura.current.delete(id));
            atualizarMensagens();
        } catch (erroRecebido) {
            setErroLeitura(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao registrar leitura.");
        } finally {setMarcandoTodas(false);}
    }

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

    const totalNaoLidas = mensagens.filter(m => m.remetenteTipo !== lado && !m.lida).length;

    return (
        <Stack gap={4} className={classes.chatHistorico}>
            <Group justify="space-between" gap={4} className={chat.cabecalho} wrap="nowrap">
                {identidade}
                <Group gap={4} wrap="nowrap" className={chat.ferramentas}>
                    {estadoConversa}
                    <Menu withinPortal position="bottom-end" shadow="md" width={220}>
                        <Menu.Target><ActionIcon variant="subtle" color="gray" size="lg" aria-label="Gerenciar conversa" title="Gerenciar conversa">⋮</ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Gerenciar conversa</Menu.Label>
                            <Menu.Item disabled={!totalNaoLidas} onClick={irParaNaoLida}>Ir à não lida ({totalNaoLidas})</Menu.Item>
                            <Menu.Item disabled={carregando || !!erro || marcandoTodas} onClick={() => void marcarTodasComoLidas()}>Marcar conversa como lida</Menu.Item>
                            {projetoId && <><Menu.Divider/><Menu.Label>Projeto</Menu.Label><Menu.Item onClick={() => setDadosProjeto(true)}>Dados do projeto</Menu.Item>{!somenteLeitura && <Menu.Item disabled={carregando || !!erro} onClick={() => setNovaProposta(true)}>Nova proposta</Menu.Item>}</>}
                            {acoesConversa && <><Menu.Divider/>{acoesConversa}</>}
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>
            {projetoId && dadosProjeto && <ResumoProjetoChat projetoId={projetoId} lado={lado} onFechar={() => setDadosProjeto(false)}/>}
            {novaProposta && !somenteLeitura && <FormularioProposta endpoint={endpointPropostas} lado={lado} onAlterado={atualizarNegociacao} onFechar={() => setNovaProposta(false)}/>}
            {erroLeitura && <Alert color="red">{erroLeitura}</Alert>}
            <Box pos="relative" className={classes.chatArea}>
                <ScrollArea className={`${classes.chatScroll} ${chat.historico}`} offsetScrollbars viewportRef={viewportRef} onScrollPositionChange={aoRolar}>
                    <Stack gap={4}>

                        {carregando && <Center><Carregamento tipo="compacto" texto="Carregando mensagens..."/></Center>}

                        {erro && <Alert color="red">{erro}</Alert>}

                        {!carregando && !erro && mensagens.length === 0 && <Center py="xl"><Text c="dimmed" size="sm">Nenhuma mensagem por enquanto.</Text></Center>}

                        {!carregando && mensagens.length > 0 && <Center h={26}>
                            {temMaisAntigas ? <Button size="compact-xs" variant="subtle" loading={carregandoAntigas} onClick={() => void carregarAnteriores()}>{erroAntigas ? "Tentar carregar anteriores novamente" : "↑ Carregar mensagens anteriores"}</Button> : <Text size="xs" c="dimmed">Início da conversa</Text>}
                        </Center>}
                        {mensagens.map((mensagem, indice) => (
                            <Box key={mensagem.id}>
                                {(indice === 0 || diaMensagem(mensagens[indice - 1].enviadaEm) !== diaMensagem(mensagem.enviadaEm)) && <Divider my={5} label={diaMensagem(mensagem.enviadaEm)} labelPosition="center"/>}
                                {marcadorInicial === mensagem.id && <Divider my={5} color="violet" label="Mensagens não lidas" labelPosition="center"/>}
                                <Group data-mensagem-id={mensagem.id} data-nao-lida={mensagem.remetenteTipo !== lado && !mensagem.lida ? mensagem.id : undefined} justify={mensagem.remetenteTipo === lado ? "flex-end" : "flex-start"}>
                                    <Box className={chat.balao} data-propria={mensagem.remetenteTipo === lado} data-proposta={!!mensagem.proposta} data-balao-nao-lido={mensagem.remetenteTipo !== lado && !mensagem.lida} p={mensagem.proposta ? 0 : 6}>
                                        {mensagem.proposta ? <CartaoProposta proposta={mensagem.proposta} endpoint={endpointPropostas} lado={lado} somenteLeitura={somenteLeitura} onAlterado={atualizarNegociacao}/> : <TextoExpansivel texto={mensagem.conteudo} linhas={7}/>} 
                                        <Text size="xs" opacity={0.7} ta="right">{new Date(mensagem.enviadaEm).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}</Text>
                                    </Box>
                                </Group>
                            </Box>
                        ))}

                    </Stack>
                </ScrollArea>
            {longeDoFinal && <Button pos="absolute" bottom={6} right={12} size="compact-xs" radius="xl" onClick={rolarAoFinal}>{novasMensagens > 0 ? `${novasMensagens} ${novasMensagens === 1 ? "nova mensagem" : "novas mensagens"} ↓` : "↓ Ir ao final"}</Button>}
            </Box>

            {erroAntigas && <Alert color="yellow">{erroAntigas}</Alert>}
            {erroEnvio && !somenteLeitura && <Alert color="red">{erroEnvio}</Alert>}

            {somenteLeitura ? (
                <Alert color="gray" title="Conversa arquivada"><Stack gap="xs"><Text size="sm">{lado === "cliente" ? "Esta conversa foi arquivada pela administração. Você pode consultar o histórico, mas não enviar novas mensagens." : "Esta conversa está arquivada e disponível somente para consulta."}</Text>{acoesArquivada}</Stack></Alert>
            ) : (
                <form onSubmit={evento => {
                    evento.preventDefault();
                    void enviarMensagem();
                }}>
                    <Group align="flex-end" wrap="nowrap" gap={4} className={chat.compositor}>
                        <Textarea flex={1} miw={0} aria-label="Mensagem" placeholder="Digite sua mensagem..." value={conteudo} onChange={evento => setConteudo(evento.currentTarget.value)} autosize minRows={1} maxRows={4} maxLength={5000} disabled={enviando}/>
                        <Button type="submit" loading={enviando} disabled={carregando || !!erro || !conteudo.trim()}>Enviar</Button>
                    </Group>
                </form>
            )}

        </Stack>
    );
}
