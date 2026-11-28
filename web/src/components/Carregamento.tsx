import { Card, Loader, SimpleGrid, Skeleton, Stack, Text } from "@mantine/core";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";
import classes from "../styles/Estrutura.module.css";

type Props = {tipo?: "lista" | "indicadores" | "detalhes" | "compacto" | "sessao"; texto?: string; quantidade?: number};

export function Carregamento({tipo = "lista", texto = "Carregando...", quantidade = 3}: Props) {
    const {aparencia} = useAparencia();

    const reduzir = useMovimentoReduzido();
    const moderno = aparencia.estilo === "moderno";
    const blocos = Array.from({length: quantidade}, (_, i) => i);
    if (tipo === "compacto" || tipo === "sessao") return <div className={tipo === "sessao" ? classes.sessionLoading : classes.inlineLoading} role="status">
        {moderno && !reduzir ? <Loader size="xs" type="dots" aria-hidden="true"/> : <span className={classes.loadingDots} aria-hidden="true"><i/><i/><i/></span>}<Text size="sm" c="dimmed">{texto}</Text>
    </div>;
    return <div role="status" className={`${classes.loadingRegion}${tipo === "lista" ? " funilador-carregamento-lista" : ""}`}>
        <span className={classes.srOnly}>{texto}</span>
        <SimpleGrid cols={tipo === "indicadores" ? {base:1, xs:2, lg:3} : 1} spacing="xs" aria-hidden="true">
            {blocos.map(i => <Card key={i} withBorder padding="sm" className={classes.skeletonCard}>
                <Stack gap={8}>
                    {moderno ? <Skeleton width={tipo === "indicadores" ? "72%" : "38%"} height={12} radius="md" animate={!reduzir}/> : <span className={classes.skeletonLine} style={{width:tipo === "indicadores" ? "72%" : "38%", height:12}}/>}
                    {moderno ? <Skeleton width={tipo === "indicadores" ? "42%" : "78%"} height={tipo === "indicadores" ? 25 : 10} radius="md" animate={!reduzir}/> : <span className={classes.skeletonLine} style={{width:tipo === "indicadores" ? "42%" : "78%", height:tipo === "indicadores" ? 25 : 10}}/>}
                    {tipo === "detalhes" && (moderno ? <Skeleton width="60%" height={10} radius="md" animate={!reduzir}/> : <span className={classes.skeletonLine} style={{width:"60%", height:10}}/>)}
                </Stack>
            </Card>)}
        </SimpleGrid>
    </div>;
}
