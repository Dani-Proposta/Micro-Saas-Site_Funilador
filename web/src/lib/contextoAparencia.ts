import { createContext, useContext } from "react";
import { useReducedMotion } from "@mantine/hooks";
import { aparenciaPadrao } from "./aparencia";
import type { Aparencia } from "./aparencia";

export const ContextoAparencia = createContext<{aparencia: Aparencia; aplicar: (valor: Aparencia) => void}>({aparencia:aparenciaPadrao, aplicar:() => {}});

export function useAparencia() { return useContext(ContextoAparencia); }

export function useMovimentoReduzido() {
    const sistema = useReducedMotion();
    const {aparencia} = useAparencia();
    return sistema || aparencia.movimento === "reduzido";
}
