import { MolduraAcesso } from "../components/MolduraAcesso";
import type { FormEvent } from "react";
import { useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { Alert, Button, Container, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";

type ConvitePublico = {
    tipo: "livre" | "vinculado";
    clienteNome: string | null;
    expiraEm: string;
};

export function AceitarConvite() {

    const { token } = useParams();

    const [resultado, setResultado] = useState<{
        token: string;
        convite: ConvitePublico | null;
        erro: string | null;
    } | null>(null);

    const carregando = !!token && resultado?.token !== token;
    const convite = resultado?.token === token ? resultado?.convite : null;
    const erro = !token ? "Convite inválido." : resultado?.token === token ? resultado?.erro : null;

    const navigate = useNavigate();

    const [cadastrando, setCadastrando] = useState(false);
    const [erroCadastro, setErroCadastro] = useState<string | null>(null);
    const [cadastroConcluido, setCadastroConcluido] = useState(false);
    
    useEffect(() => {
        if (!token) return;

        const controller = new AbortController();

        async function validarConvite(tokenAtual: string) {
            try {
                const resposta = await fetch(`/api/convite/${encodeURIComponent(tokenAtual)}`, {signal: controller.signal});
                const dados = await resposta.json();

                if (!resposta.ok) throw new Error(dados.erro ?? "Convite indisponível.");

                if (!controller.signal.aborted) setResultado({token: tokenAtual, convite: dados, erro: null});

            } catch (erroRecebido) {
                if (!controller.signal.aborted) {
                    setResultado({
                        token: tokenAtual,
                        convite: null,
                        erro: erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível validar o convite."
                    });
                }
            }
        }

        void validarConvite(token);
        return () => controller.abort();
    }, [token]);


    async function concluirCadastro(evento: FormEvent<HTMLFormElement>) {
        evento.preventDefault();

        if (!token || !convite || cadastrando || cadastroConcluido) return;

        const formulario = new FormData(evento.currentTarget);

        const nome = convite.tipo === "vinculado" ? convite.clienteNome : formulario.get("nome");
        const email = formulario.get("email");
        const senha = formulario.get("senha");

        setCadastrando(true);
        setErroCadastro(null);

        try {
            const resposta = await fetch(`/api/convite/${encodeURIComponent(token)}/aceitar`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({nome, email, senha}),
            });

            const dados = await resposta.json();

            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível concluir o cadastro.");

            setCadastroConcluido(true);

        } catch (erroRecebido) {
            setErroCadastro(erroRecebido instanceof Error ? erroRecebido.message : "Falha ao concluir cadastro.");
        } finally {
            setCadastrando(false);
        }
    }

    return (
        <MolduraAcesso etapa="convite"><Container size={460} py="xl">
            <Paper withBorder radius="md" p="xl">
                <Stack gap="md">

                    <Title order={2} ta="center">Site Funilador</Title>
                    <Text c="dimmed" size="sm" ta="center">Convite de acesso</Text>

                    {carregando && <Loader size="sm" mx="auto"/>}

                    {!carregando && erro && <Alert color="red" title="Convite indisponível">{erro}</Alert>}

                    {!carregando && convite && !cadastroConcluido && (
                        <>
                            
                        <form onSubmit={concluirCadastro}>
                            <Stack gap="md">
                                <TextInput name="nome" label="Nome" placeholder="Seu nome" defaultValue={convite.tipo === "vinculado" ? convite.clienteNome ?? "" : ""} disabled={convite.tipo === "vinculado" || cadastrando} maxLength={150} required/>
                                <TextInput name="email" label="E-mail" placeholder="seu@email.com" type="email" autoComplete="email" disabled={cadastrando} maxLength={254} required/>
                                <PasswordInput name="senha" label="Senha" placeholder="Crie sua senha" description="Mínimo de 8 caracteres" autoComplete="new-password" minLength={8} maxLength={128} disabled={cadastrando} required/>

                                {erroCadastro && <Alert color="red">{erroCadastro}</Alert>}

                                <Button type="submit" loading={cadastrando}>Concluir cadastro</Button>
                            </Stack>
                        </form>

                        </>
                    )}
                {cadastroConcluido && (
                    <>
                        <Alert color="green" title="Cadastro concluído!">Sua conta foi criada com sucesso. Você já pode realizar o login.</Alert>
                        <Button onClick={() => navigate("/login", {replace: true})}>Ir para o login</Button>
                    </>
                )}
                </Stack>
            </Paper>
        </Container></MolduraAcesso>
    );
}
