import { notifications } from "@mantine/notifications";
import type { ReactNode } from "react";

export type TipoToast = "sucesso" | "info" | "aviso" | "erro" | "carregando";
type ToastDados = {titulo: string; mensagem: ReactNode; duracao?: number | false; cor?: string};
const cores = {sucesso:"teal", info:"blue", aviso:"orange", erro:"red", carregando:"blue"} as const;
const duracoes = {sucesso:4000, info:5000, aviso:7000, erro:10000, carregando:false} as const;
const caminhos = {
    sucesso:"m7 12 3 3 7-7",
    info:"M12 11v5 M12 7h.01",
    aviso:"M12 8v5 M12 17h.01",
    erro:"m8 8 8 8 M16 8l-8 8",
} as const;

function icone(tipo: Exclude<TipoToast, "carregando">) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {tipo === "aviso" ? <path d="M12 3 2.5 20h19L12 3Z"/> : <circle cx="12" cy="12" r="10"/>}
        <path d={caminhos[tipo]}/>
    </svg>;
}

function opcoes(tipo: TipoToast, dados: ToastDados) {
    return {
        title: dados.titulo,
        message: dados.mensagem,
        color: dados.cor ?? cores[tipo],
        loading: tipo === "carregando",
        icon: tipo === "carregando" ? undefined : icone(tipo),
        autoClose: dados.duracao ?? duracoes[tipo],
        withCloseButton: true,
        withBorder: true,
        closeButtonProps: {"aria-label":"Fechar notificação"},
        className: "funilador-toast",
        role: tipo === "erro" || tipo === "aviso" ? "alert" as const : "status" as const,
    };
}

// API compartilhada: não persiste nem envia notificações ao servidor.
export const toast = {
    mostrar(tipo: TipoToast, dados: ToastDados) {
        return notifications.show(opcoes(tipo, dados));
    },
    atualizar(id: string, tipo: TipoToast, dados: ToastDados) {
        notifications.update({id, ...opcoes(tipo, dados)});
    },
    fechar(id: string) { notifications.hide(id); },
    limpar() { notifications.clean(); },
};
