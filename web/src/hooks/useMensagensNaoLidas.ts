import { apiFetch } from "../lib/api-fetch";
import { useCallback, useEffect, useState } from "react";
import { useAtualizacaoPeriodica } from "./useAtualizacaoPeriodica";

export const EVENTO_LEITURA = "funilador:mensagens-lidas";

export function useMensagensNaoLidas(lado: "admin" | "cliente", habilitado: boolean, identidade: string | undefined) {
    const [resumo, setResumo] = useState<{identidade: string; total: number} | null>(null);
    const carregar = useCallback(async (signal: AbortSignal) => {
        if (!habilitado || !identidade) return;
        try {
            const prefixo = lado === "admin" ? "/api/conversas" : "/api/me/conversas";
            const resposta = await apiFetch(`${prefixo}/nao-lidas`, {signal, cache: "no-store"});
            if (signal.aborted) return;
            if ([401, 403].includes(resposta.status)) {setResumo(null); return;}
            if (!resposta.ok) throw new Error("Falha ao consultar mensagens não lidas.");
            const dados = await resposta.json();
            if (!signal.aborted && Number.isInteger(dados.total)) setResumo({identidade, total: dados.total});
        } catch (erro) {
            if (!signal.aborted) console.error("Erro no contador de mensagens:", erro);
        }
    }, [lado, habilitado, identidade]);
    const atualizar = useAtualizacaoPeriodica(carregar, 10000);
    useEffect(() => {
        if (!habilitado) return;
        window.addEventListener(EVENTO_LEITURA, atualizar);
        return () => window.removeEventListener(EVENTO_LEITURA, atualizar);
    }, [atualizar, habilitado]);
    return habilitado && resumo?.identidade === identidade ? resumo?.total ?? null : null;
}
