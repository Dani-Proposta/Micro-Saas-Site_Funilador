import { useEffect, useRef, useState } from "react";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";
import { NumeroModerno } from "./InteracaoModerna";
import { Card, Group, Text } from "@mantine/core";
import { IconePainel } from "./MenuConta";
import type { ComponentProps } from "react";
import classes from "../styles/Dashboard.module.css";

//animar apenas contagens, sem interpolar valores financeiros
export function ContadorDashboard({valor,repeticao=0}: {valor: number | null; repeticao?:number}) {
    const {aparencia} = useAparencia();

    if (aparencia.estilo === "moderno") {
        return <NumeroModerno valor={valor} repeticao={repeticao}/>;
    }
    return <ContadorClassico valor={valor}/>;
}

function ContadorClassico({valor}: {valor: number | null}) {
    const reduzir = useMovimentoReduzido();
    const [visivel, setVisivel] = useState(0);
    const anterior = useRef(0);
    useEffect(() => {
        if (valor === null) return;
        const inicio = anterior.current;
        let frame = 0;
        const tempo = performance.now();
        function atualizar(agora: number) {
            const t = reduzir ? 1 : Math.min(1, (agora - tempo) / 380);
            const n = Math.round(inicio + (valor! - inicio) * (1 - (1 - t) ** 3));
            anterior.current = n;
            setVisivel(n);
            if (t < 1) frame = requestAnimationFrame(atualizar);
        }
        frame = requestAnimationFrame(atualizar);
        return () => cancelAnimationFrame(frame);
    }, [valor, reduzir]);
    if (valor === null) return <>—</>;
    return <><span className={classes.srOnly}>{valor}</span><span aria-hidden="true">{reduzir ? valor : visivel}</span></>;
}

type Props = {titulo: string; valor: number | null; icone: ComponentProps<typeof IconePainel>["nome"]; cor?: string; repeticao?:number; abrir: () => void};
export function IndicadorDashboard({titulo, valor, icone, cor, repeticao, abrir}: Props) {
    return <Card withBorder padding="sm" component="button" type="button" onClick={abrir} className={classes.indicador} aria-label={`${titulo}: ${valor ?? "indisponível"}. Abrir detalhes`}>
        <Group justify="space-between" wrap="nowrap" gap={6} className={classes.indicadorTopo}>
            <Text size="xs" c="dimmed" fw={500}>{titulo}</Text>
            <span className={classes.icone}><IconePainel nome={icone} tamanho={16}/></span>
        </Group>
        <Group justify="space-between" align="end" gap={4} wrap="nowrap">
            <Text fw={700} size="xl" c={cor} className={classes.numero}><ContadorDashboard valor={valor} repeticao={repeticao}/></Text>
            <span className={classes.seta} aria-hidden="true"><span className={classes.acaoIndicador}>Detalhes </span>↗</span>
        </Group>
    </Card>;
}
