import { Alert, Button, Group, Modal, Stack, Switch, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api-fetch";

const base = "/api/conta/push";
type Config = { disponivel: boolean; chavePublica: string | null };
type Estado = { config: Config; ativa: boolean; permissao: NotificationPermission };

function suportaPush() {
    return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function requisicao<T>(rota: string, method = "GET", corpo?: object): Promise<T> {
    const resposta = await apiFetch(`${base}${rota}`, {
        method, cache: "no-store",
        ...(corpo ? {headers: {"Content-Type": "application/json"}, body: JSON.stringify(corpo)} : {}),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível acessar as notificações.");
    return dados as T;
}

async function registroAtivo() {
    const registro = await navigator.serviceWorker.getRegistration("/");
    if (!registro?.active) throw new Error("O serviço de notificações ainda não está pronto. Atualize a página e tente novamente.");
    return registro;
}

async function consultarEstado(): Promise<Estado> {
    const config = await requisicao<Config>("/config");
    const registro = await registroAtivo();
    const inscricao = await registro.pushManager.getSubscription();
    const ativa = inscricao ? (await requisicao<{ativa: boolean}>("/status", "POST", {endpoint: inscricao.endpoint})).ativa : false;
    return {config, ativa, permissao: Notification.permission};
}

function decodificarChave(valor: string) {
    const base64 = valor.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(valor.length / 4) * 4, "=");
    const binario = atob(base64);
    const chave = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) chave[i] = binario.charCodeAt(i);
    return chave;
}

// Apenas decisões sobre convites, por conta e navegador; nunca inscrições ou credenciais.
type EtapaConvite = "entrada" | "mensagens";
const convitesMemoria = new Set<string>();
function chaveConvite(usuarioId: string, etapa: EtapaConvite) {
    return `funilador.push.convite.v2.${usuarioId}.${etapa}`;
}
function conviteDispensado(usuarioId: string, etapa: EtapaConvite) {
    const chave = chaveConvite(usuarioId, etapa);
    try { return convitesMemoria.has(chave) || localStorage.getItem(chave) === "1"; }
    catch { return convitesMemoria.has(chave); }
}
function definirConviteDispensado(usuarioId: string, etapa: EtapaConvite) {
    const chave = chaveConvite(usuarioId, etapa);
    convitesMemoria.add(chave);
    try { localStorage.setItem(chave, "1"); } catch { /* manter decisão em memória */ }
}
function encerrarConvites(usuarioId: string) {
    definirConviteDispensado(usuarioId, "entrada");
    definirConviteDispensado(usuarioId, "mensagens");
}

type Props = {usuarioId: string; convite?: boolean; emMensagens?: boolean; chaveRota?: string};
export function PreferenciasPush({usuarioId, convite = false, emMensagens = false, chaveRota = ""}: Props) {
    const suportado = suportaPush();
    const [estado, setEstado] = useState<Estado | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [entradaDispensada, setEntradaDispensada] = useState(() => conviteDispensado(usuarioId, "entrada"));
    const [mensagensDispensadas, setMensagensDispensadas] = useState(() => conviteDispensado(usuarioId, "mensagens"));
    const [rotaDispensada, setRotaDispensada] = useState<string | null>(null);
    const etapa: EtapaConvite | null = !convite ? null : !entradaDispensada ? "entrada"
        : emMensagens && !mensagensDispensadas && rotaDispensada !== chaveRota ? "mensagens" : null;

    function dispensar() {
        if (!etapa || ocupado) return;
        definirConviteDispensado(usuarioId, etapa);
        if (etapa === "entrada") {
            setEntradaDispensada(true);
            // Se o login abriu diretamente o chat, esperar outra navegação antes de convidar de novo.
            if (emMensagens) setRotaDispensada(chaveRota);
        } else setMensagensDispensadas(true);
    }

    function finalizarConvites() {
        encerrarConvites(usuarioId);
        setEntradaDispensada(true);
        setMensagensDispensadas(true);
    }

    useEffect(() => {
        if (!suportado || (convite && !etapa)) return;
        let cancelado = false;
        void consultarEstado().then(valor => {
            if (!cancelado) setEstado(valor);
        }).catch((e: unknown) => {
            if (!cancelado) setErro(e instanceof Error ? e.message : "Não foi possível consultar as notificações.");
        });
        return () => {cancelado = true;};
    }, [suportado, convite, etapa]);

    async function alterar(ativar: boolean) {
        if (!estado || ocupado) return;
        setOcupado(true); setErro(""); setAviso("");
        try {
            // A solicitação deve ocorrer diretamente na interação do usuário, antes de outras esperas.
            if (ativar) {
                const permissao = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
                if (permissao !== "granted") throw new Error("Permita as notificações nas configurações do navegador para ativar este recurso.");
            }
            const registro = await registroAtivo();
            const anterior = await registro.pushManager.getSubscription();
            if (ativar) {
                const config = await requisicao<Config>("/config");
                if (!config.disponivel || !config.chavePublica) throw new Error("O serviço Push está indisponível.");
                if (anterior) {
                    const status = await requisicao<{ativa: boolean}>("/status", "POST", {endpoint: anterior.endpoint});
                    if (status.ativa) {finalizarConvites(); setEstado({...estado, config, ativa: true, permissao: Notification.permission}); return;}
                    // Inscrição de uma sessão anterior: não transferir o endpoint entre contas.
                    if (!await anterior.unsubscribe()) throw new Error("Não foi possível substituir a inscrição anterior. Tente novamente.");
                }
                const inscricao = await registro.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: decodificarChave(config.chavePublica)});
                try {
                    await requisicao<{ativa: boolean}>("/inscricao", "POST", inscricao.toJSON());
                } catch (e) {
                    // Se a API não confirmar o registro, não deixar a nova inscrição ativa no navegador.
                    await inscricao.unsubscribe().catch(() => {});
                    throw e;
                }
                finalizarConvites();
                setEstado({config, ativa: true, permissao: Notification.permission});
                setAviso("Notificações ativadas neste navegador.");
            } else {
                if (anterior) {
                    // Primeiro revogar no servidor; só então remover a inscrição local.
                    await requisicao<{ativa: boolean}>("/inscricao", "DELETE", {endpoint: anterior.endpoint});
                    finalizarConvites();
                    setEstado({...estado, ativa: false, permissao: Notification.permission});
                    if (!await anterior.unsubscribe()) throw new Error("Os avisos foram desativados no servidor, mas o navegador não removeu a inscrição local.");
                }
                setEstado({...estado, ativa: false, permissao: Notification.permission});
                finalizarConvites();
                setAviso("Notificações desativadas. Os avisos internos continuam disponíveis.");
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Não foi possível alterar as notificações.");
            try {setEstado(await consultarEstado());} catch { /* preservar a última informação confirmada */ }
        } finally {setOcupado(false);}
    }

    async function testar() {
        if (!estado?.ativa || ocupado) return;
        setOcupado(true); setErro(""); setAviso("");
        try {
            const inscricao = await (await registroAtivo()).pushManager.getSubscription();
            if (!inscricao) throw new Error("Ative as notificações neste navegador.");
            await requisicao<{enviado: boolean}>("/teste", "POST", {endpoint: inscricao.endpoint});
            setAviso("Teste aceito pelo serviço Push. Confira as notificações do dispositivo.");
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Não foi possível enviar o teste.");
            try {setEstado(await consultarEstado());} catch { /* preservar a última informação confirmada */ }
        } finally {setOcupado(false);}
    }

    async function atualizar() {
        setOcupado(true); setErro(""); setAviso("");
        try {setEstado(await consultarEstado());}
        catch (e) {setErro(e instanceof Error ? e.message : "Não foi possível consultar as notificações.");}
        finally {setOcupado(false);}
    }

    if (convite) {
        const mostrar = suportado && !!etapa && !!estado && estado.config.disponivel
            && !estado.ativa && estado.permissao !== "denied";
        return <Modal opened={mostrar} onClose={dispensar} centered size="sm" title={etapa === "entrada" ? "Receber notificações do Funilador?" : "Receber avisos de mensagens?"}
            closeOnClickOutside={!ocupado} closeOnEscape={!ocupado} withCloseButton={!ocupado}>
            <Stack gap="sm">
                <Text size="sm">{etapa === "entrada" ? "Ative as notificações para receber avisos de novidades, mesmo com o Funilador fechado." : "Ative as notificações para saber quando houver novas mensagens e outras novidades, mesmo com o Funilador fechado."}</Text>
                <Text size="xs" c="dimmed">Você pode continuar usando o Funilador sem ativar e alterar essa escolha em Conta → Configurações.</Text>
                {erro && <Alert color="red" role="alert">{erro}</Alert>}
                <Button loading={ocupado} onClick={() => void alterar(true)}>Ativar notificações</Button>
                <Button variant="subtle" disabled={ocupado} onClick={dispensar}>Agora não</Button>
            </Stack>
        </Modal>;
    }

    return <Stack gap="sm">
        <Text fw={700} size="lg">Notificações</Text>
        <Text size="sm" c="dimmed">Receba avisos do Funilador neste navegador, mesmo com a aplicação fechada, quando o dispositivo permitir.</Text>
        {!suportado ? <Alert color="gray">Notificações Push não estão disponíveis neste navegador. No iPhone ou iPad, instale o Funilador na tela inicial e abra o aplicativo.</Alert> : <>
            <Switch label="Notificações Push" description="Ative ou desative para a sessão deste navegador. Os avisos internos continuam funcionando." checked={estado?.ativa ?? false} disabled={ocupado || !estado || (!estado.ativa && (!estado.config.disponivel || estado.permissao === "denied"))} onChange={e => void alterar(e.currentTarget.checked)}/>
            {!estado && !erro && <Text size="xs" c="dimmed">Consultando inscrição...</Text>}
            {estado?.permissao === "denied" && <Alert color="yellow">As notificações estão bloqueadas pelo navegador. Altere a permissão nas configurações do site e atualize o estado.</Alert>}
            {estado && !estado.config.disponivel && <Alert color="yellow">O envio Push está indisponível no servidor.</Alert>}
            <Group gap="xs" wrap="wrap">
                <Button variant="light" size="sm" disabled={!estado?.ativa || estado.permissao !== "granted" || !estado.config.disponivel || ocupado} onClick={() => void testar()}>Enviar notificação de teste</Button>
                <Button variant="subtle" size="sm" disabled={ocupado} onClick={() => void atualizar()}>Atualizar estado</Button>
            </Group>
            <Text size="xs" c="dimmed">Ao sair da conta ou ter a sessão encerrada, será necessário ativar novamente. Em navegadores compartilhados, utilize apenas uma inscrição por vez.</Text>
            {erro && <Alert color="red" role="alert">{erro}</Alert>}
            {aviso && <Alert color="green" role="status">{aviso}</Alert>}
        </>}
    </Stack>;
}
