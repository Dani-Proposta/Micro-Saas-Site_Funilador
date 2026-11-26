import { useEffect, useState, } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";
import {Alert,Button,Card,Group,Loader, Modal, Stack, Text, TextInput, Title} from "@mantine/core"


type Cliente = {
    id: string;
    nome: string;
    email: string | null;
    usuarioId?: string | null;

};

export function Clientes() {
    const [clientes, setClientes] = useState<Cliente[]> ([]) ;
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    //parte do modal de criação

    const [modalAberto, setModalAberto] = useState(false);
    const [nome, setNome] = useState("");  
    const [email, setEmail] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erroCadastro, setErroCadastro] = useState<string | null>(null);

    //editar cliente

    const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);

    const navigate = useNavigate();

    useEffect(() =>{
        const controller  = new AbortController();

        async function carregarClientes(){
            try{
                const resposta = await fetch("/api/clientes", {signal: controller.signal,});

                if(!resposta.ok){
                    throw new Error("Falha ao buscar clientes");
                }

                const dados: Cliente[] = await resposta.json();
                setClientes(dados);

            }catch(erroRecebido){   
                if(!controller.signal.aborted){
                    console.error(erroRecebido);
                    setErro("não foi possivel carregar os clientes");
                }
            }finally{
                if(!controller.signal.aborted){
                    setCarregando(false);
                }
            }    
        }

        void carregarClientes();

        return () => controller.abort();


    }, []);

    async function salvarCliente(event: SubmitEvent<HTMLFormElement>){

        event.preventDefault();

        setEnviando(true);
        setErroCadastro(null);

        try{
            const resposta = await fetch(clienteEditando ? `/api/clientes/${clienteEditando.id}` : "/api/clientes" ,{
                method: clienteEditando ? "PATCH" : "POST",
                headers:{"Content-Type" : "application/json",},
                body: JSON.stringify({nome, email}),
            });

            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível salvar o cliente");
            const novoCliente: Cliente = dados;

            setClientes((anteriores) => 
                clienteEditando ? anteriores.map((cliente) => cliente.id === novoCliente.id ? novoCliente: cliente)
                : [novoCliente,
                ...anteriores,
            ]);

            setNome("");
            setEmail("");
            setModalAberto(false);
            setClienteEditando(null);

        }catch(erro){
            console.error(erro);
            setErroCadastro(erro instanceof Error ? erro.message : "Não foi possível salvar o cliente");
        }finally{
            setEnviando(false);
        }
        
    }

    //Aparencia da pagina de cliente do admin
    return(
        <Stack gap="md">
            <Group justify="space-between">
                <Title order={2}>Clientes</Title>
                <Button size="xs" onClick={() => {setModalAberto(true); setClienteEditando(null); setNome(""); setEmail(""); setErroCadastro(null);}}>+ Novo Cliente</Button>
            </Group>
            <Modal opened={modalAberto} onClose={() => {setModalAberto(false); setClienteEditando(null); setNome(""); setEmail(""); setErroCadastro(null);}} title={clienteEditando ? "Editar cliente" : "Novo cliente"}centered>
                <form onSubmit={salvarCliente}>
                    <Stack gap="sm">
                        <TextInput label="Nome" maxLength={150} required value={nome} onChange={(event)=> setNome(event.currentTarget.value)}/>
                        <TextInput label="E-mail de contato" description={clienteEditando?.usuarioId ? "Não altera o e-mail de acesso à conta." : undefined} type="email" maxLength={254} placeholder="Opcional" value={email} onChange={(event) => setEmail(event.currentTarget.value)}/>
                        {erroCadastro && ( <Alert color="red">{erroCadastro}</Alert>)}
                        <Button type="submit" loading={enviando}>{clienteEditando ? "Salvar alterações" : "Cadastrar cliente"}</Button>
                    </Stack>
                </form>
            </Modal>
            {carregando && <Loader size="sm"></Loader>}
            {erro && <Alert color="red">{erro}</Alert>}
            {!carregando && !erro && clientes.length === 0 && (<Text c="dimmed">Nenhum cliente cadastrado</Text>)}
            {!carregando && !erro && clientes.map((cliente) => (
                <Card key={cliente.id} withBorder padding="md">
                    <Group justify="space-between">
                        <Stack gap={2}>
                            <Text fw={700}>{cliente.nome}</Text>
                            <Text size="sm" c="dimmed">{cliente.email ?? "E-mail não cadastrado"}</Text>
                        </Stack>

                        <Stack justify="flex-end">
                            <Button size="xs" variant="light" onClick={() => {setClienteEditando(cliente); setNome(cliente.nome); setEmail(cliente.email ?? ""); setModalAberto(true);}}>Editar</Button>
                            <Button variant="subtle" size="xs" onClick={() => navigate(`/clientes/${cliente.id}`)}>Ver detalhes</Button>
                        </Stack>
                    </Group>
                </Card>
            ))}
        </Stack>
    )
}