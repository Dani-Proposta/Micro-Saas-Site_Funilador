import { useEffect, useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { useAparencia, useMovimentoReduzido, useExpressivo } from "../lib/contextoAparencia";
import { toast } from "../lib/toasts";

// Laboratório local, opt-in pela URL e indisponível no build de produção.
function TesteToasts() {
    const [habilitado] = useState(() => new URLSearchParams(window.location.search).get("teste-toasts") === "1");
    const [id, setId] = useState<string | null>(null);
    if (!habilitado) return null;
    return <details className="funilador-toast-teste">
        <summary>Laboratório de toasts</summary>
        <Stack gap="xs" mt="xs">
            <Text size="xs" c="dimmed">Simulações locais, sem operações na API.</Text>
            <Group gap={6}>
                <Button size="compact-xs" color="teal" variant="light" onClick={() => toast.mostrar("sucesso", {titulo:"Alterações salvas", mensagem:"O projeto foi atualizado com sucesso."})}>Sucesso</Button>
                <Button size="compact-xs" color="blue" variant="light" onClick={() => toast.mostrar("info", {titulo:"Informação", mensagem:"Esta é uma notificação de teste."})}>Informação</Button>
                <Button size="compact-xs" color="orange" variant="light" onClick={() => toast.mostrar("aviso", {titulo:"Atenção", mensagem:"Existem informações pendentes."})}>Aviso</Button>
                <Button size="compact-xs" color="red" variant="light" onClick={() => toast.mostrar("erro", {titulo:"Não foi possível salvar", mensagem:"Tente novamente em instantes."})}>Erro</Button>
            </Group>
            <Group gap={6}>
                <Button size="compact-xs" variant="default" onClick={() => {if (id) toast.fechar(id); setId(toast.mostrar("carregando", {titulo:"Salvando alterações", mensagem:"Aguarde a conclusão da operação."}));}}>Carregando</Button>
                <Button size="compact-xs" color="teal" variant="light" disabled={!id} onClick={() => {if (id) toast.atualizar(id,"sucesso",{titulo:"Operação concluída",mensagem:"O carregamento foi atualizado para sucesso."}); setId(null);}}>Concluir</Button>
                <Button size="compact-xs" color="red" variant="light" disabled={!id} onClick={() => {if (id) toast.atualizar(id,"erro",{titulo:"Operação interrompida",mensagem:"O carregamento foi atualizado para erro."}); setId(null);}}>Falhar</Button>
            </Group>
            <Button size="compact-xs" variant="subtle" onClick={() => {toast.limpar(); setId(null);}}>Limpar todos os toasts</Button>
        </Stack>
    </details>;
}

export function CentralToasts({sessaoId}: {sessaoId: string | null}) {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();
    const reduzir = useMovimentoReduzido();
    const mobile = useMediaQuery("(max-width: 48em)");
    // Remove mensagens temporárias quando a identidade da sessão muda.
    useEffect(() => {toast.limpar();}, [sessaoId]);
    return <>
        <Notifications
            position={mobile ? ((aparencia.estilo === "moderno" || expressivo) ? "top-center" : "bottom-center") : "bottom-right"}
            containerWidth={360}
            limit={3}
            classNames={{root:"funilador-toasts", notification:"funilador-toast-item"}}
            zIndex={1100}
            transitionDuration={reduzir ? 0 : aparencia.estilo === "minimalista" ? 120 : 250}
            pauseResetOnHover="notification"
            // No Expressivo, preservar os cliques nas ações dos avisos em vez de capturar o ponteiro para arraste.
            allowDragDismiss={aparencia.estilo === "moderno" && !mobile && !expressivo}
            allowScrollDismiss={false}
            notificationMaxHeight={360}
        />
        {import.meta.env.DEV && <TesteToasts/>}
    </>;
}
