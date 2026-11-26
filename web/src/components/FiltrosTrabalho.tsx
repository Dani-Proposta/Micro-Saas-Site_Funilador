import type { ReactNode } from "react";
import { Card, Stack, Text, TextInput } from "@mantine/core";
import classes from "../styles/Trabalho.module.css";

//pesquisa local sem incluir dados na url
function normalizar(valor: string) {
    return valor.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

export function correspondeBusca(busca: string, ...campos: (string | null | undefined)[]) {
    const texto = normalizar(campos.filter(Boolean).join(" "));
    return normalizar(busca).split(/\s+/).every(termo => texto.includes(termo));
}

export function FiltrosTrabalho({busca, onBusca, total, visiveis, carregando, foco = false, children}: {busca: string; onBusca: (v: string) => void; total: number; visiveis: number; carregando: boolean; foco?: boolean; children: ReactNode}) {
    if (foco) return null;
    return <Card withBorder padding="sm" className={classes.pagina}>
        <Stack gap={6}>
            <div className={classes.filtros}>
                <TextInput label="Pesquisar" placeholder="Título ou descrição..." value={busca} onChange={e=>onBusca(e.currentTarget.value)} size="sm"/>
                {children}
            </div>
            {!carregando && <Text size="xs" c="dimmed" aria-live="polite">{visiveis} de {total} registros</Text>}
        </Stack>
    </Card>;
}
