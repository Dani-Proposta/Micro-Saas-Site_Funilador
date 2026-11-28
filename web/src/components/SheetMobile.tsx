import type { ReactNode } from "react";
import { Drawer, Text } from "@mantine/core";
import { useMovimentoReduzido } from "../lib/contextoAparencia";

// Adaptador temporário: Drawer do Mantine isola o problema de toque do Scrollsheet.
// Sem diálogo nativo ou camada de captura montada quando fechado.
export function SheetMobile({aberto, fechar, titulo, descricao, children}: {aberto:boolean; fechar:()=>void; titulo:string; descricao?:string; children:ReactNode}) {
    const reduzir = useMovimentoReduzido();
    return <Drawer opened={aberto} onClose={fechar} title={titulo} position="bottom" size="auto" keepMounted={false}
        classNames={{content:"funilador-sheet-seguro",header:"funilador-sheet-header",body:"funilador-sheet-body"}}
        transitionProps={{transition:"slide-up",duration:reduzir?0:260}} closeButtonProps={{"aria-label":"Fechar painel"}}>
        {descricao && <Text size="sm" c="dimmed" mb="sm">{descricao}</Text>}
        <div className="funilador-sheet-corpo">{children}</div>
    </Drawer>;
}
