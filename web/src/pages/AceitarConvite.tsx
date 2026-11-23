
import { useEffect, useState } from "react";
import { Alert, Button, Container, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useParams } from "react-router";

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

    return (
        <Container size={460} py="xl">
            <Paper withBorder radius="md" p="xl">
                <Stack gap="md">

                    <Title order={2} ta="center">Site Funilador</Title>
                    <Text c="dimmed" size="sm" ta="center">Convite de acesso</Text>

                    {carregando && <Loader size="sm" mx="auto"/>}

                    {!carregando && erro && <Alert color="red" title="Convite indisponível">{erro}</Alert>}

                    {!carregando && convite && (
                        <>
                            <Alert color="green" title="Convite válido">
                                {convite.tipo === "vinculado"
                                    ? `Você foi convidado para acessar o cadastro de ${convite.clienteNome}.`
                                    : "Você foi convidado para criar sua conta no Funilador."}
                            </Alert>

                            <Text size="xs" c="dimmed">Válido até {new Date(convite.expiraEm).toLocaleString("pt-BR")}.</Text>

                            <TextInput label="Nome" placeholder="Seu nome" defaultValue={convite.tipo === "vinculado" ? convite.clienteNome ?? "" : ""} disabled={convite.tipo === "vinculado"} required/>
                            <TextInput label="E-mail" placeholder="seu@email.com" type="email" required/>
                            <PasswordInput label="Senha" placeholder="Crie sua senha" required/>

                            <Button disabled>Concluir cadastro</Button>
                            <Text size="xs" c="dimmed" ta="center">O formulário será ativado quando conectarmos a criação da conta.</Text>
                        </>
                    )}

                </Stack>
            </Paper>
        </Container>
    );
}
