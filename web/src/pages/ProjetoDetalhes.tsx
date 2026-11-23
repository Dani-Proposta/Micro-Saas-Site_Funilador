
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title, Modal, Textarea, TextInput } from "@mantine/core";

type Projeto = {
    id: string;
    clienteId: string;
    clienteNome: string;
    solicitacaoId: string | null;
    titulo: string;
    descricao: string;
    status: "planejado" | "em_andamento" | "concluido" | "cancelado";
    criadaEm: string;
    atualizadaEm: string;
    arquivadaEm: string | null;
};

const nomesStatus: Record<Projeto["status"], string> = {
    planejado: "Planejado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
};

const coresStatus: Record<Projeto["status"], string> = {
    planejado: "violet",
    em_andamento: "blue",
    concluido: "green",
    cancelado: "red",
};

export function ProjetoDetalhes() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [projeto, setProjeto] = useState<Projeto | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const [editando, setEditando] = useState(false);
    const [tituloEdicao, setTituloEdicao] = useState("");
    const [descricaoEdicao, setDescricaoEdicao] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [erroEdicao, setErroEdicao] = useState<string | null>(null);

    const [confirmarArquivamento, setConfirmarArquivamento] = useState(false);
    const [processandoArquivo, setProcessandoArquivo] = useState(false);
    const [erroArquivo, setErroArquivo] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function carregarProjeto() {
            setCarregando(true);
            setErro(null);

            try {
                if (!id) {
                    throw new Error("ID do projeto não informado");
                }

                const resposta = await fetch(`/api/projetos/${id}`, { signal: controller.signal, });

                if (!resposta.ok) {
                    throw new Error("não foi possível buscar o projeto");
                }

                const dados: Projeto = await resposta.json();
                setProjeto(dados);
            } catch (erroRecebido) {
                if (!controller.signal.aborted) {
                    console.error(erroRecebido);
                    setErro("não foi possível carregar o projeto");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setCarregando(false);
                }
            }
        }

        void carregarProjeto();

        return () => controller.abort();
    }, [id]);


    function abrirEdicao() {
        if (!projeto || projeto.arquivadaEm) return;

        setTituloEdicao(projeto.titulo);
        setDescricaoEdicao(projeto.descricao);
        setErroEdicao(null);
        setEditando(true);
    }

    async function salvarEdicao() {
        if (!projeto) return;

        if (!tituloEdicao.trim() || !descricaoEdicao.trim()) {
            setErroEdicao("Preencha o título e a descrição");
            return;
        }

        setSalvando(true);
        setErroEdicao(null);

        try {
            const resposta = await fetch(`/api/projetos/${projeto.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", },
                body: JSON.stringify({
                    titulo: tituloEdicao.trim(),
                    descricao: descricaoEdicao.trim(),
                }),
            });

            if (!resposta.ok) {
                throw new Error("Falha ao salvar alterações");
            }

            const dados: Pick<
                Projeto,
                "id" | "titulo" | "descricao" | "atualizadaEm"
            > = await resposta.json();

            setProjeto((anterior) =>
                anterior ? { ...anterior, ...dados } : anterior
            );

            setEditando(false);
        } catch (erro) {
            console.error(erro);
            setErroEdicao("Não foi possível salvar as alterações");
        } finally {
            setSalvando(false);
        }
    }


    async function alterarArquivamento(acao: "arquivar" | "restaurar") {
        if (!projeto || processandoArquivo) return;

        setProcessandoArquivo(true);
        setErroArquivo(null);

        try {
            const resposta = await fetch(`/api/projetos/${projeto.id}/${acao}`,{ method: "PATCH" });

            if (!resposta.ok) {
                throw new Error("Falha ao alterar arquivamento");
            }

            const dados: Pick< Projeto, "id" | "arquivadaEm" | "atualizadaEm"> = await resposta.json();

            setProjeto((anterior) =>
            anterior ? {
                    ...anterior,
                    arquivadaEm: dados.arquivadaEm,
                    atualizadaEm: dados.atualizadaEm,
                } : anterior
            );

            setConfirmarArquivamento(false);
    } catch (erro) {
        console.error(erro);
        setErroArquivo("Não foi possível concluir a operação.");
    } finally {
            setProcessandoArquivo(false);
        }
    }



    if (carregando) {
        return <Loader size="sm" />;
    }

    if (erro || !projeto) {
        return (
            <Stack>
                <Alert color="red">
                    {erro ?? "Projeto não encontrado"}
                </Alert>
                <Button variant="light" onClick={() => navigate("/projetos")}>
                    Voltar aos projetos
                </Button>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">

            <Modal opened={editando} onClose={() => { if (!salvando) setEditando(false);}} title="Editar projeto" centered closeOnEscape={!salvando}closeOnClickOutside={!salvando} withCloseButton={!salvando}>
                <Stack gap="md">
                    <TextInput label="Título" required value={tituloEdicao} onChange={(event) => setTituloEdicao(event.currentTarget.value)}/>
                    <Textarea label="Descrição" required autosize minRows={4} maxRows={10} value={descricaoEdicao} onChange={(event) => setDescricaoEdicao(event.currentTarget.value)}/> {erroEdicao && (<Alert color="red">{erroEdicao}</Alert>)}

                    <Group justify="flex-end">
                        <Button variant="default" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</Button>
                        <Button loading={salvando} onClick={() => void salvarEdicao()}>Salvar alterações</Button>
                    </Group>
                </Stack>
            </Modal>
            <Modal opened={confirmarArquivamento} onClose={() => {if (!processandoArquivo) {setConfirmarArquivamento(false);}}} title="Arquivar projeto" centered closeOnEscape={!processandoArquivo}closeOnClickOutside={!processandoArquivo} withCloseButton={!processandoArquivo}>
                <Stack gap="md">
                    <Text size="sm">Deseja arquivar este projeto? Ele deixará de aparecer na lista principal, mas suas informações serão preservadas. </Text>
                        {erroArquivo && (<Alert color="red">{erroArquivo}</Alert>)}
                        <Group justify="flex-end">
                            <Button variant="default" disabled={processandoArquivo} onClick={() => setConfirmarArquivamento(false)}>Voltar</Button>
                            <Button color="gray" loading={processandoArquivo} onClick={() => void alterarArquivamento("arquivar")}>Confirmar arquivamento</Button>
                        </Group>
                </Stack>
            </Modal>
            <Group justify="space-between" align="start">
                <Stack gap="xs" style={{ minWidth: 0 }}>
                    <Button variant="subtle" size="xs" onClick={() => navigate("/projetos")}> ← Voltar aos projetos</Button>
                    <Title order={2} style={{ overflowWrap: "anywhere" }}>{projeto.titulo}</Title>
                </Stack>

                <Group gap="xs">
                    {projeto.arquivadaEm && (<Badge color="gray">Arquivado</Badge>)}
                    <Badge color={coresStatus[projeto.status]}>{nomesStatus[projeto.status]}</Badge>
                    {!projeto.arquivadaEm && (<Button size="xs" variant="light" onClick={abrirEdicao}>Editar</Button>)}
                    {projeto.arquivadaEm ? (<Button size="xs" variant="light" color="green" loading={processandoArquivo} onClick={() => void alterarArquivamento("restaurar")}>Restaurar</Button>) : (<Button size="xs" variant="light" color="gray" onClick={() => {setErroArquivo(null); setConfirmarArquivamento(true);}}>Arquivar</Button>)}
                </Group>
            </Group>

            {erroArquivo && !confirmarArquivamento && (<Alert color="red">{erroArquivo}</Alert>)}
            
            <Card withBorder padding="lg">
                <Stack gap="md">
                    <Title order={4}>Informações gerais</Title>
                    <Group justify="space-between">
                        <Text c="dimmed">Cliente</Text>
                        <Button variant="subtle" size="sm" onClick={() => navigate(`/clientes/${projeto.clienteId}`)}>{projeto.clienteNome}</Button>
                    </Group>

                    <Group justify="space-between">
                        <Text c="dimmed">Criado em</Text>
                        <Text>{new Date(projeto.criadaEm).toLocaleDateString("pt-BR")}</Text>
                    </Group>

                    <Group justify="space-between">
                        <Text c="dimmed">Última atualização</Text>
                        <Text>{new Date(projeto.atualizadaEm).toLocaleDateString("pt-BR")}</Text>
                    </Group>

                    <Group justify="space-between">
                        <Text c="dimmed">Origem</Text>
                        <Text size="sm">{projeto.solicitacaoId ? "Solicitação aprovada" : "Cadastro manual"}</Text>
                    </Group>
                </Stack>
            </Card>

            <Card withBorder padding="lg">
                <Stack gap="sm">
                    <Title order={4}>Descrição e escopo</Title>

                    <Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", }}>{projeto.descricao}</Text>
                </Stack>
            </Card>
        </Stack>
    );
}
