import { ActionIcon, Group, Menu, Modal, Stack, Text, useMantineColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import classes from "../styles/Estrutura.module.css";

const caminhos = {
    marca: "M4 6h16M4 12h11M4 18h6 M18 12v6m-3-3h6",
    painel: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    clientes: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87",
    solicitacoes: "M8 4H5v17h14V4h-3 M9 3h6v4H9z M8 12h8 M8 16h6",
    projetos: "M3 6h7l2 2h9v12H3z",
    financeiro: "M3 6h18v13H3z M16 11h5v4h-5z M3 6l13-3v3",
    convites: "M3 5h18v14H3z M3 6l9 7 9-7",
    mensagens: "M21 11a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 15-4z",
    conta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2",
    tema: "M20 15a8 8 0 0 1-11-11 8 8 0 1 0 11 11z",
    sair: "M10 4H4v16h6 M14 8l4 4-4 4 M8 12h12",
} as const;

export function IconePainel({nome, tamanho = 18}: {nome: keyof typeof caminhos; tamanho?: number}) {
    return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d={caminhos[nome]}/></svg>;
}

export function MarcaPainel({lado}: {lado: "admin" | "cliente"}) {
    return <Group gap={9} wrap="nowrap" className={classes.brand}>
        <span className={classes.brandMark}><IconePainel nome="marca" tamanho={20}/></span>
        <div className={classes.brandText}><Text fw={750} size="md" truncate>Funilador</Text><Text size="xs" c="dimmed" truncate>{lado === "admin" ? "Área administrativa" : "Portal do cliente"}</Text></div>
    </Group>;
}

export function MenuConta({nome, email, sair, saindo = false}: {nome?: string | null; email?: string | null; sair: () => void; saindo?: boolean}) {
    const {toggleColorScheme} = useMantineColorScheme();
    const [aberta, {open, close}] = useDisclosure(false);
    return <>
        <Menu shadow="md" width={232} position="bottom-end" withinPortal>
            <Menu.Target><ActionIcon className={classes.account} variant="default" size="lg" radius="xl" aria-label="Conta e preferências" title="Conta e preferências"><IconePainel nome="conta"/></ActionIcon></Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>{nome || "Minha conta"}</Menu.Label>
                <Menu.Item leftSection={<IconePainel nome="conta"/>} onClick={open}>Minha conta</Menu.Item>
                <Menu.Divider/>
                <Menu.Label>Preferências</Menu.Label>
                <Menu.Item leftSection={<IconePainel nome="tema"/>} onClick={toggleColorScheme}>Trocar tema</Menu.Item>
                <Menu.Divider/>
                <Menu.Item leftSection={<IconePainel nome="sair"/>} color="red" disabled={saindo} onClick={sair}>Sair</Menu.Item>
            </Menu.Dropdown>
        </Menu>
        <Modal opened={aberta} onClose={close} title="Minha conta" centered>
            <Stack gap="md"><div><Text size="xs" c="dimmed">Nome</Text><Text style={{overflowWrap:"anywhere"}}>{nome || "Não informado"}</Text></div><div><Text size="xs" c="dimmed">E-mail</Text><Text style={{overflowWrap:"anywhere"}}>{email || "Não informado"}</Text></div></Stack>
        </Modal>
    </>;
}
