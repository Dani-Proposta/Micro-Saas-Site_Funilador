import type { ReactNode } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import type { MotionStyle } from "motion/react";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";
import visual from "../styles/Dashboard.module.css";

// Adaptador do layout real do Funilador: Motion controla a luz sem atualizar o estado React.
export function BentoDashboard({className, children}: {className: string; children: ReactNode}) {
    const {aparencia} = useAparencia();
    const reduzir = useMovimentoReduzido();
    const desktop = useMediaQuery("(min-width: 48em) and (hover: hover) and (pointer: fine)");
    const ativo = aparencia.estilo === "moderno" && desktop && !reduzir;
    const x = useMotionValue(-1000);
    const y = useMotionValue(-1000);
    const luz = useMotionTemplate`radial-gradient(280px circle at ${x}px ${y}px, color-mix(in srgb, var(--mantine-primary-color-filled) 20%, transparent), transparent 100%)`;
    return <motion.div className={`${className} ${visual.bento}`} data-bento-luz={ativo || undefined}
        style={ativo ? {"--bento-luz": luz} as MotionStyle : undefined}
        onPointerMove={ativo ? evento => {
            if (evento.pointerType !== "mouse" && evento.pointerType !== "pen") return;
            const rect = evento.currentTarget.getBoundingClientRect();
            x.set(evento.clientX - rect.left); y.set(evento.clientY - rect.top);
        } : undefined}
        onPointerLeave={ativo ? () => {x.set(-1000); y.set(-1000);} : undefined}>
        {children}
    </motion.div>;
}
