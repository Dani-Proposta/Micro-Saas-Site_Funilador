import { MolduraAcesso } from "../components/MolduraAcesso";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";

export function RedefinirSenha({provisoria = false}: {provisoria?: boolean}) {
    const navigate = useNavigate();
    const [token, setToken] = useState(()=>provisoria ? "" : window.location.hash.slice(1));
    const [nova, setNova] = useState("");
    const [confirmar, setConfirmar] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState("");
    const [feito, setFeito] = useState(false);

    async function salvar(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (enviando) return;
        setErro("");
        if (nova.length < 8 || nova.length > 128) {setErro("A nova senha deve possuir de 8 a 128 caracteres."); return;}
        if (nova !== confirmar) {setErro("As senhas não coincidem."); return;}
        setEnviando(true);
        try {
            const resposta = await fetch(provisoria ? "/api/conta/senha" : "/api/recuperacao", {method:provisoria ? "PATCH" : "POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(provisoria ? {provisoria:true,nova} : {token:token.trim(),senha:nova}),cache:"no-store"});
            const info = await resposta.json();
            if (!resposta.ok) throw new Error(info.erro ?? "Não foi possível redefinir a senha");
            setToken(""); setNova(""); setConfirmar(""); setFeito(true);
            if (!provisoria) window.history.replaceState(window.history.state,"",window.location.pathname);
        } catch (e) {setErro(e instanceof Error ? e.message : "Falha ao redefinir a senha");}
        finally {setEnviando(false);}
    }
    async function voltar() {
        try {await authClient.signOut();} catch { /* a sessão já pode estar encerrada */ }
        //recarregar para descartar a sessão antiga no cliente
        window.location.replace("/login");
    }
    const formulario = <Paper withBorder p="lg" radius="md" maw={440} mx="auto" mt="xl" style={{maxWidth:"calc(100% - 24px)"}}>
        {feito ? <Stack gap="sm"><Title order={2}>Senha redefinida</Title><Alert color="green">Entre novamente com sua nova senha.</Alert><Button onClick={()=>void voltar()}>Ir para o login</Button></Stack> : <form onSubmit={salvar}><Stack gap="sm">
            <Title order={2}>{provisoria ? "Escolha sua nova senha" : "Redefinir senha"}</Title>
            <Text size="sm" c="dimmed">{provisoria ? "Por segurança, troque a senha provisória antes de acessar seus projetos." : "Utilize o código enviado pelo administrador. O link é válido apenas uma vez."}</Text>
            {!provisoria && <TextInput label="Código de recuperação" required maxLength={43} autoComplete="off" value={token} onChange={e=>setToken(e.currentTarget.value)}/>}
            <PasswordInput label="Nova senha" required autoComplete="new-password" maxLength={128} value={nova} onChange={e=>setNova(e.currentTarget.value)}/>
            <PasswordInput label="Confirmar nova senha" required autoComplete="new-password" maxLength={128} value={confirmar} onChange={e=>setConfirmar(e.currentTarget.value)}/>
            {erro && <Alert color="red">{erro}</Alert>}
            <Button type="submit" loading={enviando}>Redefinir senha</Button>
            <Button variant="subtle" disabled={enviando} onClick={()=>provisoria ? void voltar() : navigate("/login", {replace:true})}>{provisoria ? "Sair" : "Voltar ao login"}</Button>
        </Stack></form>}
    </Paper>;
    return provisoria ? formulario : <MolduraAcesso etapa="recuperacao">{formulario}</MolduraAcesso>;
}
