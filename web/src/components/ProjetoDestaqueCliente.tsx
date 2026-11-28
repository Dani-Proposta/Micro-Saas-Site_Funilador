import { apiFetch } from "../lib/api-fetch";
import { CircularExpressivo, SloshExpressivo, TrilhoMarcos } from "./expressivo/ProgressoExpressivo";
import { useExpressivo } from "../lib/contextoAparencia";
import { useMediaQuery } from "@mantine/hooks";
import { SheetMobile } from "./SheetMobile";
import { useCallback, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconArrowUpRight, IconMessageCircle, IconFolder, IconRefresh, IconCalendar, IconChecks } from "@tabler/icons-react";
import { useNavigate } from "react-router";
import { useAtualizacaoPeriodica } from "../hooks/useAtualizacaoPeriodica";
import { NumeroModerno, ProgressoModerno, TransicaoConteudo, ValorUrgencia } from "./InteracaoModerna";
import { formatarPrazo } from "../lib/comercial";
import type { ResumoMarcos } from "./MarcosProjeto";
import type { Pendencia } from "./PendenciasDashboard";
import { caminhoPendencia, resumirPendenciasProjeto } from "../lib/selecionarPendencias";
import { IconeModerno } from "./AcabamentoModerno";

export type ProjetoDestaque = {id:string; titulo:string; descricao:string; status:string; prazoAcordado:string|null; atualizadaEm:string; progresso:number|null};
type Conversa = {id:string; tipo:string; projetoId:string|null; arquivadaEm:string|null};
const rotulos: Record<string,string> = {planejado:"Planejado",em_andamento:"Em andamento",concluido:"Concluído",cancelado:"Cancelado"};
const rotulosMarco: Record<string,string> = {pendente:"Pendente",em_andamento:"Em produção",aguardando_validacao:"Aguardando sua validação"};

export function ProjetoDestaqueCliente({projetos,erro=false,onAtualizar,pendencias,erroPendencias,onAtualizarPendencias}: {projetos:ProjetoDestaque[]|null; erro?:boolean; onAtualizar?:()=>void; pendencias:Pendencia[]|null; erroPendencias:string|null; onAtualizarPendencias:()=>void}) {
    const [criterio,setCriterio] = useState("recente");
    const ativos = (projetos ?? []).filter(p=>p.status === "planejado" || p.status === "em_andamento");
    const candidatos = ativos.length ? ativos : (projetos ?? []).filter(p=>p.status === "concluido");
    const ordenados = [...candidatos].sort((a,b)=>b.atualizadaEm.localeCompare(a.atualizadaEm));
    const projeto = criterio === "prazo" ? [...ordenados].filter(p=>p.prazoAcordado).sort((a,b)=>a.prazoAcordado!.localeCompare(b.prazoAcordado!))[0] : criterio === "progresso" ? [...ordenados].filter(p=>p.progresso != null).sort((a,b)=>b.progresso!-a.progresso!)[0] : ordenados[0];
    const atencao = projeto ? resumirPendenciasProjeto(pendencias, projeto.id) : null;
    return <Card withBorder className="funilador-projeto-destaque" data-prioridade={atencao?.prioridade}><Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap"><Group gap="sm"><span className="funilador-destaque-icone"><IconFolder size={24}/></span><Stack gap={2}><Text size="xs" fw={700} c="dimmed">SEU ESPAÇO DE TRABALHO</Text><Title order={3}>Projeto em destaque</Title></Stack></Group><Select aria-label="Critério do projeto em destaque" value={criterio} allowDeselect={false} onChange={v=>setCriterio(v??"recente")} data={[{value:"recente",label:"Último atualizado"},{value:"prazo",label:"Prazo mais próximo"},{value:"progresso",label:"Mais próximo de concluir (%)"}]}/></Group>
        {erro && <Alert color="yellow">Não foi possível atualizar os projetos. {onAtualizar && <Button size="compact-xs" variant="subtle" onClick={onAtualizar}>Tentar novamente</Button>}</Alert>}
        {projetos === null && erro ? null : projetos === null ? <Text size="sm" c="dimmed">Carregando projetos...</Text> : !projeto ? <Text size="sm" c="dimmed">Nenhum projeto com dados para este critério. Experimente outra opção.</Text> : <TransicaoConteudo identidade={projeto.id}><DetalheDestaque key={projeto.id} projeto={projeto} atencao={atencao!} pendenciasCarregadas={pendencias !== null} erroPendencias={erroPendencias} atualizarPendencias={onAtualizarPendencias}/></TransicaoConteudo>}
    </Stack></Card>;
}

function DetalheDestaque({projeto,atencao,pendenciasCarregadas,erroPendencias,atualizarPendencias}: {projeto:ProjetoDestaque; atencao:ReturnType<typeof resumirPendenciasProjeto<Pendencia>>; pendenciasCarregadas:boolean; erroPendencias:string|null; atualizarPendencias:()=>void}) {
    const [mostrarPendencias,setMostrarPendencias] = useState(false);
    const navigate = useNavigate();
    const expressivo = useExpressivo();
    const mobile = useMediaQuery("(max-width:47.99em)");
    const [detalheRapido,setDetalheRapido] = useState(false);
    const [resumo,setResumo] = useState<ResumoMarcos|null>(null);
    const [conversas,setConversas] = useState<Conversa[]|null>(null);
    const [erro,setErro] = useState(false);
    const [erroConversas,setErroConversas] = useState(false);
    const [atualizando,setAtualizando] = useState(false);
    const [repeticao,setRepeticao] = useState(0);
    const repetir = useRef(false);
    const carregar = useCallback(async (signal:AbortSignal)=>{
        setAtualizando(true);
        try {
            const [marcos,chat] = await Promise.allSettled([apiFetch(`/api/me/projetos/${encodeURIComponent(projeto.id)}/marcos`,{signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error();return await r.json() as ResumoMarcos;}),apiFetch("/api/me/conversas",{signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error();return await r.json() as Conversa[];})]);
            if(signal.aborted)return;
            if(marcos.status === "fulfilled" && Array.isArray(marcos.value.marcos)){setResumo(marcos.value);setErro(false);if(repetir.current)setRepeticao(v=>v+1);}else setErro(true);
            if(chat.status === "fulfilled" && Array.isArray(chat.value)){setConversas(chat.value);setErroConversas(false);}else {setConversas(null);setErroConversas(true);}
        } finally {if(!signal.aborted){repetir.current=false;setAtualizando(false);}}
    },[projeto.id]);
    const atualizar = useAtualizacaoPeriodica(carregar,30000);
    const marcos = resumo?.marcos.filter(m=>m.status !== "cancelado") ?? [];
    const restantes = marcos.filter(m=>m.status !== "concluido");
    const emProducao = restantes.filter(m=>m.status === "em_andamento");
    const prioridade = [...restantes].sort((a,b)=>Number(b.status === "aguardando_validacao")-Number(a.status === "aguardando_validacao") || Number(b.status === "em_andamento")-Number(a.status === "em_andamento") || (a.prazoEntrega??"9999").localeCompare(b.prazoEntrega??"9999"));
    const geral = conversas?.find(c=>c.tipo === "geral" && !c.arquivadaEm);
    const conversa = conversas?.find(c=>c.projetoId === projeto.id && c.tipo === "projeto" && !c.arquivadaEm);
    const abrir = (id?:string)=>navigate(id ? `/portal/mensagens?conversa=${encodeURIComponent(id)}` : "/portal/mensagens",{state:{voltarPara:"/portal"}});
    const progresso = resumo ? resumo.progresso : projeto.progresso;
    return <Stack gap="md"><Group justify="space-between" align="start"><Stack gap={4} style={{minWidth:0}}><Badge variant="light">{rotulos[projeto.status]??projeto.status}</Badge><Title order={2} style={{overflowWrap:"anywhere"}}>{projeto.titulo}</Title><Text c="dimmed" size="sm" lineClamp={2}>{projeto.descricao}</Text></Stack><Button size="xs" variant="subtle" className="funilador-atualizar" loading={atualizando} leftSection={<IconRefresh size={16}/>} onClick={()=>{repetir.current=true;atualizar();atualizarPendencias();}}>Atualizar</Button></Group>
        {(atencao.itens.length > 0 || erroPendencias || atencao.parcial || !pendenciasCarregadas) && <section className="funilador-destaque-pendencias" data-prioridade={atencao.prioridade} aria-label="Pendências deste projeto">
            <Group gap={8} wrap="wrap"><IconeModerno nome="alerta" tamanho={22}/><Text fw={700}>{atencao.prioridade === "red" ? "Atenção imediata neste projeto" : atencao.prioridade === "yellow" ? "Este projeto precisa da sua atenção" : "Pendências deste projeto"}</Text>{atencao.itens.length > 0 && <Badge color={atencao.prioridade}>{atencao.itens.length} {atencao.itens.length === 1 ? "pendência" : "pendências"}{atencao.parcial ? "*" : ""}</Badge>}</Group>
            {erroPendencias ? <Text size="xs" c="dimmed">Não foi possível atualizar as pendências.{pendenciasCarregadas && " Exibindo a última consulta."} <Button size="compact-xs" variant="subtle" onClick={atualizarPendencias}>Tentar novamente</Button></Text> : !pendenciasCarregadas ? <Text size="xs" c="dimmed">Consultando pendências...</Text> : null}
            {atencao.itens.slice(0,mostrarPendencias ? undefined : 3).map((item,i)=>{
                const rota = caminhoPendencia("cliente",item);
                const urgente = item.categoria === "pagamento_atrasado";
                const label = urgente ? "Pagamento atrasado" : item.categoria === "pagamento_pendente" ? "Pagamento necessário" : item.categoria === "validacao_pendente" ? "Entrega para validar" : "Proposta para responder";
                const conteudo = <><span><strong>{label} · {item.titulo}</strong><small>{item.detalhe}{item.data ? ` · ${formatarPrazo(item.data)}` : ""}</small></span><span className="funilador-urgencia-valor"><span>{item.valor != null ? <ValorUrgencia valor={item.valor} repeticao={repeticao}/> : "Consultar"}</span>{rota && <IconArrowUpRight size={18} aria-hidden="true"/>}</span></>;
                const key = `${item.categoria}-${item.marcoId}-${item.conversaId}-${i}`;
                return rota ? <button key={key} type="button" className="funilador-urgencia-item funilador-destaque-pendencia" data-prioridade={urgente ? "red" : "yellow"} onClick={()=>navigate(rota,{state:{voltarPara:"/portal"}})}>{conteudo}</button> : <div key={key} className="funilador-urgencia-item funilador-destaque-pendencia" data-prioridade={urgente ? "red" : "yellow"}>{conteudo}</div>;
            })}
            {atencao.itens.length > 3 && <Button variant="subtle" color={atencao.prioridade} onClick={()=>setMostrarPendencias(v=>!v)} aria-expanded={mostrarPendencias}>{mostrarPendencias ? "Mostrar menos" : `Ver mais ${atencao.itens.length-3} pendências`}</Button>}
            {atencao.parcial && <Text size="xs" c="dimmed">* A consulta geral está limitada a 100 registros por categoria. Pode haver outras pendências; consulte os detalhes do projeto.</Text>}
        </section>}
        <div className="funilador-destaque-progresso"><Group justify="space-between"><Text fw={600}>Progresso do projeto</Text>{!expressivo && <Title order={2}>{progresso == null ? "—" : <NumeroModerno valor={progresso} percentual repeticao={repeticao}/>}</Title>}</Group>{progresso != null ? expressivo ? <div className="ex-destaque-progresso-layout">{mobile?<SloshExpressivo valor={progresso} repeticao={repeticao}/>:<CircularExpressivo valor={progresso} repeticao={repeticao}/>}{resumo && <div className="ex-destaque-trilho"><Text size="sm" fw={600}>{marcos.length-restantes.length} de {marcos.length} marcos concluídos</Text><TrilhoMarcos marcos={resumo.marcos} repeticao={repeticao}/></div>}</div> : <ProgressoModerno valor={progresso} repeticao={repeticao}/> : <Text size="xs" c="dimmed">Progresso ainda não definido.</Text>}<Group gap={6}><IconCalendar size={16}/><Text size="sm" c="dimmed">Prazo: {formatarPrazo(resumo ? resumo.prazoAcordado : projeto.prazoAcordado)}</Text></Group></div>
        {erro && <Alert color="yellow">Não foi possível atualizar os marcos.{resumo && " Exibindo última consulta."}</Alert>}
        <SimpleGrid cols={{base:3,sm:3}}><div className="funilador-destaque-metrica"><IconChecks size={21}/><Text c="dimmed" size="xs">Marcos concluídos</Text><Title order={3}><NumeroModerno valor={resumo ? marcos.length-restantes.length : null} repeticao={repeticao}/></Title></div><div className="funilador-destaque-metrica"><Text c="dimmed" size="xs">Em produção</Text><Title order={3}><NumeroModerno valor={resumo ? emProducao.length : null} repeticao={repeticao}/></Title></div><div className="funilador-destaque-metrica"><Text c="dimmed" size="xs">Marcos restantes</Text><Title order={3}><NumeroModerno valor={resumo ? restantes.length : null} repeticao={repeticao}/></Title></div></SimpleGrid>
        {resumo && mobile && <Button variant="filled" color={atencao.prioridade === "red" ? "red" : atencao.prioridade === "yellow" ? "yellow" : undefined} fullWidth className="funilador-marcos-cta" leftSection={<IconChecks size={16}/>} onClick={()=>setDetalheRapido(true)}>Ver marcos restantes ({restantes.length})</Button>}
        {resumo && !mobile && <Stack gap={6}><Text fw={600} size="sm">O que falta</Text>{prioridade.length ? prioridade.slice(0,4).map(m=><button type="button" key={m.id} className="funilador-destaque-marco" onClick={()=>navigate(`/portal/projetos?projeto=${encodeURIComponent(projeto.id)}&marco=${encodeURIComponent(m.id)}`)}><span>{m.titulo}<small>{rotulosMarco[m.status]??m.status}{m.prazoEntrega ? ` · ${formatarPrazo(m.prazoEntrega)}` : ""}</small></span><IconArrowUpRight size={17}/></button>) : <Text c="dimmed" size="sm">{marcos.length ? "Todos os marcos ativos concluídos." : "Nenhum marco cadastrado."}</Text>}{prioridade.length>4 && <Text c="dimmed" size="xs">Mais {prioridade.length-4} marcos nos detalhes do projeto.</Text>}</Stack>}
        {mobile && <SheetMobile aberto={detalheRapido} fechar={()=>setDetalheRapido(false)} titulo="Marcos do projeto" descricao={projeto.titulo}><Stack gap="sm">{prioridade.length ? prioridade.map(m=><button key={m.id} type="button" className="funilador-destaque-marco" onClick={()=>{setDetalheRapido(false);navigate(`/portal/projetos?projeto=${encodeURIComponent(projeto.id)}&marco=${encodeURIComponent(m.id)}`);}}><span>{m.titulo}<small>{rotulosMarco[m.status]??m.status}{m.prazoEntrega ? ` · ${formatarPrazo(m.prazoEntrega)}` : ""}</small></span><IconArrowUpRight size={17}/></button>) : <Text c="dimmed">Nenhum marco restante.</Text>}</Stack></SheetMobile>}
        {mobile ? <Stack gap="xs" className="funilador-destaque-acoes"><Button fullWidth onClick={()=>navigate(`/portal/projetos?projeto=${encodeURIComponent(projeto.id)}`)} rightSection={<IconArrowUpRight size={17}/>}>Abrir projeto</Button><Button fullWidth variant="light" disabled={!conversas && !erroConversas} leftSection={<IconMessageCircle size={17}/>} onClick={()=>abrir(conversa?.id??geral?.id)}>{conversa ? "Conversa do projeto" : geral ? "Conversa geral" : "Abrir mensagens"}</Button>{conversa && geral && <Button fullWidth variant="default" onClick={()=>abrir(geral.id)}>Conversa geral</Button>}</Stack> : <Group wrap="wrap"><Button onClick={()=>navigate(`/portal/projetos?projeto=${encodeURIComponent(projeto.id)}`)} rightSection={<IconArrowUpRight size={17}/>}>Abrir projeto</Button><Button variant="light" disabled={!conversas && !erroConversas} leftSection={<IconMessageCircle size={17}/>} onClick={()=>abrir(conversa?.id??geral?.id)}>{conversa ? "Conversa do projeto" : geral ? "Conversa geral" : "Abrir mensagens"}</Button>{conversa && geral && <Button variant="subtle" onClick={()=>abrir(geral.id)}>Conversa geral</Button>}</Group>}{erroConversas && <Text size="xs" c="dimmed">Conversas indisponíveis nesta consulta; o atalho abre a lista de mensagens.</Text>}
    </Stack>;
}
