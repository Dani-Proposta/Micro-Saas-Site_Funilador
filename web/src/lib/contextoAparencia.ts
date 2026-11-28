import { createContext, useContext } from "react";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { aparenciaPadrao } from "./aparencia";
import type { Aparencia } from "./aparencia";

export const ContextoAparencia = createContext<{aparencia: Aparencia; aplicar: (valor: Aparencia) => void}>({aparencia:aparenciaPadrao, aplicar:() => {}});

export function useAparencia() { return useContext(ContextoAparencia); }

export function useMovimentoReduzido() {
    const sistema = useReducedMotion();
    const {aparencia} = useAparencia();
    return sistema || aparencia.movimento === "reduzido";
}

// Identidade compartilhada, com navegação e layout específicos por dispositivo.
export function useExpressivo() { return useAparencia().aparencia.estilo === "expressivo"; }
export function useExpressivoMobile() {
    const ativo=useExpressivo();
    const desktop=useMediaQuery("(min-width:48em)",false,{getInitialValueInEffect:false});
    return ativo && !desktop;
}

export function useExpressivoDesktop() {
    const {aparencia} = useAparencia();
    const desktop = useMediaQuery("(min-width:48em)", false, {getInitialValueInEffect:false});
    return aparencia.estilo === "expressivo" && desktop;
}
