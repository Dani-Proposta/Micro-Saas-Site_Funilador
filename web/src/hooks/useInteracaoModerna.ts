import { useEffect } from "react";
import { useAnimate } from "motion/react";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";

export function useModerno() {
    const {aparencia} = useAparencia();
    return aparencia.estilo === "moderno";
}

export function useAnimacaoConteudo(identidade:string|number) {
    const moderno = useModerno();
    const reduzir = useMovimentoReduzido();
    const [scope,animate] = useAnimate<HTMLDivElement>();
    useEffect(() => {
        const elemento = scope.current;
        if (!moderno || reduzir || !elemento) return;
        const animacao = animate(elemento, {opacity:[.58,1]}, {duration:.32,ease:[.22,1,.36,1]});
        return () => {animacao.stop(); elemento.style.opacity = "1";};
    }, [identidade,moderno,reduzir,scope,animate]);
    return scope;
}
