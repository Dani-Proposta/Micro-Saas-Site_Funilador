//import externos
import { NavLink as MantineNavLink } from '@mantine/core';
import { NavLink as RouterNavLink, Routes, Route } from 'react-router';
// imports importantes sksksksksskksk
import { AppShell, Group, Text, Button, Burger, useMantineColorScheme} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Dashboard, Solicitacoes, Clientes } from './pages';

function App() {
  //constantes importantes lmao

  const { toggleColorScheme } = useMantineColorScheme();
  const [opened, { toggle }] = useDisclosure(false);
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
