import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Button, Paper, PasswordInput, Stack, TextInput, Title, } from "@mantine/core";
import type { SubmitEvent } from "react";
import { authClient } from "../lib/auth-client";

export function Login(){
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
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
        <Paper withBorder p="xl" radius="md" maw={420} mx="auto">
            <form onSubmit={fazerLogin}>
                <Stack gap="md">
                    <Title order={2}>Entrar no painel</Title>

                    <TextInput label="Email" type="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)}/>
                    <PasswordInput label="Senha" required value={senha} onChange={(event) => setSenha(event.currentTarget.value)}/>
                    {erro && <Alert color="red">{erro}</Alert>}
                    <Button type="submit" loading={entrando}>Entrar</Button>
                </Stack>
            </form>
        </Paper>
    );

}
