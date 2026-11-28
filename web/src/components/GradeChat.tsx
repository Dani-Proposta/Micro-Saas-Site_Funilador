import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { useAparencia } from "../lib/contextoAparencia";
import chat from "../styles/Chat.module.css";
import classes from "../styles/Usabilidade.module.css";

type Props = {
    lista: ReactNode;
    conversa: ReactNode;
    selecionada: boolean;
    recolhida: boolean;
    onRecolhidaChange: (valor: boolean) => void;
};

// A estrutura funcional é a mesma; apenas o desktop Moderno ganha painéis redimensionáveis.
export function GradeChat(props: Props) {
    const {aparencia} = useAparencia();
    const desktop = useMediaQuery("(min-width: 48em)", false, {getInitialValueInEffect: false});
    if (aparencia.estilo !== "moderno" || !desktop) {
        return <div className={`${classes.chatGrid} ${chat.grid}`}>{props.lista}{props.conversa}</div>;
    }
    return <GradeDesktop {...props}/>;
}

// Em janelas estreitas, os dois painéis não cabem com os limites mínimos.
function GradeDesktop(props: Props) {
    const {ref,width} = useElementSize<HTMLDivElement>();
    const estreita = width > 0 && width < 610;
    return <div ref={ref} className={chat.gradeDesktop}>
        {estreita ? <div className={`${classes.chatGrid} ${chat.gradeEstreita}`}>{props.lista}{props.conversa}</div> : <GradeRedimensionavel {...props}/>}
    </div>;
}

function GradeRedimensionavel({lista, conversa, selecionada, recolhida, onRecolhidaChange}: Props) {
    const painelLista = usePanelRef();
    const [tamanhoInicial] = useState(() => recolhida ? "0%" : "32%");
    useLayoutEffect(() => {
        const painel = painelLista.current;
        if (!painel) return;
        if (selecionada && recolhida && !painel.isCollapsed()) painel.collapse();
        else if ((!selecionada || !recolhida) && painel.isCollapsed()) painel.expand();
    }, [painelLista, selecionada, recolhida]);

    return <Group orientation="horizontal" className={chat.gradeRedimensionavel}>
        <Panel panelRef={painelLista} className={chat.painelRedimensionavel}
            defaultSize={tamanhoInicial} minSize="280px" maxSize="68%"
            collapsible={selecionada} collapsedSize="0%"
            onResize={(tamanho, _id, anterior) => {
                if (selecionada && anterior) {
                    const recolheu = tamanho.asPercentage < 0.01;
                    if (recolheu !== recolhida) onRecolhidaChange(recolheu);
                }
            }}>
            <div className={chat.conteudoRedimensionavel} inert={selecionada && recolhida}>{lista}</div>
        </Panel>
        <Separator className={chat.divisorRedimensionavel} aria-label="Ajustar largura da lista de conversas">
            <span aria-hidden="true"/>
        </Separator>
        <Panel className={chat.painelRedimensionavel} minSize="300px">
            {conversa}
        </Panel>
    </Group>;
}
