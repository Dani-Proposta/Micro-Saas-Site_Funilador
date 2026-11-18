import { useState, useEffect, } from "react";
import { Card, Text, Badge, Loader, Alert, Stack, TextInput, Textarea, Button, Modal, Group, Title} from "@mantine/core";
import type { SubmitEvent, } from 'react';

type Solicitacao = {
    id: string;
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

    useEffect(() => {
        const controller = new AbortController();

        async function carregar(){
            
            setCarregando(true);
            setErro(null);

            try{
                const resposta = await fetch("/api/solicitacoes", { signal: controller.signal});

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

    async function criarSolicitacao(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        
        setEnviando(true);
        setErroEnvio(null);
        try{
            const resposta = await fetch("/api/solicitacoes", {
                method: "POST",
                headers:{ "Content-Type": "application/json",},
                body: JSON.stringify({
                    titulo,
                    descricao,
                }),
            

        });
        if(!resposta.ok){
            throw new Error("falha ao criar solicitação");
        }

        const novaSolicitacao: Solicitacao = await resposta.json();

        setSolicitacoes((anteriores) => [
            novaSolicitacao,
            ...anteriores,
        ]);
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
            onClose={() => setModalAberto(false)}
            title= "Nova solicitação"
            centered
            size={"md"}>

            <form onSubmit={criarSolicitacao}>
                <Stack gap={"sm"}>
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
                    <Text fw={700}>{solicitacao.titulo}</Text>
                    <Text size="sm">{solicitacao.descricao}</Text>
                    <Badge>{solicitacao.status}</Badge>
                </Card>
            ))}
        </div>
    );
}