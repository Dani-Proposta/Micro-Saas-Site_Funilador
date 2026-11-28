import { toast } from "../lib/toasts";
import { ActionIcon, Alert, Button, Drawer, Group, Menu, Modal, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState, useRef } from "react";
import type { SubmitEvent } from "react";
import { useExpressivo, useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";
import { normalizarAparencia } from "../lib/aparencia";
import type { Aparencia } from "../lib/aparencia";
import { EditorAparencia } from "./EditorAparencia";
import classes from "../styles/Estrutura.module.css";
import { IconLayoutDashboard, IconUsers, IconClipboardList, IconFolder, IconWallet, IconMail, IconMessageCircle, IconUserCircle, IconPalette, IconLogout } from "@tabler/icons-react";
import { usePreferenciasExpressivo } from "../lib/expressivo";
import { useExpressivoMobile } from "../lib/contextoAparencia";
import { useRelogio } from "../hooks/useRelogio";

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

const iconesModernos = {painel:IconLayoutDashboard, clientes:IconUsers, solicitacoes:IconClipboardList, projetos:IconFolder, financeiro:IconWallet, convites:IconMail, mensagens:IconMessageCircle, conta:IconUserCircle, tema:IconPalette, sair:IconLogout};
export function IconePainel({nome, tamanho = 18}: {nome: keyof typeof caminhos; tamanho?: number}) {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();

    if ((aparencia.estilo === "moderno" || expressivo) && nome !== "marca") {
        const Icone = iconesModernos[nome];
        return <Icone size={tamanho} stroke={1.75} aria-hidden="true" style={{flexShrink:0}}/>;
    }
    return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d={caminhos[nome]}/></svg>;
}

export function MarcaPainel({lado}: {lado: "admin" | "cliente"}) {
    return <Group gap={9} wrap="nowrap" className={classes.brand}>
        <span className={classes.brandMark}><IconePainel nome="marca" tamanho={20}/></span>
        <div className={classes.brandText}><Text fw={750} size="md" truncate>Funilador</Text><Text size="xs" c="dimmed" truncate>{lado === "admin" ? "Área administrativa" : "Portal do cliente"}</Text></div>
    </Group>;
}

type DadosConta = Omit<Aparencia,"tema"> & {
    nome: string;
    email: string;
    admin: boolean;
    tema: Aparencia["tema"] | null;
    proximaAlteracaoNome: string | null;
};

async function consultarConta(caminho = "", corpo?: object, signal?: AbortSignal): Promise<DadosConta> {
    const resposta = await fetch(`/api/conta${caminho}`, {
        method: corpo ? "PATCH" : "GET",
        ...(corpo ? {headers: {"Content-Type":"application/json"}, body: JSON.stringify(corpo)} : {}),
        signal,
        cache: "no-store",
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível acessar a conta");
    return dados;
}

function SenhaConta({voltar}: {voltar: () => void}) {
    const [atual, setAtual] = useState("");
    const [nova, setNova] = useState("");
    const [confirmacao, setConfirmacao] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    const [sucesso, setSucesso] = useState(false);

    async function salvar(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setErro("");
        if (nova.length < 8 || nova.length > 128) {setErro("A nova senha deve possuir de 8 a 128 caracteres."); return;}
        if (nova !== confirmacao) {setErro("As senhas não coincidem."); return;}
        if (atual === nova) {setErro("A nova senha deve ser diferente da senha atual."); return;}
        setEnviando(true);
        try {
            const resposta = await fetch("/api/conta/senha", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({atual,nova}),cache:"no-store"});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível alterar a senha.");
            setAtual(""); setNova(""); setConfirmacao(""); setSucesso(true);
        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível alterar a senha.");
        } finally {setEnviando(false);}
    }

    if (sucesso) return <Stack gap="sm">
        <Alert color="green">Senha alterada. As outras sessões foram encerradas.</Alert>
        <Button variant="default" onClick={voltar}>Voltar</Button>
    </Stack>;

    return <form onSubmit={salvar}>
        <Stack gap="sm">
            <PasswordInput label="Senha atual" autoComplete="current-password" required maxLength={128} value={atual} onChange={e => setAtual(e.currentTarget.value)}/>
            <PasswordInput label="Nova senha" autoComplete="new-password" description="De 8 a 128 caracteres." required maxLength={128} value={nova} onChange={e => setNova(e.currentTarget.value)}/>
            <PasswordInput label="Confirmar nova senha" autoComplete="new-password" required maxLength={128} value={confirmacao} onChange={e => setConfirmacao(e.currentTarget.value)}/>
            <Text size="xs" c="dimmed">Ao alterar a senha, as outras sessões serão encerradas.</Text>
            {erro && <Alert color="red">{erro}</Alert>}
            <Button type="submit" loading={enviando}>Alterar senha</Button>
            <Button variant="default" disabled={enviando} onClick={voltar}>Voltar</Button>
        </Stack>
    </form>;
}

export function MenuConta({nome, sair, saindo = false, aoAbrir, aoAlterarNome}: {nome?: string | null; email?: string | null; sair: () => void; saindo?: boolean; aoAbrir?: () => void; aoAlterarNome?: (nome: string) => void}) {
    const {aparencia, aplicar} = useAparencia();
    const agora = useRelogio();
    const minimalista = aparencia.estilo === "minimalista";
    const expressivoMobile = useExpressivoMobile();
    const {valor:preferenciasExpressivas}=usePreferenciasExpressivo();
    const lateral=expressivoMobile && preferenciasExpressivas.navMobile === "staggered";
    const moderno = aparencia.estilo === "moderno" || expressivoMobile;
    const reduzirMovimento = useMovimentoReduzido();
    const [aberta, setAberta] = useState(false);
    const [secao, setSecao] = useState<"menu" | "dados" | "preferencias" | "senha">("menu");
    const [conta, setConta] = useState<DadosConta | null>(null);
    const [nomeEditado, setNomeEditado] = useState("");
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const consulta = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        consulta.current = controller;
        void consultarConta("", undefined, controller.signal).then(dados => {
            if (!controller.signal.aborted) {
                setConta(dados);
            }
        }).catch(() => {});
        return () => controller.abort();
    }, []);

    async function carregar() {
        consulta.current?.abort();
        const controller = new AbortController();
        consulta.current = controller;
        setCarregando(true);
        setConta(null);
        setErro("");
        try {
            const dados = await consultarConta("", undefined, controller.signal);
            if (controller.signal.aborted) return;
            setConta(dados);
            setNomeEditado(dados.nome);
        } catch (erroRecebido) {
            if (!controller.signal.aborted) setErro(erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível carregar a conta");
        } finally {if (!controller.signal.aborted) setCarregando(false);}
    }

    function abrir(destino: typeof secao) {
        aoAbrir?.();
        setSecao(destino); setAberta(true);
        void carregar();
    }

    function fechar() {
        if (salvando) return;
        consulta.current?.abort();
        setAberta(false); setCarregando(false); setErro("");
    }

    function mudarSecao(destino: typeof secao) {
        setSecao(destino); setErro("");
        if (destino === "dados") setNomeEditado(conta?.nome ?? "");
    }

    async function salvarNome(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setSalvando(true); setErro("");
        try {
            const dados = await consultarConta("/nome", {nome: nomeEditado});
            setConta(dados); setNomeEditado(dados.nome);
            aoAlterarNome?.(dados.nome);
            toast.mostrar("sucesso", {titulo:"Nome atualizado", mensagem:"Seu nome foi salvo com sucesso."});
        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível salvar o nome");
        } finally {setSalvando(false);}
    }

    async function salvarAparencia(valor: Aparencia) {
        setSalvando(true); setErro("");
        try {
            const dados = await consultarConta("/preferencias", valor);
            setConta(dados); aplicar(normalizarAparencia({...dados,tema:dados.tema ?? undefined}));
            toast.mostrar("sucesso", {titulo:"Preferências salvas", mensagem:"Sua aparência foi atualizada."});
        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível salvar as preferências");
        } finally {setSalvando(false);}
    }

    const bloqueado = !!conta?.proximaAlteracaoNome && new Date(conta.proximaAlteracaoNome).getTime() > agora;
    const titulos = {menu:"Conta e preferências", dados:"Minha conta", preferencias:"Preferências", senha:"Alterar senha"};

    return <>
        <Menu shadow="md" width={232} position="bottom-end" withinPortal transitionProps={{transition:minimalista ? "fade" : "pop-top-right", duration:reduzirMovimento ? 0 : minimalista ? 120 : moderno ? 240 : 180}}>
            <Menu.Target><ActionIcon visibleFrom="sm" className={classes.account} variant="default" size="lg" radius="xl" aria-label="Conta e preferências" title="Conta e preferências"><IconePainel nome="conta"/></ActionIcon></Menu.Target>
            <Menu.Dropdown className={`${classes.accountDropdown} ex-conta-ramificada`}>
                <Menu.Label>{conta?.nome || nome || "Minha conta"}</Menu.Label>
                <Menu.Item leftSection={<IconePainel nome="conta"/>} onClick={() => abrir("dados")}>Minha conta</Menu.Item>
                <Menu.Divider/>
                <Menu.Item leftSection={<IconePainel nome="tema"/>} onClick={() => abrir("preferencias")}>Preferências</Menu.Item>
                <Menu.Divider/>
                <Menu.Item leftSection={<IconePainel nome="sair"/>} color="red" disabled={saindo} onClick={sair}>Sair</Menu.Item>
            </Menu.Dropdown>
        </Menu>
        <ActionIcon hiddenFrom="sm" className={classes.account} variant="default" size="lg" radius="xl" aria-label="Conta e preferências" aria-haspopup="dialog" aria-expanded={aberta} onClick={() => abrir("menu")}><IconePainel nome="conta"/></ActionIcon>
        <Drawer opened={aberta && lateral && secao === "menu"} onClose={fechar} position="right" size="min(340px, 94vw)" title="Conta e preferências" classNames={{content:"ex-mobile-drawer",body:"ex-mobile-drawer-body"}} transitionProps={{transition:"slide-left",duration:reduzirMovimento?0:340}}><Stack gap="sm" className="funilador-conta-acoes"><Text fw={700}>{conta?.nome || nome || "Minha conta"}</Text><Button fullWidth leftSection={<IconePainel nome="conta"/>} onClick={()=>mudarSecao("dados")}>Minha conta</Button><Button fullWidth variant="light" leftSection={<IconePainel nome="tema"/>} onClick={()=>mudarSecao("preferencias")}>Preferências</Button><Button fullWidth color="red" variant="light" leftSection={<IconePainel nome="sair"/>} disabled={saindo} onClick={()=>{fechar();sair();}}>Sair</Button></Stack></Drawer>
        <Modal opened={aberta && !(lateral && secao === "menu")} onClose={fechar} title={titulos[secao]} centered size={secao === "preferencias" ? "lg" : "sm"} classNames={{content:`${classes.accountDialog}${moderno && secao === "menu" ? " funilador-conta-menu-mobile" : ""}${secao === "dados" ? " ex-perfil-conta" : ""}`, body:classes.accountBody}} transitionProps={{transition:"fade", duration:reduzirMovimento ? 0 : 180}} closeOnClickOutside={!salvando && secao !== "senha"} closeOnEscape={!salvando && secao !== "senha"} withCloseButton={!salvando && secao !== "senha"}>
            {secao === "menu" ? <Stack gap="xs" className="funilador-conta-acoes">
                <Text size="sm" fw={600} style={{overflowWrap:"anywhere"}}>{conta?.nome || nome || "Minha conta"}</Text>
                <Button fullWidth variant="subtle" justify="flex-start" leftSection={<IconePainel nome="conta"/>} onClick={() => mudarSecao("dados")}>Minha conta</Button>
                <Button fullWidth variant="subtle" justify="flex-start" leftSection={<IconePainel nome="tema"/>} onClick={() => mudarSecao("preferencias")}>Preferências</Button>
                <Button fullWidth variant="subtle" justify="flex-start" color="red" leftSection={<IconePainel nome="sair"/>} disabled={saindo} onClick={() => {fechar(); sair();}}>Sair</Button>
            </Stack> : secao === "senha" ? <SenhaConta voltar={() => mudarSecao("dados")}/> : <Stack gap="sm">
                {carregando && <Text size="sm" c="dimmed">Carregando conta...</Text>}
                {erro && <Alert color="red">{erro}</Alert>}
                {!carregando && conta && secao === "dados" && <>
                    <form onSubmit={salvarNome}>
                        <Stack gap="xs">
                            <TextInput label="Nome" required maxLength={150} value={nomeEditado} disabled={bloqueado || salvando} onChange={e => setNomeEditado(e.currentTarget.value)} description={bloqueado && conta.proximaAlteracaoNome ? `Disponível em ${new Date(conta.proximaAlteracaoNome).toLocaleString("pt-BR")}.` : !conta.admin ? "Você pode alterar seu nome a cada 6 horas." : undefined}/>
                            <Button type="submit" loading={salvando} disabled={bloqueado || !nomeEditado.trim() || nomeEditado.trim() === conta.nome}>Salvar nome</Button>
                        </Stack>
                    </form>
                    <TextInput label="E-mail de acesso" value={conta.email} readOnly description="A alteração exige verificação por e-mail, ainda não configurada."/>
                    <Button variant="default" disabled={salvando} onClick={() => mudarSecao("senha")}>Alterar senha</Button>
                </>}
                {!carregando && conta && secao === "preferencias" && <>
                    <EditorAparencia inicial={normalizarAparencia({...conta,tema:conta.tema ?? undefined})} salvando={salvando} salvar={v=>void salvarAparencia(v)}/>
                </>}
                {!carregando && !conta && <Button variant="default" onClick={() => void carregar()}>Tentar novamente</Button>}
                <Button variant="subtle" disabled={salvando} onClick={() => mudarSecao("menu")}>Voltar</Button>
            </Stack>}
        </Modal>
    </>;
}
