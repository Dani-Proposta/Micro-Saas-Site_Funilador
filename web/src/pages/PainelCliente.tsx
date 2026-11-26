
import { useEffect, useState } from "react";
import { AppShell, Alert, Burger, Button, Center, Group, Loader, Menu, NavLink, Stack, Text, useMantineColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Navigate, useNavigate, Routes, Route, NavLink as RouterNavLink } from "react-router";
import { authClient } from "../lib/auth-client";

//por dps em um index proprio
import { MeusProjetos } from "./MeusProjetos";
import { MinhasSolicitacoes } from "./MinhasSolicitacoes";
import { DashboardCliente } from "./DashboardCliente";
import { MensagensCliente } from "./MensagensCliente";

type Cliente = {
    id: string;
    nome: string;
    email: string | null;
};

export function PainelCliente() {

    const { data: sessao, isPending, error } = authClient.useSession();

    if (isPending) return <Center h="100vh"><Loader/></Center>;

    if (error) return <Text>Não foi possível verificar sua sessão.</Text>;

    if (!sessao) return <Navigate to="/login" replace/>;

    const papeis = sessao.user.role?.split(",") ?? [];

    if (papeis.includes("admin")) return <Navigate to="/" replace/>;

    if (!papeis.includes("user")) return <Text>Você não possui acesso ao portal.</Text>;

    return <PortalCliente key={sessao.user.id}/>;
}

function PortalCliente() {

    const { toggleColorScheme } = useMantineColorScheme();
    const [opened, { toggle }] = useDisclosure(false);
    const navigate = useNavigate();

    const [cliente, setCliente] = useState<Cliente | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [saindo, setSaindo] = useState(false);
    const [erroSaida, setErroSaida] = useState<string | null>(null);

    const carregando = cliente === null && erro === null;

    useEffect(() => {
        const controller = new AbortController();

        async function carregarCliente() {
            try {
                const resposta = await fetch("/api/me", {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível carregar seus dados.");

                if (!controller.signal.aborted) setCliente(dados);

            } catch (erroRecebido) {
                if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao carregar cliente.");
            }
        }

        void carregarCliente();
        return () => controller.abort();
    }, []);

    async function sair() {
        setSaindo(true);
        setErroSaida(null);

        try {
            const { error } = await authClient.signOut();

            if (error) throw new Error("Não foi possível sair.");

            navigate("/login", {replace: true});

        } catch {
            setErroSaida("Não foi possível encerrar sua sessão.");
        } finally {
            setSaindo(false);
        }
    }

    return (
        <AppShell header={{height: 64}} padding="md" navbar={{width: 200, breakpoint: "sm", collapsed: {mobile: !opened}}}>

            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Barra lateral"/>
                    <Text fw={1000}>Portal do cliente</Text>

                    <Menu shadow="md" width={200} position="bottom-end">
                        <Menu.Target>
                            <Button variant="subtle">☰</Button>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Label>Preferências</Menu.Label>
                            <Menu.Item onClick={() => toggleColorScheme()}>Trocar tema</Menu.Item>
                            <Menu.Item disabled>Minha conta</Menu.Item>
                            <Menu.Item color="red" disabled={saindo} onClick={() => void sair()}>Sair</Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                <Text size="sm" c="dimmed">Menu</Text>
                <NavLink label="Visão geral" renderRoot={(props) => (<RouterNavLink to="/portal" end {...props}/>)}/>
                <NavLink label="Meus projetos" renderRoot={(props) => (<RouterNavLink to="/portal/projetos" {...props}/>)}/>
                <NavLink label="Minhas solicitações" renderRoot={(props) => (<RouterNavLink to="/portal/solicitacoes" {...props}/>)}/>
                <NavLink label="Mensagens" renderRoot={(props) => (<RouterNavLink to="/portal/mensagens" {...props}/>)}/>
            </AppShell.Navbar>

            <AppShell.Main>
                <Stack gap="md">

                    {erroSaida && <Alert color="red">{erroSaida}</Alert>}
                    {carregando && <Loader size="sm"/>}
                    {erro && <Alert color="red">{erro}</Alert>}

                {cliente && (
                    <Routes>
                        <Route index element={<DashboardCliente cliente={cliente}/>}/>
                        <Route path="projetos" element={<MeusProjetos/>}/>
                        <Route path="solicitacoes" element={<MinhasSolicitacoes/>}/>
                        <Route path="mensagens" element={<MensagensCliente/>}/>
                        <Route path="*" element={<Navigate to="/portal" replace/>}/>
                    </Routes>
                )}
                </Stack>
            </AppShell.Main>

        </AppShell>
    );
}
