import { useEffect } from "react";
import { useAnimate } from "motion/react";
import { useAparencia, useMovimentoReduzido, useExpressivo } from "../lib/contextoAparencia";

export function useModerno() {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();
    return aparencia.estilo === "moderno" || expressivo;
}

export function useAnimacaoConteudo(identidade:string|number) {
    const moderno = useModerno();
    const reduzir = useMovimentoReduzido();
    const expressivo = useExpressivo();
    const [scope,animate] = useAnimate<HTMLDivElement>();
    useEffect(() => {
        const elemento = scope.current;
        if (!moderno || reduzir || !elemento) return;
        const animacao = animate(elemento, {opacity:[expressivo ? .15 : .58,1]}, {duration:expressivo ? .55 : .32,ease:[.22,1,.36,1]});
        return () => {animacao.stop(); elemento.style.opacity = "1";};
    }, [identidade,moderno,reduzir,scope,animate,expressivo]);
    return scope;
}
