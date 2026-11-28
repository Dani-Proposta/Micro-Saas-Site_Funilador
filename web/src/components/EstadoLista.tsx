import { Button, Card, Stack, Text } from "@mantine/core";

type Props = {titulo: string; descricao?: string; acao?: string; onAcao?: () => void};

export function EstadoLista({titulo, descricao, acao, onAcao}: Props) {
    return <Card withBorder padding="lg" className="funilador-estado-lista">
        <Stack align="center" gap="xs">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
            <Text fw={600} size="sm" ta="center">{titulo}</Text>
            {descricao && <Text size="xs" c="dimmed" ta="center">{descricao}</Text>}
            {acao && onAcao && <Button size="xs" variant="light" onClick={onAcao}>{acao}</Button>}
        </Stack>
    </Card>;
}
