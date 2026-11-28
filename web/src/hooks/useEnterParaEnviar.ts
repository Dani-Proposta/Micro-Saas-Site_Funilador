import { useSyncExternalStore } from "react";
import { authClient } from "../lib/auth-client";

const evento = "funilador-chat-enter";
const padrao = () => false;

function inscrever(notificar: () => void) {
    window.addEventListener(evento, notificar);
    window.addEventListener("storage", notificar);
    return () => {
        window.removeEventListener(evento, notificar);
        window.removeEventListener("storage", notificar);
    };
}

// Preferência local por conta, independente da conversa e do estilo visual.
export function useEnterParaEnviar() {
    const {data} = authClient.useSession();
    const chave = data?.user.id ? `funilador:chat:enter:v1:${data.user.id}` : null;
    const ativo = useSyncExternalStore(inscrever, () => {
        try { return !!chave && localStorage.getItem(chave) === "1"; }
        catch { return false; }
    }, padrao);

    function salvar(valor: boolean) {
        if (!chave) return false;
        try {
            localStorage.setItem(chave, valor ? "1" : "0");
            window.dispatchEvent(new Event(evento));
            return true;
        } catch { return false; }
    }

    return {ativo, salvar, disponivel: !!chave};
}

type TeclaChat = {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    repeat: boolean;
    nativeEvent: {isComposing: boolean; keyCode: number};
    defaultPrevented: boolean;
};

// Não interfere em atalhos do SO ou na confirmação de caracteres de um IME.
export function acaoEnterChat(ativo: boolean, evento: TeclaChat, podeEnviar: boolean) {
    if (!ativo || evento.defaultPrevented || evento.key !== "Enter" || evento.shiftKey || evento.ctrlKey || evento.altKey || evento.metaKey || evento.nativeEvent.isComposing || evento.nativeEvent.keyCode === 229) return "nativa";
    return evento.repeat || !podeEnviar ? "bloquear" : "enviar";
}
