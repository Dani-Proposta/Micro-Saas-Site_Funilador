import { MolduraAcesso } from "../components/MolduraAcesso";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Button, Paper, PasswordInput, Stack, TextInput, Title, useComputedColorScheme } from "@mantine/core";
import type { SubmitEvent } from "react";
import { authClient } from "../lib/auth-client";
import { useAparencia } from "../lib/contextoAparencia";

export function Login(){
    const navigate = useNavigate();
    const {aparencia} = useAparencia();
    const tema = useComputedColorScheme("light", {getInitialValueInEffect: true});
    const logo = tema === "dark" ? "claro" : "escuro";

    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [ajuda, setAjuda] = useState(false);
    const [entrando, setEntrando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    async function fazerLogin(event: SubmitEvent<HTMLFormElement>){
        event.preventDefault();

        setEntrando(true);
        setErro(null);

        try{
            const { error } = await authClient.signIn.email({
                email,
                password: senha,
            });

            if(error){
                setErro("Senha ou email inválidos");
                return;
            }

            navigate("/", {replace: true});
        }catch(erroRecebido){
            console.error("Erro no login:", erroRecebido);
            setErro("Não foi possivel se conectar ao servidor.");
        }finally{
            setEntrando(false);
        }
        
    }

    //visual

    return(
        <MolduraAcesso etapa="login"><Paper withBorder p="xl" radius="md" maw={420} mx="auto">
            <form onSubmit={fazerLogin}>
                <Stack gap="md">
                    {aparencia.estilo === "minimalista" && <img src={`/brand/funilador-logo-${logo}.svg`} alt="Funilador" width={190} height={60} style={{display:"block",marginInline:"auto",maxWidth:"100%",height:"auto"}}/>}
                    <Title order={2}>Entrar no painel</Title>

                    <TextInput label="Email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.currentTarget.value)}/>
                    <PasswordInput label="Senha" autoComplete="current-password" required value={senha} onChange={(event) => setSenha(event.currentTarget.value)}/>
                    {erro && <Alert color="red">{erro}</Alert>}
                    <Button type="submit" loading={entrando}>Entrar</Button>
                    <Button type="button" variant="subtle" size="sm" onClick={()=>setAjuda(v=>!v)}>Esqueci minha senha</Button>
                    {ajuda && <Alert color="blue">Entre em contato com o administrador pelo canal de atendimento habitual para solicitar um link ou código de recuperação.</Alert>}
                    {ajuda && <Button type="button" variant="default" size="sm" onClick={()=>navigate("/redefinir")}>Já tenho um código</Button>}
                </Stack>
            </form>
        </Paper></MolduraAcesso>
    );

}
