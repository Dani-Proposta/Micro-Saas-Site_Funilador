//import externos

// imports importantes sksksksksskksk
import {  AppShell, Group, Text, Button, Burger, useMantineColorScheme, Title, NavLink, Card, SimpleGrid } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";



function App() {
  //constantes importantes lmao

  const {toggleColorScheme} = useMantineColorScheme();
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <AppShell 
      //cabeçalho
      header={{height: 64}}  
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
        <NavLink label="Visão geral" active variant="light" />
        <NavLink label="Clientes" />
        <NavLink label="Projetos" />
        <NavLink label="Solicitações" />
        <NavLink label="Mensagens" />

      </AppShell.Navbar>
      
      <AppShell.Main>
        {/*espaço de trabalho*/}
        <Title order={1}>Visão geral</Title>
        <p>Meu espaço de trabalho</p>
        <SimpleGrid cols={{base: 1, sm: 2}} spacing="md">

        <Card withBorder padding="lg" radius="md">
          <Text c="dimmed" size="sm">
            Projetos Ativos
          </Text>
          <Text fw={700} size="xl">
            0
          </Text>
        </Card>

        <Card withBorder padding="lg" radius="md">
          <Text c="dimmed" size="sm">
            Solicitações Pendentes
          </Text>
          <Text fw={700} size="xl">
            0
          </Text>
        </Card>

        </SimpleGrid>
      </AppShell.Main> 
    </AppShell>
  )
}

export default App
