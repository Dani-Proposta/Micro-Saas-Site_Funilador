import { apiFetch } from "../lib/api-fetch";
import { useRef, useState } from "react";
import { Alert, Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";

export type ClienteSelecao = {id: string; nome: string; email?: string | null};

export function SeletorCliente({clientes, value, onChange, onCriado, disabled = false, onBloqueio}: {
    clientes: ClienteSelecao[];
    value: string | null;
    onChange: (id: string | null) => void;
    onCriado: (cliente: ClienteSelecao & {email: string | null}) => void;
    disabled?: boolean;
    onBloqueio: (bloqueado: boolean) => void;
}) {
    const [busca, setBusca] = useState("");
    const ultimaBusca = useRef("");
    const [criando, setCriando] = useState(false);
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const normalizar = (s: string) => s.trim().toLocaleLowerCase("pt-BR");
    const encontrado = clientes.some(c => normalizar(c.nome).includes(normalizar(busca)));
    const duplicado = clientes.some(c => normalizar(c.nome) === normalizar(nome));

    function abrir() {
        setNome(value ? "" : (busca.trim() || ultimaBusca.current));
        setEmail("");
        setErro(null);
        setCriando(true);
        onBloqueio(true);
    }

    function fechar() {
        setCriando(false);
        setErro(null);
        onBloqueio(false);
    }

    async function cadastrar() {
        if (enviando || !nome.trim()) return;
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {setErro("Informe um e-mail válido ou deixe em branco."); return;}
        setEnviando(true);
        setErro(null);
        try {
            const resposta = await apiFetch("/api/clientes", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({nome: nome.trim(), email: email.trim() || null})});
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível cadastrar o cliente.");
            onCriado(dados);
            onChange(dados.id);
            setBusca(dados.nome);
            ultimaBusca.current = "";
            fechar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao cadastrar cliente.");
        } finally {setEnviando(false);}
    }

    return (
        <Stack gap="xs">
            <Select label="Cliente" placeholder="Selecione um cliente" searchable required={!criando} disabled={disabled || criando} data={clientes.map(c => ({value: c.id, label: c.nome}))} value={value} onChange={id => {ultimaBusca.current = ""; onChange(id);}} searchValue={busca} onSearchChange={valor => {setBusca(valor); if (valor.trim()) ultimaBusca.current = valor.trim();}} nothingFoundMessage="Nenhum cliente encontrado"/>
            {!criando && <Group justify="space-between" gap="xs"><Text size="xs" c="dimmed">{busca.trim() && !encontrado ? "Cliente não encontrado." : "Ainda não está cadastrado?"}</Text><Button type="button" variant="subtle" size="compact-xs" disabled={disabled} onClick={abrir}>+ Cadastrar cliente</Button></Group>}
            {criando && <Stack gap="xs" p="sm" style={{border: "1px solid var(--mantine-color-default-border)", borderRadius: 8}}>
                <Text size="sm" fw={600}>Novo cliente</Text>
                <Text size="xs" c="dimmed">O cadastro é independente do projeto ou solicitação. Não cria uma conta de acesso.</Text>
                <TextInput label="Nome" value={nome} maxLength={150} disabled={enviando} onChange={e => setNome(e.currentTarget.value)}/>
                <TextInput label="E-mail (opcional)" value={email} maxLength={254} disabled={enviando} onChange={e => setEmail(e.currentTarget.value)}/>
                {duplicado && <Text size="xs" c="yellow">Já existe um cliente com esse nome. Confira se é realmente um novo cadastro.</Text>}
                {erro && <Alert color="red">{erro}</Alert>}
                <Group justify="flex-end"><Button type="button" variant="default" size="xs" disabled={enviando} onClick={fechar}>Cancelar</Button><Button type="button" size="xs" loading={enviando} disabled={!nome.trim()} onClick={() => void cadastrar()}>Cadastrar e selecionar</Button></Group>
            </Stack>}
        </Stack>
    );
}
