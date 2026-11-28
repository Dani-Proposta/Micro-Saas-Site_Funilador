import { IconeModerno } from "./AcabamentoModerno";
import type { ReactNode } from "react";
import { Button, Card, Group, Select, Stack, Text } from "@mantine/core";
import { CampoBusca } from "./CampoBusca";
import { opcoesOrdenacao, type OrdemRegistros } from "../lib/ordenacaoRegistros";
import classes from "../styles/Trabalho.module.css";

type Props = {busca: string; onBusca: (v: string) => void; total: number; visiveis: number; carregando: boolean; foco?: boolean; children: ReactNode; ordem?: OrdemRegistros; onOrdem?: (v: OrdemRegistros) => void; onLimpar?: () => void; filtrosAtivos?: boolean};

export function FiltrosTrabalho({busca, onBusca, total, visiveis, carregando, foco = false, children, ordem, onOrdem, onLimpar, filtrosAtivos = false}: Props) {
    if (foco) return null;
    return <Card withBorder padding="sm" className={`${classes.pagina} funilador-filtros`}>
        <Stack gap="xs">
            <div className="funilador-filtros-titulo"><Text fw={650} size="sm">Refinar resultados</Text><Text size="xs" c="dimmed">Busca, seleção e ordenação</Text></div>
            <div className={classes.filtros}>
                <CampoBusca value={busca} onChange={onBusca}/>
                {children}
                {ordem && onOrdem && <Select label="Ordenar" size="sm" allowDeselect={false} value={ordem} data={opcoesOrdenacao}
                    onChange={v => {if (v === "padrao" || v === "recentes" || v === "antigos" || v === "titulo") onOrdem(v);}}/>}
            </div>
            <Group justify="space-between" gap="xs" className="funilador-filtros-rodape">
                {!carregando && <Text size="xs" c="dimmed" aria-live="polite"><IconeModerno nome="solicitacoes" tamanho={14}/>{visiveis} de {total} registros</Text>}
                {onLimpar && filtrosAtivos && <Button size="compact-xs" variant="subtle" onClick={onLimpar}>Limpar filtros</Button>}
            </Group>
        </Stack>
    </Card>;
}
