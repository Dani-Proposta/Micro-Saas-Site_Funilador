//import externos
import { NavLink as MantineNavLink } from '@mantine/core';
import { NavLink as RouterNavLink, Routes, Route, Navigate, useLocation } from 'react-router';
// imports importantes sksksksksskksk
import { AppShell, Group, Text, Button, Burger, useMantineColorScheme, Center, Loader} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Dashboard, Solicitacoes, Clientes, Login } from './pages';
import { authClient } from "./lib/auth-client";

function App() {
  //constantes importantes lmao

  const { toggleColorScheme } = useMantineColorScheme();
  const [opened, { toggle }] = useDisclosure(false);
  const { data: sessao, isPending, error } = authClient.useSession();
  const local = useLocation();


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
    return <Text>Você não tem acesso ao painel administrativo.</Text>;
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
          <Button variant="light" onClick={() => toggleColorScheme()}>Trocar tema</Button>
        </Group>

      </AppShell.Header>
      <AppShell.Navbar p="md">
        Menu
        <MantineNavLink label="Visão geral" renderRoot={(props)=>(<RouterNavLink to="/" end {...props}/>)} />
        <MantineNavLink label="Clientes" renderRoot={(props)=>(<RouterNavLink to="/clientes" end {...props}/>)} />
        <MantineNavLink label="Projetos" renderRoot={(props)=>(<RouterNavLink to="/projetos" end {...props}/>)} />
        <MantineNavLink label="Solicitações"  renderRoot={(props)=>(<RouterNavLink to="/solicitacoes" end {...props}/>)}/>
        <MantineNavLink label="Mensagens" renderRoot={(props)=>(<RouterNavLink to="/mensagens" end {...props}/>)} />

      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Dashboard/>} />
          <Route path="/login" element={<Login />} />
          <Route path="/clientes" element={<Clientes/>}/>
          <Route path="/projetos" element={<Text>Area de Projetos</Text>}/>
          <Route path="/solicitacoes" element={<Solicitacoes/>}/>
          <Route path="/mensagens" element={<Text>Area das mensagens</Text>}/>
        </Routes>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
