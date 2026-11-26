import { Badge, Button, Divider, Group, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

import { statusSolicitacao } from "../lib/solicitacoes";
import type { SolicitacaoDetalhada } from "../lib/solicitacoes";

export function DetalhesSolicitacao({solicitacao, onClose, acoes, ocupado = false}: {solicitacao: SolicitacaoDetalhada; onClose: () => void; acoes?: ReactNode; ocupado?: boolean}) {
    const historico = solicitacao.historico ?? [];

    return (
        <Modal opened onClose={onClose} title="Detalhes da solicitação" centered size="lg" closeOnEscape={!ocupado} closeOnClickOutside={!ocupado} withCloseButton={!ocupado}>
            <Stack gap="md">
                <ScrollArea.Autosize mah="55dvh" type="auto" offsetScrollbars>
                    <Stack gap="sm" pr="xs" style={{overflowWrap: "anywhere"}}>
                        <Group justify="space-between" align="flex-start">
                            <Text fw={600} style={{flex: 1, minWidth: 0}}>{solicitacao.titulo}</Text>
                            <Badge color={statusSolicitacao[solicitacao.status].color}>{statusSolicitacao[solicitacao.status].label}</Badge>
                        </Group>
                        {solicitacao.clienteNome && <Text size="sm" c="dimmed">Cliente: {solicitacao.clienteNome}</Text>}
                        <Text size="xs" c="dimmed">Criada em: {new Date(solicitacao.criadaEm).toLocaleString("pt-BR")}</Text>
                        <Divider/>
                        <Text fw={600} size="sm">Descrição</Text>
                        <Text size="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{solicitacao.descricao}</Text>
                        <Divider/>
                        <Text fw={600} size="sm">Histórico</Text>
                        <Text size="sm">Solicitação criada</Text>
                        <Text size="xs" c="dimmed">{new Date(solicitacao.criadaEm).toLocaleString("pt-BR")}</Text>
                        {historico.length === 0 && solicitacao.status !== "pendente" && <Text size="xs" c="dimmed">Decisão anterior ao registro do histórico</Text>}
                        {historico.length > 0 && historico[0].anterior === "recusada" && <Text size="xs" c="dimmed">Recusa anterior ao registro do histórico</Text>}
                        {historico.map(decisao => (
                            <Stack key={decisao.id} gap={2}>
                                <Text size="sm" c={statusSolicitacao[decisao.status].color}>{decisao.status === "pendente" ? "Solicitação reconsiderada" : `Solicitação ${decisao.status}`}</Text>
                                <Text size="xs" c="dimmed">{new Date(decisao.criadaEm).toLocaleString("pt-BR")}</Text>
                            </Stack>
                        ))}
                    </Stack>
                </ScrollArea.Autosize>
                <Divider/>
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" disabled={ocupado} onClick={onClose}>Fechar</Button>
                    {acoes}
                </Group>
            </Stack>
        </Modal>
    );
}
