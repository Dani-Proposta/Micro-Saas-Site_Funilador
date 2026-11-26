import { formatarPrazo, formatarValor } from "../lib/comercial";
import classes from "../styles/Trabalho.module.css";
import estrutura from "../styles/Estrutura.module.css";
import { Carregamento } from "../components/Carregamento";
import { MarcosProjeto } from "../components/MarcosProjeto";
import type { ResumoMarcos } from "../components/MarcosProjeto";
import { DadosComerciaisProjeto } from "../components/DadosComerciaisProjeto";
import type { DadosProjetoAdmin } from "../lib/comercial";

import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { caminhoMensagens, destinoRetorno, registrarOrigem, estadoRetorno } from "../lib/navegacaoContextual";
import { Alert, Badge, Button, Card, Group, Stack, Text, Title, Modal, Textarea, TextInput, Select, Tabs } from "@mantine/core";

type Projeto = DadosProjetoAdmin & {
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
    const location = useLocation();
    const voltarPara = destinoRetorno(location.state, "/projetos");
    const origemAnterior = estadoRetorno(location.state)?.estadoAnterior;
    const rotuloVoltar = voltarPara.startsWith("/clientes/") ? "Voltar ao cliente" : voltarPara === "/" ? "Voltar à visão geral" : voltarPara.startsWith("/financeiro") ? "Voltar ao financeiro" : "Voltar aos projetos";

    const [aba, setAba] = useState<string | null>(()=>new URLSearchParams(location.search).has("marco") ? "marcos" : "geral");
    useEffect(()=>{setAba(new URLSearchParams(location.search).has("marco") ? "marcos" : "geral");},[id,location.search]);
    const [projeto, setProjeto] = useState<Projeto | null>(null);
    const atualizarMarcos = useCallback((dados: ResumoMarcos) => setProjeto(anterior => anterior && anterior.id === dados.id ? {...anterior, progresso: dados.progresso, modoProgresso: dados.modoProgresso, atualizadaEm: dados.atualizadaEm, valorAcordado: dados.valorAcordado, prazoAcordado: dados.prazoAcordado} : anterior), []);
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
    const [alterandoStatus, setAlterandoStatus] = useState(false);
    const [erroStatus, setErroStatus] = useState<string | null>(null);

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



    async function alterarStatus(status: Projeto["status"]) {
        if (!projeto || projeto.arquivadaEm || alterandoStatus || processandoArquivo || projeto.status === status) return;
        setAlterandoStatus(true);
        setErroStatus(null);
        try {
            const resposta = await fetch(`/api/projetos/${projeto.id}/status`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({status})});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível atualizar o status.");
            setProjeto(anterior => anterior && anterior.id === dados.id ? {...anterior, status: dados.status, atualizadaEm: dados.atualizadaEm} : anterior);
        } catch (e) {setErroStatus(e instanceof Error ? e.message : "Falha ao atualizar status.");}
        finally {setAlterandoStatus(false);}
    }

    if (carregando) {
        return <Carregamento tipo="detalhes" quantidade={3}/>;
    }

    if (erro || !projeto) {
        return (
            <Stack>
                <Alert color="red">
                    {erro ?? "Projeto não encontrado"}
                </Alert>
                <Button variant="light" onClick={() => navigate(voltarPara, {state: origemAnterior})}>
                    {rotuloVoltar}
                </Button>
            </Stack>
        );
    }

    return (
        <Stack gap="md" className={classes.pagina}>

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
                <Stack gap="xs" style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <Button variant="subtle" size="xs" style={{alignSelf: "flex-start"}} onClick={() => navigate(voltarPara, {state: origemAnterior})}> ← {rotuloVoltar}</Button>
                    <Title order={1} className={estrutura.heading} style={{ overflowWrap: "anywhere" }}>{projeto.titulo}</Title>
                </Stack>

                <Group gap="xs" wrap="wrap">
                    <Button size="xs" onClick={() => navigate(caminhoMensagens(projeto.clienteId, projeto.id), {state: {...registrarOrigem(`/projetos/${projeto.id}`, location.state), projetoArquivado: !!projeto.arquivadaEm}})}>Conversa do projeto</Button>
                    {projeto.arquivadaEm && (<Badge color="gray">Arquivado</Badge>)}
                    {projeto.arquivadaEm ? <Badge color={coresStatus[projeto.status]}>{nomesStatus[projeto.status]}</Badge> : <Select aria-label="Status do projeto" size="xs" w={150} allowDeselect={false} value={projeto.status} disabled={alterandoStatus || processandoArquivo || confirmarArquivamento} data={Object.entries(nomesStatus).map(([value, label]) => ({value, label}))} onChange={valor => {if (valor === "planejado" || valor === "em_andamento" || valor === "concluido" || valor === "cancelado") void alterarStatus(valor);}}/>}
                    {!projeto.arquivadaEm && (<Button size="xs" variant="light" onClick={abrirEdicao}>Editar</Button>)}
                    {projeto.arquivadaEm ? (<Button size="xs" variant="light" color="green" loading={processandoArquivo} onClick={() => void alterarArquivamento("restaurar")}>Restaurar</Button>) : (<Button size="xs" variant="light" color="gray" disabled={alterandoStatus} onClick={() => {setErroArquivo(null); setConfirmarArquivamento(true);}}>Arquivar</Button>)}
                </Group>
            </Group>

            {erroStatus && <Alert color="red">{erroStatus}</Alert>}
            {erroArquivo && !confirmarArquivamento && (<Alert color="red">{erroArquivo}</Alert>)}
            
            <div className={classes.dados}><div><Text size="xs" c="dimmed">Valor acordado</Text><Text size="sm" fw={600}>{formatarValor(projeto.valorAcordado)}</Text></div><div><Text size="xs" c="dimmed">Prazo acordado</Text><Text size="sm" fw={600}>{formatarPrazo(projeto.prazoAcordado)}</Text></div><div><Text size="xs" c="dimmed">Progresso</Text><Text size="sm" fw={600}>{projeto.progresso == null ? "Não definido" : `${projeto.progresso}%`}</Text></div></div>
            <Tabs value={aba} onChange={setAba} keepMounted className={classes.pagina}>
                <Tabs.List className={classes.abas}><Tabs.Tab value="geral">Visão geral</Tabs.Tab><Tabs.Tab value="comercial">Dados comerciais</Tabs.Tab><Tabs.Tab value="marcos">Marcos e pagamentos</Tabs.Tab></Tabs.List>
                <Tabs.Panel value="geral" pt="sm"><Stack gap="sm">
            <Card withBorder padding="sm">
                <Stack gap="sm">
                    <Title order={4}>Informações gerais</Title>
                    <Group justify="space-between">
                        <Text c="dimmed">Cliente</Text>
                        <Button variant="subtle" size="sm" className={classes.clienteLongo} onClick={() => navigate(`/clientes/${projeto.clienteId}`, {state: registrarOrigem(`/projetos/${projeto.id}`, location.state)})}>{projeto.clienteNome}</Button>
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



            <Card withBorder padding="sm">
                <Stack gap="sm">
                    <Title order={4}>Descrição e escopo</Title>

                    <Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", }}>{projeto.descricao}</Text>
                </Stack>
            </Card>
                </Stack></Tabs.Panel>
                <Tabs.Panel value="comercial" pt="sm"><DadosComerciaisProjeto key={projeto.id} projeto={projeto} onSalvo={dados => setProjeto(anterior => anterior && anterior.id === dados.id ? {...anterior, ...dados} : anterior)}/></Tabs.Panel>
                <Tabs.Panel value="marcos" pt="sm"><MarcosProjeto key={`marcos-${projeto.id}-${new URLSearchParams(location.search).get("marco") ?? ""}`} projeto={projeto} onAtualizado={atualizarMarcos} focoMarco={new URLSearchParams(location.search).get("marco") ?? undefined}/></Tabs.Panel>
            </Tabs>
        </Stack>
    );
}
