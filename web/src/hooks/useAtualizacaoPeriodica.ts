import { useCallback, useEffect, useRef } from "react";

// Uma requisição por vez; pausa em abas ocultas e retoma ao voltar.
export function useAtualizacaoPeriodica(
    carregar: (signal: AbortSignal) => Promise<void>,
    intervalo: number,
) {
    const solicitarRef = useRef<() => void>(() => {});

    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let executando = false;
        let pendente = false;

        function agendar() {
            if (controller.signal.aborted || document.hidden) return;
            clearTimeout(timer);
            timer = setTimeout(() => { void executar(); }, intervalo);
        }

        async function executar() {
            clearTimeout(timer);
            if (controller.signal.aborted || document.hidden) return;
            if (executando) {
                pendente = true;
                return;
            }

            executando = true;
            pendente = false;
            try {
                await carregar(controller.signal);
            } catch (erro) {
                if (!controller.signal.aborted) console.error("Falha na atualização periódica:", erro);
            } finally {
                executando = false;
                if (!controller.signal.aborted && !document.hidden) {
                    if (pendente) void executar();
                    else agendar();
                }
            }
        }

        function visibilidade() {
            if (document.hidden) clearTimeout(timer);
            else void executar();
        }

        solicitarRef.current = () => { void executar(); };
        document.addEventListener("visibilitychange", visibilidade);
        void executar();

        return () => {
            controller.abort();
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", visibilidade);
            solicitarRef.current = () => {};
        };
    }, [carregar, intervalo]);

    return useCallback(() => solicitarRef.current(), []);
}
