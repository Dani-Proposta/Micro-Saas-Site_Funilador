import { ActionIcon, Button } from "@mantine/core";
import chat from "../styles/Chat.module.css";

export type OpcoesChat = {foco?: boolean; alternarFoco?: () => void};
type ControleProps = OpcoesChat & {voltar?: () => void; listaRecolhida?: boolean; alternarLista?: () => void};

export function ControleChat({foco, alternarFoco, voltar, listaRecolhida, alternarLista}: ControleProps) {
    return <>
        {alternarFoco && <Button visibleFrom="sm" size="compact-xs" variant="default" aria-pressed={!!foco} onClick={alternarFoco}>{foco ? "Sair do foco" : "Modo foco"}</Button>}
        {voltar && <ActionIcon className={chat.voltar} variant="subtle" color="gray" size="lg" aria-label="Voltar às conversas" title="Voltar às conversas" onClick={voltar}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h13"/></svg></ActionIcon>}
        {alternarLista && <ActionIcon className={chat.alternarLista} variant="subtle" color="gray" size="lg" aria-label={listaRecolhida ? "Mostrar lista de conversas" : "Recolher lista de conversas"} title={listaRecolhida ? "Mostrar lista de conversas" : "Recolher lista de conversas"} aria-pressed={!!listaRecolhida} onClick={alternarLista}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={listaRecolhida ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"}/></svg></ActionIcon>}
    </>;
}
