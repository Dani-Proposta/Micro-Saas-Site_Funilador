import { Carregamento } from "../components/Carregamento";

import { useEffect, useState } from "react";
import { AppShell, Alert, Burger, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Navigate, useLocation, useNavigate, Routes, Route } from "react-router";
import { authClient } from "../lib/auth-client";
import { MarcaPainel, MenuConta } from "../components/MenuConta";
import { NavegacaoPainel } from "../components/NavegacaoPainel";
import classes from "../styles/Estrutura.module.css";
import { CentralNotificacoes } from "../components/CentralNotificacoes";
import { useMensagensNaoLidas } from "../hooks/useMensagensNaoLidas";

//por dps em um index proprio
import { RedefinirSenha } from "./RedefinirSenha";
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

    if (isPending) return <Carregamento tipo="sessao" texto="Verificando sessão..."/>;

    if (error) return <Text>Não foi possível verificar sua sessão.</Text>;

    if (!sessao) return <Navigate to="/login" replace/>;

    const papeis = sessao.user.role?.split(",") ?? [];

    if (papeis.includes("admin")) return <Navigate to="/" replace/>;

    if (!papeis.includes("user")) return <Text>Você não possui acesso ao portal.</Text>;

    return <PortalCliente key={sessao.user.id}/>;
}

function PortalCliente() {

    const [opened, { toggle, close }] = useDisclosure(false);
    const navigate = useNavigate();
    const local = useLocation();
    const [estadoFoco, setEstadoFoco] = useState({chave: local.key, ativo: false});
    if (estadoFoco.chave !== local.key) {
      setEstadoFoco({chave: local.key, ativo: false});
    }
    const foco = local.pathname === "/portal/mensagens" && estadoFoco.chave === local.key && estadoFoco.ativo;

    const [trocaObrigatoria, setTrocaObrigatoria] = useState(false);
    const [cliente, setCliente] = useState<Cliente | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [saindo, setSaindo] = useState(false);
    const [erroSaida, setErroSaida] = useState<string | null>(null);

    const carregando = cliente === null && erro === null;
    const mensagensNaoLidas = useMensagensNaoLidas("cliente", !!cliente, cliente?.id);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarCliente() {
            try {
                const resposta = await fetch("/api/me", {signal: controller.signal});
                const dados = await resposta.json();

                if (resposta.status === 403 && dados.codigo === "TROCA_SENHA_OBRIGATORIA") {if (!controller.signal.aborted) setTrocaObrigatoria(true); return;}
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

    if (trocaObrigatoria) return <RedefinirSenha provisoria/>;

    return (
        <AppShell className={classes.shell} header={{height: 60}} padding={{base:"xs", sm:"md"}} navbar={{width: 236, breakpoint: "sm", collapsed: {mobile: !opened, desktop: foco}}}>

            <AppShell.Header className={classes.header}>
                <div className={classes.headerInner}>
                    <Group gap="xs" wrap="nowrap" className={classes.headerIdentity}>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu de navegação" aria-expanded={opened}/>
                        <MarcaPainel lado="cliente"/>
                    </Group>
                    <Group gap="xs" wrap="nowrap" className={classes.headerActions}>
                        {cliente && <CentralNotificacoes lado="cliente"/>}
                        <MenuConta nome={cliente?.nome} email={cliente?.email} aoAlterarNome={nome => setCliente(anterior => anterior ? {...anterior, nome} : anterior)} sair={() => void sair()} aoAbrir={close} saindo={saindo}/>
                    </Group>
                </div>
            </AppShell.Header>
            <AppShell.Navbar className={classes.navbar}>
                <NavegacaoPainel lado="cliente" naoLidas={mensagensNaoLidas} fechar={close} aberto={opened}/>
            </AppShell.Navbar>

            <AppShell.Main className={classes.main}>
                <Stack gap="md">

                    {erroSaida && <Alert color="red">{erroSaida}</Alert>}
                    {carregando && <Carregamento tipo="detalhes" texto="Carregando sua conta..." quantidade={2}/>}
                    {erro && <Alert color="red">{erro}</Alert>}

                {cliente && (
                    <Routes>
                        <Route index element={<DashboardCliente cliente={cliente} mensagensNaoLidas={mensagensNaoLidas}/>}/>
                        <Route path="projetos" element={<MeusProjetos/>}/>
                        <Route path="solicitacoes" element={<MinhasSolicitacoes/>}/>
                        <Route path="mensagens" element={<MensagensCliente foco={foco} alternarFoco={() => setEstadoFoco({chave: local.key, ativo: !foco})}/>}/>
                        <Route path="*" element={<Navigate to="/portal" replace/>}/>
                    </Routes>
                )}
                </Stack>
            </AppShell.Main>

        </AppShell>
    );
}
