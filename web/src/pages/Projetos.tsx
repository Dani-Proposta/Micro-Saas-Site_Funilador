import { useEffect, useState } from "react";
import { Alert, Badge, Card, Group, Loader, Stack, Text, Title, } from "@mantine/core";

type Projeto = {
    id: string;
    clienteId: string;
    clienteNome: string;
    solicitacaoId: string | null;
    titulo: string;
    descricao: string;
    status: "planejado" | "em_andamento" | "concluido";
    criadaEm: string;
    atualizadaEm: string;
};

export function Projetos(){
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

    return(
        <Stack gap="md">
            <Title order={2}>Projetos</Title>
            {carregando && <Loader size="sm"/>}
            {!carregando && erro && (<Alert color="red">{erro}</Alert>)}
            {!carregando && !erro && projetos.length === 0 && (<Text c="dimmed">Nenhum projeto encontrado</Text>)}
            {!carregando && !erro && projetos.map((projeto) => (
                <Card key={projeto.id} withBorder padding="md">
                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Text fw={700} lineClamp={1} style={{minWidth:0, overflowWrap:"anywhere"}}>{projeto.titulo}</Text>
                            <Badge style={{flexShrink:0}} color={ projeto.status === "concluido" ? "green" : projeto.status === "em_andamento" ? "blue" : "gray"}>{projeto.status.replace("_"," ")}</Badge>
                        </Group>
                        <Text size="sm" lineClamp={2} style={{overflowWrap:"anywhere"}}>{projeto.descricao}</Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>Cliente: {projeto.clienteNome}</Text>
                    </Stack>
                </Card>
            ))}
        </Stack>
    );
}