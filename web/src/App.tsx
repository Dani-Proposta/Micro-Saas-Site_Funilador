import { NavegacaoExpressiva } from "./components/expressivo/NavegacaoExpressiva";
import { useAnimacaoConteudo } from "./hooks/useInteracaoModerna";
import { useState } from "react";
import { Carregamento } from "./components/Carregamento";
//import externos
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';

// imports importantes sksksksksskksk
import { AppShell, Group, Text, Burger} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Dashboard, Solicitacoes, Clientes, ClienteDetalhes, Login, Projetos, ProjetoDetalhes, Convites, AceitarConvite, PainelCliente, Mensagens } from './pages';
import { RedefinirSenha } from "./pages/RedefinirSenha";
import { Financeiro } from "./pages/Financeiro";
import { authClient } from "./lib/auth-client";
import { useAparencia, useExpressivoDesktop, useExpressivoMobile } from "./lib/contextoAparencia";
import { MarcaPainel, MenuConta } from "./components/MenuConta";
import { NavegacaoMobile, NavegacaoPainel } from "./components/NavegacaoPainel";
import classes from "./styles/Estrutura.module.css";
import { CentralNotificacoes } from "./components/CentralNotificacoes";
import { useMensagensNaoLidas } from "./hooks/useMensagensNaoLidas";

function PainelAdmin() {
  //constantes importantes lmao

  const [opened, { toggle, close, open }] = useDisclosure(false);
  const {aparencia} = useAparencia();
  const moderno = aparencia.estilo === "moderno";
  const expressivoDesktop = useExpressivoDesktop();
    const expressivoMobile = useExpressivoMobile();
  const { data: sessao, isPending, error } = authClient.useSession();
  const local = useLocation();
    const mainRef = useAnimacaoConteudo(local.pathname);
  const [estadoFoco, setEstadoFoco] = useState({chave: local.key, ativo: false});
  if (estadoFoco.chave !== local.key) {
    setEstadoFoco({chave: local.key, ativo: false});
  }
  const foco = local.pathname === "/mensagens" && estadoFoco.chave === local.key && estadoFoco.ativo;
  const navigate = useNavigate();
  const adminAutenticado = !isPending && !error && !!sessao?.user.role?.split(",").includes("admin") && local.pathname !== "/login";
  const mensagensNaoLidas = useMensagensNaoLidas("admin", adminAutenticado, sessao?.user.id);

  if (isPending) {
    return (<Carregamento tipo="sessao" texto="Verificando sessão..."/>);
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
    <AppShell className={classes.shell}
      //cabeçalho
      header={{ height: 60 }}
      padding={{base:"xs", sm:"md"}}

      //barra da navegação
      navbar={{
        width: moderno ? 264 : 236,
        breakpoint: "sm",
        collapsed: { mobile: moderno || expressivoMobile || !opened, desktop: foco || expressivoDesktop },
      }}>

      <AppShell.Header className={classes.header}>
        <div className={classes.headerInner}>
          <Group gap="xs" wrap="nowrap" className={classes.headerIdentity}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu de navegação" aria-expanded={opened} aria-haspopup={moderno ? "dialog" : undefined}/>
            <MarcaPainel lado="admin"/><NavegacaoExpressiva lado="admin" naoLidas={mensagensNaoLidas} local="header" foco={foco}/>
          </Group>
          <Group gap="xs" wrap="nowrap" className={classes.headerActions}>
            <CentralNotificacoes key={`notificacoes-${sessao.user.id}`} lado="admin"/>
            <MenuConta key={`conta-${sessao.user.id}`} nome={sessao.user.name} email={sessao.user.email} sair={() => void sair()} aoAbrir={close}/>
          </Group>
        </div>
      </AppShell.Header>
      <AppShell.Navbar className={classes.navbar}>
        <NavegacaoPainel lado="admin" naoLidas={mensagensNaoLidas} fechar={close} aberto={opened}/>
      </AppShell.Navbar>
      <NavegacaoMobile lado="admin" naoLidas={mensagensNaoLidas} fechar={close} aberto={opened} abrir={open}/>

      <NavegacaoExpressiva lado="admin" naoLidas={mensagensNaoLidas} local="dock" foco={foco}/>
      <AppShell.Main ref={mainRef} className={classes.main}>
        <Routes>
          <Route path="/" element={<Dashboard mensagensNaoLidas={mensagensNaoLidas}/> } />
          <Route path="/login" element={<Login />} />
          <Route path="/clientes" element={<Clientes/>}/>
          <Route path="/clientes/:id" element={<ClienteDetalhes />}/>
          <Route path="/solicitacoes" element={<Solicitacoes/>}/>
          <Route path="/projetos" element={<Projetos />}/>
          <Route path="/projetos/:id" element={<ProjetoDetalhes />}/>
          <Route path="/financeiro" element={<Financeiro/>}/>
          <Route path="/convites" element={<Convites />}/>
          <Route path="/mensagens" element={<Mensagens foco={foco} alternarFoco={() => setEstadoFoco({chave: local.key, ativo: !foco})}/>}/>
        </Routes>
      </AppShell.Main>
    </AppShell>
  )
}

function App() {
    return (
        <Routes>
            <Route path="/redefinir" element={<RedefinirSenha/>}/>
            <Route path="/convite/:token" element={<AceitarConvite/>}/>
            <Route path="/portal/*" element={<PainelCliente/>}/>
            <Route path="/*" element={<PainelAdmin/>}/>
        </Routes>
    );
}

export default App;

