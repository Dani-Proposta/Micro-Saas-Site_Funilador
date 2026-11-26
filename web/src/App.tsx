//import externos
import { NavLink as MantineNavLink, Stack, Badge } from '@mantine/core';
import { NavLink as RouterNavLink, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';

// imports importantes sksksksksskksk
import { AppShell, Group, Text, Button, Burger, useMantineColorScheme, Center, Loader, Menu} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Dashboard, Solicitacoes, Clientes, ClienteDetalhes, Login, Projetos, ProjetoDetalhes, Convites, AceitarConvite, PainelCliente, Mensagens } from './pages';
import { authClient } from "./lib/auth-client";
import { useMensagensNaoLidas } from "./hooks/useMensagensNaoLidas";

function PainelAdmin() {
  //constantes importantes lmao

  const { toggleColorScheme } = useMantineColorScheme();
  const [opened, { toggle }] = useDisclosure(false);
  const { data: sessao, isPending, error } = authClient.useSession();
  const local = useLocation();
  const navigate = useNavigate();
  const adminAutenticado = !isPending && !error && !!sessao?.user.role?.split(",").includes("admin") && local.pathname !== "/login";
  const mensagensNaoLidas = useMensagensNaoLidas("admin", adminAutenticado, sessao?.user.id);

  if (isPending) {
    return (<Center h="100vh"><Loader /></Center>);
  }

  if (error) {
    return <Text>Não foi possível verificar sua sessão.</Text>;
  }



    // Tela pública de login
  if (local.pathname === "/login") {
    return sessao ? <Navigate to="/" replace /> : <Login/>;
  }

  if (!sessao) {
    return <Navigate to="/login" replace />;
  }

  const papeis = sessao.user.role?.split(",") ?? [];

    if (!papeis.includes("admin")) {
        if (papeis.includes("user")) return <Navigate to="/portal" replace/>;

        return <Text>Você não tem acesso ao painel administrativo.</Text>;
    }

  async function sair(){
    try{
      const { error } = await authClient.signOut();

      if(error){
        console.error("Falha ao sair:", error);
        return;
      }

      navigate("/login", {replace:true});
    }catch(erro){
      console.error("Erro ao encerrar sessão", erro);
    }
  }


  return (
    <AppShell
      //cabeçalho
      header={{ height: 64 }}
      padding="md"

      //barra da navegação
      navbar={{
        width: 200,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}>

      <AppShell.Header>
        {/*cabeçalho*/}
        <Group h="100%" px="md" justify="space-between">
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
            aria-label="Barra lateral"
          />
          <Text fw={1000}>Organizador</Text>

          <Stack justify='flex-end'>
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <Button variant='subtle'>
                ☰
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Preferências</Menu.Label>
                <Menu.Item variant="light" onClick={() => toggleColorScheme()}>Trocar tema</Menu.Item>
                <Menu.Item disabled>Minha conta</Menu.Item>
                <Menu.Item variant="" color='red' onClick={() => void sair()}>Sair</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          </Stack>
        </Group>

      </AppShell.Header>
      <AppShell.Navbar p="md">
        Menu
        <MantineNavLink label="Visão geral" renderRoot={(props)=>(<RouterNavLink to="/" end {...props}/>)} />
        <MantineNavLink label="Clientes" renderRoot={(props)=>(<RouterNavLink to="/clientes" end {...props}/>)} />
        <MantineNavLink label="Solicitações"  renderRoot={(props)=>(<RouterNavLink to="/solicitacoes" end {...props}/>)}/>
        <MantineNavLink label="Projetos" renderRoot={(props)=>(<RouterNavLink to="/projetos" end {...props}/>)} />
        <MantineNavLink label="Convites" renderRoot={(props)=>(<RouterNavLink to="/convites" end {...props}/>)} />
        <MantineNavLink label="Mensagens" rightSection={!!mensagensNaoLidas && <Badge color="red" size="sm">{mensagensNaoLidas}</Badge>} renderRoot={(props)=>(<RouterNavLink to="/mensagens" end {...props}/>)} />

      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Dashboard mensagensNaoLidas={mensagensNaoLidas}/> } />
          <Route path="/login" element={<Login />} />
          <Route path="/clientes" element={<Clientes/>}/>
          <Route path="/clientes/:id" element={<ClienteDetalhes />}/>
          <Route path="/solicitacoes" element={<Solicitacoes/>}/>
          <Route path="/projetos" element={<Projetos />}/>
          <Route path="/projetos/:id" element={<ProjetoDetalhes />}/>
          <Route path="/convites" element={<Convites />}/>
          <Route path="/mensagens" element={<Mensagens/>}/>
        </Routes>
      </AppShell.Main>
    </AppShell>
  )
}

function App() {
    return (
        <Routes>
            <Route path="/convite/:token" element={<AceitarConvite/>}/>
            <Route path="/portal/*" element={<PainelCliente/>}/>
            <Route path="/*" element={<PainelAdmin/>}/>
        </Routes>
    );
}

export default App;

