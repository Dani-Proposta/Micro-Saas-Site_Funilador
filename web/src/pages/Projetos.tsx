import { useEffect, useState } from "react";
import { Alert, Card, Group, Loader, Stack, Select, Text, Title, Button, Modal, TextInput, Textarea  } from "@mantine/core";
import type { SubmitEvent } from "react";

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
};

type Cliente ={
    id: string;
    nome: string;
};


export function Projetos(){
    const [clientes, setClientes] = useState<Cliente[]>([]);

    const [modalAberto, setModalAberto] = useState(false);
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [titulo, setTitulo] = useState("");
    const [descricao, setDescricao] = useState("");

    const [atualizandoId, setAtualizandoId] = useState<string | null>(null);
    const [erroStatus, setErroStatus] = useState<string | null>(null);

    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);

    const [projetos, setProjetos] = useState<Projeto[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() =>{
        const controller = new AbortController();

        async function carregarProjetos() {

            try{
                const resposta = await fetch("/api/projetos", {signal: controller.signal,});

                if(!resposta.ok){
                    throw new Error("Falhou pra procurar os projetos");
                }

                const dados: Projeto[] = await resposta.json();
                setProjetos(dados);
            }catch(erroRecebido){
                if (!controller.signal.aborted) {
                    console.error(erroRecebido);
                    setErro("Não foi possível carregar os projetos");
                }
            }finally{
                if(!controller.signal.aborted){
                    setCarregando(false);
                }
            }
        }

        void carregarProjetos();

        return () => controller.abort();
    }, []);

    useEffect(() => {
        async function carregarClientes() {
            try{
                const resposta = await fetch("api/clientes");

                if(!resposta.ok){
                    throw new Error("Erro ao buscar os clientes");
                }

                const dados: Cliente[] = await resposta.json();
                setClientes(dados);

            }catch(erro){
                console.error(erro);
            }
        }
        void carregarClientes();
    }, []);

    async function criarProjeto(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        if(!clienteId){
            setErroEnvio("Selecione um cliente");
            return;
        }

        setEnviando(true);
        setErroEnvio(null);

        try{
            const resposta = await fetch("/api/projetos",{
                method: "POST",
                headers:{ "Content-Type": "application/json",},
                body: JSON.stringify({
                    clienteId,
                    titulo,
                    descricao,
                }),
            });

            if(!resposta.ok){
                throw new Error("Falha ao criar projeto");
            }

            const novoProjeto: Omit<Projeto, "clienteNome"> = await resposta.json();

            const clienteSelecionado = clientes.find((cliente) => cliente.id === clienteId);
            
            setProjetos((anteriores) => [{

                ...novoProjeto,
                clienteNome: clienteSelecionado?.nome ?? "Cliente não indentificado",
            },
            ...anteriores,
            ]);

            setClienteId(null);
            setTitulo("");
            setDescricao("");
            setModalAberto(false);
        }catch(erro){
            console.error(erro)
            setErroEnvio("Não foi possivel criar projeto");
        }finally{
            setEnviando(false);
        }
        
    }

    async function alterarStatus(id: string, novoStatus: Projeto["status"]) {
        setAtualizandoId(id);
        setErroStatus(null);

        try{
            const resposta = await fetch(`/api/projetos/${id}/status`, {
                method: "PATCH",
                headers: {"Content-Type":"application/json",},
                body: JSON.stringify({status:novoStatus}),
            });

            if(!resposta.ok){
                throw new Error("erro ao atulizar status");
            }

            const dados: Pick<Projeto, "id" | "status" | "atualizadaEm"> = await resposta.json();

            setProjetos((anteriores) => anteriores.map((projeto) => projeto.id === dados.id ?{ ...projeto, status: dados.status, atualizadaEm : dados.atualizadaEm,} : projeto));
        }catch(erro){
            console.error(erro);
            setErroStatus("não foi possivel atualizar o projeto");
        }finally{
            setAtualizandoId(null)
        }
    }


    return(
        <Stack gap="md">
            <Group justify="space-between">
            <Title order={2}>Projetos</Title>
            {erroStatus && <Alert color="red">{erroStatus}</Alert>}
            <Button size="xs" onClick={() => setModalAberto(true)}> + Novo projeto </Button>
            </Group>
            <Modal opened={modalAberto} onClose={() => { setModalAberto(false); setClienteId(null); setTitulo(""); setDescricao(""); setErroEnvio(null)}} title = "Novo Projeto" centered>
                <form onSubmit={criarProjeto}>
                    <Stack gap="sm">
                        <Select label="Cliente" placeholder= "Escolha um cliente existente" searchable required data={clientes.map((cliente) => ({value: cliente.id, label: cliente.nome,}))} value={clienteId} onChange={setClienteId}/>
                        <TextInput label="Titulo" required value={titulo} onChange={(event) => setTitulo(event.currentTarget.value)}/>
                        <Textarea label="Descrição" required minRows={3} value={descricao} onChange={(event) => setDescricao(event.currentTarget.value)}/>
                        {erroEnvio && (<Alert color="red">{erroEnvio}</Alert>)}
                        <Button type="submit" loading={enviando}>Criar projeto</Button>
                    </Stack>    
                </form>
            </Modal>
            {carregando && <Loader size="sm"/>}
            {!carregando && erro && (<Alert color="red">{erro}</Alert>)}
            {!carregando && !erro && projetos.length === 0 && (<Text c="dimmed">Nenhum projeto encontrado</Text>)}
            {!carregando && !erro && projetos.map((projeto) => (
                <Card key={projeto.id} withBorder padding="md">
                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Text fw={700} lineClamp={1} style={{minWidth:0, overflowWrap:"anywhere"}}>{projeto.titulo}</Text>
                            <Select size="xs" w={165} chevronColor="#000000"styles={{input:{backgroundColor: projeto.status === "concluido" ? "var(--mantine-color-green-filled)" : projeto.status === "em_andamento" ? "var(--mantine-color-blue-filled)" : projeto.status === "cancelado" ? "var(--mantine-color-red-filled)" : "var(--mantine-color-violet-filled)" , color: "black", fontWeight: 600, border: "1px solid #000000",},}}value={projeto.status} disabled={atualizandoId !== null} allowDeselect={false} data={[ {value: "planejado", label: "Planejado"}, {value: "em_andamento", label: "Em andamento"},{ value: "concluido", label: "Concluído"},{value : "cancelado", label: "Cancelado"}]} onChange={(novoStatus) => {if(novoStatus === "planejado" || novoStatus === "em_andamento" || novoStatus === "concluido"|| novoStatus === "cancelado"){void alterarStatus(projeto.id, novoStatus);}}}/>
                        </Group>
                        <Text size="sm" lineClamp={2} style={{overflowWrap:"anywhere"}}>{projeto.descricao}</Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>Cliente: {projeto.clienteNome}</Text>
                    </Stack>
                </Card>
            ))}
        </Stack>
    );
}