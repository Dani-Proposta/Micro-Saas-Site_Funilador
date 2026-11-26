import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Alert, Badge, Button, Card, Group, Modal, PasswordInput, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { Carregamento } from "./Carregamento";

type Registro = {id: string; tipo: "link" | "provisoria" | "sessoes"; criadaEm: string; expiraEm: string | null; estado: string; administrador: string | null};
type Acesso = {usuarioId: string | null; email: string | null; senhaProvisoriaAte: string | null; historico: Registro[]};
type Acao = "link" | "provisoria" | "sessoes" | "revogar";
const nomes = {link:"Link de recuperação", provisoria:"Senha provisória", sessoes:"Sessões encerradas", revogar:"Revogar link"};
const estados: Record<string,string> = {ativo:"Ativo", utilizado:"Utilizado", revogado:"Revogado", expirado:"Expirado"};
const data = (valor: string) => new Date(valor).toLocaleString("pt-BR");

export function GerenciarAcesso({clienteId}: {clienteId: string}) {
    const [dados, setDados] = useState<Acesso | null>(null);
    const [erro, setErro] = useState("");
    const [versao, setVersao] = useState(0);
    const [acao, setAcao] = useState<Acao | null>(null);
    const [registro, setRegistro] = useState("");
    const [validade, setValidade] = useState("60");
    const [senha, setSenha] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState<{segredo: string; expiraEm: string; acao: Acao} | null>(null);
    const [feedback, setFeedback] = useState("");
    const [historico, setHistorico] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        async function carregar() {
            try {
                const resposta = await fetch(`/api/clientes/${clienteId}/acesso`, {signal:controller.signal, cache:"no-store"});
                const info = await resposta.json();
                if (!resposta.ok) throw new Error(info.erro ?? "Não foi possível consultar o acesso");
                if (!controller.signal.aborted) {setDados(info); setErro("");}
            } catch (e) {if (!controller.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao consultar o acesso");}
        }
        void carregar();
        return () => controller.abort();
    }, [clienteId,versao]);

    function abrir(tipo: Acao, id = "") {setAcao(tipo); setRegistro(id); setSenha(""); setResultado(null); setFeedback(""); setValidade("60");}
    function fechar() {if (!enviando) {setAcao(null); setSenha(""); setResultado(null); setFeedback("");}}
    async function executar(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!acao || enviando) return;
        setEnviando(true); setFeedback("");
        try {
            const revogar = acao === "revogar";
            const resposta = await fetch(`/api/clientes/${clienteId}/acesso${revogar ? `/${registro}/revogar` : ""}`, {
                method:revogar ? "PATCH" : "POST", headers:{"Content-Type":"application/json"},
                body:JSON.stringify({acao,validade:Number(validade),senhaAdmin:senha}), cache:"no-store",
            });
            const info = await resposta.json();
            if (!resposta.ok) throw new Error(info.erro ?? "Não foi possível concluir a operação");
            setSenha(""); setVersao(v=>v+1);
            if (info.segredo) setResultado({segredo:acao === "link" ? `${window.location.origin}/redefinir#${info.segredo}` : info.segredo, expiraEm:info.expiraEm, acao});
            else {setAcao(null); setFeedback(revogar ? "Link revogado." : "Sessões encerradas.");}
        } catch (e) {setFeedback(e instanceof Error ? e.message : "Falha na operação");}
        finally {setEnviando(false);}
    }
    async function copiar() {
        if (!resultado) return;
        try {await navigator.clipboard.writeText(resultado.segredo); setFeedback("Copiado.");}
        catch {setFeedback("Selecione e copie o texto manualmente.");}
    }

    return <Card withBorder padding="md">
        <Stack gap="sm">
            <Group justify="space-between"><Title order={4}>Gerenciamento de acesso</Title><Button size="compact-xs" variant="subtle" onClick={()=>setVersao(v=>v+1)}>Atualizar</Button></Group>
            {erro && <Alert color="red">{erro}</Alert>}
            {!dados && !erro && <Carregamento tipo="detalhes" quantidade={1}/>}
            {dados && !dados.usuarioId && <Text c="dimmed" size="sm">Este cliente ainda não possui uma conta vinculada.</Text>}
            {dados?.usuarioId && <>
                <Text size="sm" style={{overflowWrap:"anywhere"}}>E-mail de acesso: {dados.email}</Text>
                {dados.senhaProvisoriaAte && <Alert color="yellow">Troca obrigatória de senha. Validade da senha provisória: {data(dados.senhaProvisoriaAte)}.</Alert>}
                <Group gap="xs" wrap="wrap">
                    <Button size="xs" onClick={()=>abrir("link")}>Gerar link de recuperação</Button>
                    <Button size="xs" variant="light" onClick={()=>abrir("provisoria")}>Gerar senha provisória</Button>
                    <Button size="xs" variant="default" onClick={()=>abrir("sessoes")}>Encerrar sessões</Button>
                </Group>
                <Text size="xs" c="dimmed">Confirme a identidade do cliente antes de compartilhar uma recuperação. O link não altera a senha até ser utilizado.</Text>
                {dados.historico.filter(r=>r.tipo === "link" && r.estado === "ativo").map(r=><Group key={r.id} justify="space-between" wrap="wrap"><Text size="sm">Link ativo até {data(r.expiraEm!)}</Text><Button size="compact-xs" color="red" variant="light" onClick={()=>abrir("revogar",r.id)}>Revogar</Button></Group>)}
                <Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={()=>setHistorico(v=>!v)}>{historico ? "Ocultar histórico" : "Ver histórico"} ({dados.historico.length})</Button>
                {historico && <Stack gap="xs">{!dados.historico.length && <Text size="sm" c="dimmed">Nenhuma operação registrada.</Text>}{dados.historico.map(r=><Group key={r.id} justify="space-between" wrap="wrap"><Stack gap={0}><Text size="sm">{nomes[r.tipo]}</Text><Text size="xs" c="dimmed">{data(r.criadaEm)} · {r.administrador ?? "Administrador"}</Text></Stack><Badge variant="light" color={r.estado === "ativo" ? "blue" : "gray"}>{r.tipo === "sessoes" ? "Concluído" : estados[r.estado]}</Badge></Group>)}</Stack>}
                {!acao && feedback && <Alert color="green">{feedback}</Alert>}
            </>}
        </Stack>
        <Modal opened={acao !== null} onClose={fechar} title={acao ? nomes[acao] : "Acesso"} centered closeOnEscape={!enviando} closeOnClickOutside={!enviando && !resultado} withCloseButton={!enviando}>
            {resultado ? <Stack gap="sm">
                <Alert color="yellow">Copie agora. Por segurança, este segredo não poderá ser consultado novamente. Envie apenas ao cliente confirmado.</Alert>
                <TextInput label={resultado.acao === "link" ? "Link de recuperação" : "Senha provisória"} value={resultado.segredo} readOnly onFocus={e=>e.currentTarget.select()}/>
                <Text size="xs" c="dimmed">Expira em {data(resultado.expiraEm)}</Text>
                <Button onClick={()=>void copiar()}>Copiar</Button>
                {feedback && <Text size="sm">{feedback}</Text>}
                <Button variant="default" onClick={fechar}>Fechar</Button>
            </Stack> : <form onSubmit={executar}><Stack gap="sm">
                <Text size="sm">{acao === "link" ? "O cliente escolherá uma nova senha. Outro link ativo será revogado." : acao === "provisoria" ? "A senha atual será substituída imediatamente, as sessões serão encerradas e o cliente terá de trocar a senha antes de acessar o portal." : acao === "sessoes" ? "Todas as sessões atuais do cliente serão encerradas. A senha não será modificada." : "O link selecionado deixará de funcionar."}</Text>
                {(acao === "link" || acao === "provisoria") && <Select label="Validade" value={validade} onChange={v=>setValidade(v ?? "60")} allowDeselect={false} data={[{value:"15",label:"15 minutos"},{value:"60",label:"1 hora"},{value:"1440",label:"24 horas"}]}/>}
                <PasswordInput label="Sua senha de administrador" autoComplete="current-password" required maxLength={128} value={senha} onChange={e=>setSenha(e.currentTarget.value)}/>
                {feedback && <Alert color="red">{feedback}</Alert>}
                <Button type="submit" loading={enviando}>Confirmar</Button>
                <Button variant="default" disabled={enviando} onClick={fechar}>Cancelar</Button>
            </Stack></form>}
        </Modal>
    </Card>;
}
