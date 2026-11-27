import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import classes from "../styles/Estrutura.module.css";

type Props = {tipo?: "lista" | "indicadores" | "detalhes" | "compacto" | "sessao"; texto?: string; quantidade?: number};

export function Carregamento({tipo = "lista", texto = "Carregando...", quantidade = 3}: Props) {
    const blocos = Array.from({length: quantidade}, (_, i) => i);
    if (tipo === "compacto" || tipo === "sessao") return <div className={tipo === "sessao" ? classes.sessionLoading : classes.inlineLoading} role="status">
        <span className={classes.loadingDots} aria-hidden="true"><i/><i/><i/></span><Text size="sm" c="dimmed">{texto}</Text>
    </div>;
    return <div role="status" className={`${classes.loadingRegion}${tipo === "lista" ? " funilador-carregamento-lista" : ""}`}>
        <span className={classes.srOnly}>{texto}</span>
        <SimpleGrid cols={tipo === "indicadores" ? {base:1, xs:2, lg:3} : 1} spacing="xs" aria-hidden="true">
            {blocos.map(i => <Card key={i} withBorder padding="sm" className={classes.skeletonCard}>
                <Stack gap={8}>
                    <span className={classes.skeletonLine} style={{width:tipo === "indicadores" ? "72%" : "38%", height:12}}/>
                    <span className={classes.skeletonLine} style={{width:tipo === "indicadores" ? "42%" : "78%", height:tipo === "indicadores" ? 25 : 10}}/>
                    {tipo === "detalhes" && <span className={classes.skeletonLine} style={{width:"60%", height:10}}/>}
                </Stack>
            </Card>)}
        </SimpleGrid>
    </div>;
}
