import { useState, useEffect, } from "react";
import { Card, Text, Badge, Loader, Alert, Stack, TextInput, Textarea, Button, Modal, Group, Title, Select} from "@mantine/core";
import type { SubmitEvent, } from 'react';

type Solicitacao = {
    id: string;
    clienteNome: string;
    titulo: string;
    descricao: string;
    status: "pendente" | "aprovada" | "recusada";
}

type Cliente = {
  id: string;
  nome: string;
  email: string | null;
};

export function Solicitacoes(){
    
    const [modalAberto, setModalAberto] = useState(false);

    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);
    
    
    const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
    
    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [clienteId, setClienteId] = useState<string | null>(null);

    const [atualizandoId, setAtualizandoId] = useState<string | null>(null);

    //carregar solicitações
    useEffect(() => {
        const controller = new AbortController();

        async function carregar(){
            
            setCarregando(true);
            setErro(null);

            try{
                const resposta = await fetch(`/api/solicitacoes`, { signal: controller.signal});

                if(!resposta.ok){
                    throw new Error("Falha ao buscar solicitações");
                }
                const dados: Solicitacao[] = await resposta.json();
                setSolicitacoes(dados);

            }catch(erroRecebido){
                if(!controller.signal.aborted){
                    console.error(erroRecebido);
                    setErro("Deu erro para carregar as solicitações")
                }
            }finally{
                if(!controller.signal.aborted){
                    setCarregando(false);
                }
            }
        }
        void carregar();

        return () => controller.abort();
    }, []);

    
    useEffect(() => {
        const controller = new AbortController();

        async function carregarClientes() {
            try{
                const resposta = await fetch(`/api/clientes`,{
                    signal: controller.signal,
                });

                if(!resposta.ok){
                    throw new Error("falha ao carregar clientes");
                }

                const dados: Cliente[] = await resposta.json();
                setClientes(dados);
            }catch(erro){
                if (!controller.signal.aborted){
                    console.error("erro ao buscar clientes:", erro);
                }
            }
        }
        void carregarClientes();

        return () => controller.abort();
    }, []);



    //criar solicição e mandar pro DB
    async function criarSolicitacao(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!clienteId) {
            setErroEnvio('Selecione um cliente.');
            return;
        }
        setEnviando(true);
        setErroEnvio(null);
        try{
            const resposta = await fetch(`/api/solicitacoes`, {
                method: "POST",
                headers:{ "Content-Type": "application/json",},
                body: JSON.stringify({
                    clienteId,
                    titulo,
                    descricao,
                }),
            

        });
        if(!resposta.ok){
            throw new Error("falha ao criar solicitação");
        }

        const novaSolicitacao: Solicitacao = await resposta.json();
        const clienteSelecionado = clientes.find(
        (cliente) => cliente.id === clienteId
        );

        setSolicitacoes((anteriores) => [{

            ...novaSolicitacao, clienteNome:clienteSelecionado?.nome ?? "Cliente não indentificado"
        },
            ...anteriores,
        ]);
        setClienteId(null);
        setTitulo("");
        setDescricao("");
        setModalAberto(false);
    }catch(erro){
        console.error(erro);
        setErroEnvio("Não deu pra enviar a solicitação");
    }finally{
        setEnviando(false);
    }

    }

    async function atualizarStatus(id:string, novoStatus: "aprovada" |"recusada") {
        
        setAtualizandoId(id)
        
        try{
            const resposta = await fetch(`/api/solicitacoes/${id}/status`,{ 
                method: "PATCH",
                headers:{
                    "Content-Type": "application/json",
                },body:JSON.stringify({status:novoStatus}),

            });

            if(!resposta.ok){
                throw new Error("Falha ao atualizar Status");
            }

            const dados: {
                id: string;
                status: Solicitacao["status"];
            } = await resposta.json();

            setSolicitacoes((anteriores) =>
                anteriores.map((solicitacao) => solicitacao.id === dados.id ? {...solicitacao, status:dados.status} : solicitacao));
        }catch(erro){
            console.error("Erro ao alterar os status da solicitação", erro);
            alert("Não foi possivel atualizar a solicitação");
        }finally{
            setAtualizandoId(null);
        }
    }


    //aparencia da pagina
    return(
        <div>
            <Group justify="space-between" mb={"md"}>
                <Title order={2}>Solicitações</Title>
                <Button size="xs" onClick={() => setModalAberto(true)}> + Nova Solicitação</Button>
            </Group>
            {carregando && <Loader size="sm"/>}
            
            {!carregando && erro && (
                <Alert color="red" title="Erro">{erro}</Alert>
            )}

            {!carregando && !erro && solicitacoes.length === 0 && (
                <Text c="dimmed">Nenhuma solicitação encontrada.</Text>
            )}
            <Modal 
            opened={modalAberto}
            onClose={() => {setModalAberto(false); setClienteId(null); setTitulo("");setDescricao("");setErroEnvio(null);}}
            title= "Nova solicitação"
            centered
            size={"md"}>

            <form onSubmit={criarSolicitacao}>
                <Stack gap={"sm"}>
                    <Select label="Cliente"
                    placeholder="Selecione um cliente"
                    searchable
                    required
                    nothingFoundMessage="Achei foi ninguem"
                    data={clientes.map((cliente) => ({value : cliente.id, label: cliente.nome}))}
                    value={clienteId}
                    onChange={setClienteId}/>

                    <TextInput label="Titulo"
                    placeholder = "Nome da solicitação(Ex: Desenvolvimento de X, Edição de video)"
                    required
                    value={titulo}
                    onChange={(event) => setTitulo(event.currentTarget.value)}></TextInput>
                    
                    <Textarea label="Descrição"
                    placeholder="Escreve mais sobre a solicitação..."
                    required
                    value={descricao}
                    onChange={(event) => setDescricao(event.currentTarget.value)}></Textarea>

                    {erroEnvio && ( <Alert color="red" title="Erro">{erroEnvio}</Alert>)}
                    <Button type="submit" loading={enviando}>Criar Solicitação</Button>
                </Stack>
            </form>
            </Modal>




            {!carregando && !erro && solicitacoes.map((solicitacao) => (
                <Card key={solicitacao.id} withBorder padding="lg" mt="lg">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={700}>{solicitacao.titulo}</Text>
                    <Text size="sm">{solicitacao.descricao}</Text>
                    </Stack>

                    <Stack align="flex-end" style={{maxWidth: "40%"}}>
                    <Badge>{solicitacao.status}</Badge>
                    <Text size="sm" c="dimmed" ta="right">Cliente: {solicitacao.clienteNome}</Text>

                    </Stack>
                    </Group>
                    {solicitacao.status === "pendente" && (
                        <Group justify="flex-end" mt="sm">
                            <Button size="xs" color="red" variant="outline" disabled={atualizandoId === solicitacao.id} onClick={()=> atualizarStatus(solicitacao.id, "recusada")}>Recusar</Button>
                            <Button size="xs" color="green" disabled={atualizandoId === solicitacao.id} onClick={() => atualizarStatus(solicitacao.id, "aprovada")}>Aprovar</Button>
                        </Group>
                    )}
                </Card>
            ))}
        </div>
    );
}