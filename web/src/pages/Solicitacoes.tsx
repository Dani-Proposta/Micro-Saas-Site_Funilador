import { useState, useEffect } from "react";
import { Card, Text, Badge, Loader, Alert,} from "@mantine/core";


type Solicitacao = {
    id: string;
    titulo: string;
    descricao: string;
    status: "pendente" | "aprovada" | "recusada";
}

export function Solicitacoes(){
    
    const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);

    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);


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

    return(
        <div>
            <h1>Solicitações</h1>
            {carregando && <Loader size="sm"/>}
            
            {!carregando && erro && (
                <Alert color="red" title="Erro">{erro}</Alert>
            )}

            {!carregando && !erro && solicitacoes.length === 0 && (
                <Text c="dimmed">Nenhuma solicitação encontrada.</Text>
            )}

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