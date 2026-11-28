import { ProgressoModerno, NumeroModerno } from "./InteracaoModerna";
import { toast } from "../lib/toasts";
import { CampoData } from "./CampoData";
import classes from "../styles/Trabalho.module.css";
import { useState } from "react";
import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { formatarPrazo, prioridades } from "../lib/comercial";
import type { DadosProjeto, DadosProjetoAdmin } from "../lib/comercial";

//dados visíveis ao cliente
export function ResumoProjeto({projeto}: {projeto: DadosProjeto}) {
    return <Stack gap="sm">
        <SimpleGrid cols={{base: 1, xs: 2}}>
            <Stack gap={2}><Text size="xs" c="dimmed">Valor acordado</Text><Text fw={500}>{<NumeroModerno valor={projeto.valorAcordado} moeda/>}</Text></Stack>
            <Stack gap={2}><Text size="xs" c="dimmed">Prazo acordado</Text><Text fw={500}>{formatarPrazo(projeto.prazoAcordado)}</Text></Stack>
        </SimpleGrid>
        {projeto.modoProgresso === "manual" ? <>
            <Group justify="space-between"><Text size="sm">Progresso manual</Text><Text size="sm" c="dimmed">{projeto.progresso == null ? "Não definido" : <NumeroModerno valor={projeto.progresso} percentual/>}</Text></Group>
            {projeto.progresso != null && <ProgressoModerno valor={projeto.progresso} cor="violet"/>}
        </> : <Text size="sm" c="dimmed">Progresso calculado pelos marcos</Text>}
        <Text size="sm" fw={500}>Tecnologias</Text>
        {projeto.tecnologias?.length ? <Group gap="xs">{projeto.tecnologias.map(t => <Badge key={t} variant="light" style={{maxWidth: "100%"}}>{t}</Badge>)}</Group> : <Text size="sm" c="dimmed">Não definidas</Text>}
    </Stack>;
}

type ProjetoAdmin = DadosProjetoAdmin & {id: string; arquivadaEm: string | null};
type DadosSalvos = DadosProjetoAdmin & {id: string; atualizadaEm: string};

//admin: editar informações do projeto
export function DadosComerciaisProjeto({projeto, onSalvo}: {projeto: ProjetoAdmin; onSalvo: (dados: DadosSalvos) => void}) {
    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState("");
    const [prazo, setPrazo] = useState("");
    const [prioridade, setPrioridade] = useState<string | null>(null);
    const [progresso, setProgresso] = useState("");
    const [modoProgresso, setModoProgresso] = useState<DadosProjeto["modoProgresso"]>("manual");
    const [tecnologias, setTecnologias] = useState("");
    const [observacoes, setObservacoes] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    function editar() {
        setValor(projeto.valorAcordado ?? "");
        setPrazo(projeto.prazoAcordado ?? "");
        setPrioridade(projeto.prioridade ?? null);
        setProgresso(projeto.progressoManual == null ? "" : String(projeto.progressoManual));
        setModoProgresso(projeto.modoProgresso);
        setTecnologias((projeto.tecnologias ?? []).join("\n"));
        setObservacoes(projeto.observacoesInternas ?? "");
        setErro(null);
        setEditando(true);
    }

    async function salvar() {
        if (salvando || projeto.arquivadaEm) return;
        if (progresso !== "" && (!/^\d{1,3}$/.test(progresso) || Number(progresso) > 100)) {
            setErro("Informe um progresso de 0 a 100");
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            const resposta = await fetch(`/api/projetos/${projeto.id}/comercial`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    valorAcordado: valor,
                    prazoAcordado: prazo,
                    prioridade,
                    modoProgresso,
                    progresso: progresso === "" ? null : Number(progresso),
                    tecnologias: tecnologias.split("\n").map(t => t.trim()).filter(Boolean),
                    observacoesInternas: observacoes,
                }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível salvar");
            onSalvo(dados);
            setEditando(false);
            toast.mostrar("sucesso", {titulo:"Dados comerciais salvos", mensagem:"As informações do projeto foram atualizadas."});
        } catch (erroRecebido) {
            setErro(erroRecebido instanceof Error ? erroRecebido.message : "Não foi possível salvar");
        } finally {
            setSalvando(false);
        }
    }

    return <Card withBorder padding="sm" className={`${classes.pagina} funilador-projeto-comercial`}>
        <Stack gap="sm">
            <Group justify="space-between"><Title order={4}>Dados do projeto</Title>{!editando && !projeto.arquivadaEm && <Button size="xs" variant="light" onClick={editar}>Editar dados</Button>}</Group>
            {editando && !projeto.arquivadaEm ? <>
                <SimpleGrid cols={{base: 1, xs: 2}}>
                    <TextInput label="Valor acordado (R$)" placeholder="Ex.: 2500,00" inputMode="decimal" maxLength={13} value={valor} onChange={e => setValor(e.currentTarget.value)} disabled={salvando}/>
                    <CampoData label="Prazo acordado" value={prazo} onChange={setPrazo} disabled={salvando}/>
                    <Select label="Modo de progresso" data={[{value: "manual", label: "Manual"}, {value: "marcos", label: "Por marcos"}]} allowDeselect={false} value={modoProgresso} onChange={v => {if (v === "manual" || v === "marcos") setModoProgresso(v);}} disabled={salvando}/>
                    {modoProgresso === "manual" && <TextInput label="Progresso (%)" inputMode="numeric" maxLength={3} value={progresso} onChange={e => setProgresso(e.currentTarget.value)} disabled={salvando}/>} 
                    <Select label="Prioridade (interna)" placeholder="Não definida" clearable data={prioridades} value={prioridade} onChange={setPrioridade} disabled={salvando}/>
                </SimpleGrid>
                <Textarea label="Tecnologias" description="Uma por linha" autosize minRows={2} maxRows={6} value={tecnologias} onChange={e => setTecnologias(e.currentTarget.value)} maxLength={1830} disabled={salvando}/>
                <Textarea label="Observações internas" description="Só para a administração" autosize minRows={2} maxRows={8} value={observacoes} onChange={e => setObservacoes(e.currentTarget.value)} maxLength={5000} disabled={salvando}/>
                {erro && <Alert color="red">{erro}</Alert>}
                <Group justify="flex-end"><Button variant="default" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</Button><Button loading={salvando} onClick={() => void salvar()}>Salvar</Button></Group>
            </> : <>
                <ResumoProjeto projeto={projeto}/>
                <Text size="sm">Prioridade (interna): {prioridades.find(p => p.value === projeto.prioridade)?.label ?? "Não definida"}</Text>
                <Text size="sm" fw={500}>Observações internas</Text>
                <Text size="sm" c="dimmed" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{projeto.observacoesInternas || "Nenhuma observação"}</Text>
            </>}
        </Stack>
    </Card>;
}
