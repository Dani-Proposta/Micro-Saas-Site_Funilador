import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useMotionTemplate } from "motion/react";
import { useMediaQuery } from "@mantine/hooks";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";

// Camadas decorativas: nenhuma captura de eventos ou interferência no layout.
export function AmbienteModerno() {
    const {aparencia} = useAparencia();
    const desktop = useMediaQuery("(min-width: 48em)", false, {getInitialValueInEffect:false});
    const reduzir = useMovimentoReduzido();
    const ativo = desktop && aparencia.estilo === "moderno";
    const x = useMotionValue(50), y = useMotionValue(45);
    const sx = useSpring(x,{stiffness:35,damping:20}), sy = useSpring(y,{stiffness:35,damping:20});
    const luz = useMotionTemplate`radial-gradient(460px circle at ${sx}% ${sy}%, color-mix(in srgb, var(--mantine-primary-color-filled) 13%, transparent), transparent 80%)`;
    useEffect(() => {
        if (!ativo || reduzir) return;
        const mover = (e: PointerEvent) => {if (e.pointerType === "mouse") {x.set(100*e.clientX/window.innerWidth); y.set(100*e.clientY/window.innerHeight);}};
        window.addEventListener("pointermove", mover, {passive:true});
        return () => window.removeEventListener("pointermove", mover);
    }, [ativo, reduzir, x, y]);
    if (!ativo) return null;
    return <div className="funilador-ambiente-moderno" aria-hidden="true">
        <motion.div className="funilador-ambiente-luz funilador-ambiente-luz-a" initial={false}
            animate={reduzir ? {x:0,y:0,scale:1} : {x:[0,-145,35,0],y:[0,90,-35,0],scale:[1,1.25,.95,1]}}
            transition={reduzir ? {duration:0} : {duration:14,repeat:Infinity,ease:"easeInOut"}}/>
        <motion.div className="funilador-ambiente-luz funilador-ambiente-luz-b" initial={false}
            animate={reduzir ? {x:0,y:0,scale:1} : {x:[0,120,-80,0],y:[0,-90,20,0],scale:[1,1.24,1.08,1]}}
            transition={reduzir ? {duration:0} : {duration:19,repeat:Infinity,ease:"easeInOut"}}/>
        <motion.div className="funilador-ambiente-luz funilador-ambiente-luz-c" initial={false} animate={reduzir ? {x:0,y:0,opacity:.5} : {x:[0,100,-60,0],y:[0,-80,50,0],opacity:[.45,.85,.55,.45]}} transition={reduzir ? {duration:0} : {duration:17,repeat:Infinity,ease:"easeInOut"}}/>
        {!reduzir && <motion.div className="funilador-ambiente-cursor" style={{backgroundImage:luz}}/>}
        <div className="funilador-ambiente-grade"/>
    </div>;
}
