import { PreferenciasExpressivas } from "./expressivo/PreferenciasExpressivas";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Button, DEFAULT_THEME, Group, Radio, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { aparenciaPadrao, coresAparencia, paletasAparencia, obterEscalasPaleta, escalasClaras } from "../lib/aparencia";
import type { Aparencia } from "../lib/aparencia";

const estilos = [{id:"minimalista",nome:"Minimalista",descricao:"Contornos simples e pouca ornamentação"},{id:"moderno",nome:"Moderno",descricao:"Equilíbrio entre superfícies e destaque"},{id:"expressivo",nome:"Expressivo",descricao:"Mais cor, relevo e identidade visual"}] as const;
const densidades = [{id:"compacta",nome:"Compacta"},{id:"normal",nome:"Normal"},{id:"confortavel",nome:"Confortável"}] as const;

function MarcaSelecao() {return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;}

export function EditorAparencia({inicial, salvando, salvar}: {inicial:Aparencia; salvando:boolean; salvar:(valor:Aparencia)=>void}) {
    const [rascunho,setRascunho] = useState(inicial);
    const escuroSistema = useMediaQuery("(prefers-color-scheme: dark)", true, {getInitialValueInEffect:false});
    const escuro = rascunho.tema === "dark" || (rascunho.tema === "auto" && escuroSistema);
    const cor = coresAparencia.find(c => c.id === rascunho.acento)!;
    const paleta = obterEscalasPaleta(rascunho.paleta) ?? DEFAULT_THEME.colors;
    const clara = escalasClaras[rascunho.paleta];
    const fundo = escuro ? paleta.dark[7] : clara[2];
    const superficie = escuro ? paleta.dark[6] : clara[0];
    const texto = escuro ? paleta.dark[0] : clara[9];
    const contorno = escuro ? paleta.dark[4] : clara[4];
    const alterado = Object.keys(inicial).some(c => inicial[c as keyof Aparencia] !== rascunho[c as keyof Aparencia]);
    function alterar<K extends keyof Aparencia>(chave:K, valor:Aparencia[K]) {setRascunho(a => ({...a,[chave]:valor}));}
    return <Stack gap="md" className="funilador-editor-aparencia">
        <Radio.Group className="funilador-preferencia-secao" label="Tema" value={rascunho.tema} onChange={v => {if(v === "light" || v === "dark" || v === "auto") alterar("tema",v);}}>
            <Group gap="sm" mt={6} className="funilador-preferencia-opcoes"><Radio value="light" label="Claro" disabled={salvando}/><Radio value="dark" label="Escuro" disabled={salvando}/><Radio value="auto" label="Sistema" disabled={salvando}/></Group>
        </Radio.Group>
        <div className="funilador-preferencia-secao"><Text size="sm" fw={500}>Paleta de superfícies</Text>
            <div className="funilador-paletas" role="group" aria-label="Paleta de superfícies">
                {paletasAparencia.map(p=>{const escala=obterEscalasPaleta(p.id) ?? DEFAULT_THEME.colors; const luz=escalasClaras[p.id]; return <UnstyledButton key={p.id} type="button" className="funilador-paleta" aria-label={`${p.nome} — ${p.descricao}`} title={p.descricao} aria-pressed={p.id===rascunho.paleta} disabled={salvando} onClick={()=>alterar("paleta",p.id)}>
                    <span className="funilador-paleta-amostra" style={{background:escuro?escala.dark[7]:luz[2],color:escuro?escala.dark[0]:luz[9],borderColor:escuro?escala.dark[4]:luz[4]}}><span style={{background:escuro?escala.dark[5]:luz[0]}}/><span style={{background:escuro?escala.dark[3]:luz[3]}}/>{p.id===rascunho.paleta && <MarcaSelecao/>}</span>
                    <Text component="span" size="xs" fw={p.id===rascunho.paleta?700:400}>{p.nome}</Text>
                </UnstyledButton>;})}
            </div><Text size="xs" c="dimmed" mt={4}>Paletas claras foscas e escuras independentes, sem alterar a cor de destaque.</Text>
        </div>
        <Radio.Group className="funilador-preferencia-secao" label="Estilo da interface" value={rascunho.estilo} onChange={v => {const e=estilos.find(x=>x.id===v); if(e) alterar("estilo",e.id);}}>
            <Stack gap={6} mt={6}>{estilos.map(e => <Radio key={e.id} value={e.id} className="funilador-estilo-opcao" label={<span className="funilador-estilo-rotulo">{e.nome}<span className="funilador-estilo-amostra" data-estilo={e.id} aria-hidden="true"><i/><i/><i/><i/></span></span>} description={e.descricao} disabled={salvando}/>)}</Stack>
        </Radio.Group>
        <div className="funilador-preferencia-secao"><Text size="sm" fw={500}>Cor de destaque · {cor.nome}</Text>
            <Group gap={8} mt={6} role="group" aria-label="Cor de destaque">
                {coresAparencia.map(c => <UnstyledButton key={c.id} type="button" className="funilador-amostra-cor" title={c.nome} aria-label={c.nome} aria-pressed={c.id===rascunho.acento} disabled={salvando} onClick={()=>alterar("acento",c.id)} style={{background:c.cor}}>{c.id===rascunho.acento && <MarcaSelecao/>}</UnstyledButton>)}
            </Group>
            <Text size="xs" c="dimmed" mt={4}>As cores de alertas e estados financeiros são preservadas.</Text>
        </div>
        <Radio.Group className="funilador-preferencia-secao" label="Densidade" value={rascunho.densidade} onChange={v=>{const d=densidades.find(x=>x.id===v);if(d) alterar("densidade",d.id);}}>
            <Group gap="sm" mt={6} className="funilador-preferencia-opcoes">{densidades.map(d=><Radio key={d.id} value={d.id} label={d.nome} disabled={salvando}/>)}</Group>
        </Radio.Group>
        <Radio.Group className="funilador-preferencia-secao" label="Movimento" description="A preferência de movimento reduzido do dispositivo sempre será respeitada." value={rascunho.movimento} onChange={v=>{if(v==="sistema" || v==="reduzido") alterar("movimento",v);}}>
            <Stack gap={6} mt={6}><Radio value="sistema" label="Seguir sistema" disabled={salvando}/><Radio value="reduzido" label="Reduzir animações" disabled={salvando}/></Stack>
        </Radio.Group>
        <div className="funilador-preferencia-secao funilador-preferencia-previa">
            <Group justify="space-between" align="center" gap={6} mb={6}><Text size="sm" fw={500}>Prévia</Text><Text size="xs" c="dimmed" className="funilador-previa-identidade">{estilos.find(e=>e.id===rascunho.estilo)?.nome} · {escuro ? "Escuro" : "Claro"}</Text></Group>
            <div className="funilador-previa" data-estilo={rascunho.estilo} data-densidade={rascunho.densidade} style={{background:fundo,color:texto,borderColor:contorno, "--previa-acento":cor.cor} as CSSProperties}>
                <div className="funilador-previa-topo"><Text fw={700} size="sm">Visão geral</Text><span className="funilador-previa-tag" aria-hidden="true">Painel</span></div>
                <div className="funilador-previa-grade">{[{nome:"Projetos ativos",valor:4},{nome:"Solicitações",valor:2}].map(d=><div key={d.nome} className="funilador-previa-card" style={{background:superficie}}><Text size="xs">{d.nome}</Text><Text fw={700} size="xl">{d.valor}</Text></div>)}</div>
                <div className="funilador-previa-registro" style={{background:superficie}}><span className="funilador-previa-ponto" aria-hidden="true"/><span>Projeto de exemplo</span><span className="funilador-previa-situacao">Em andamento</span></div>
                <div className="funilador-previa-botao">Novo projeto</div>
            </div><Text size="xs" c="dimmed" mt={4}>Dados ilustrativos. A aplicação inteira muda ao salvar.</Text>
        </div>
        {rascunho.estilo === "expressivo" && <PreferenciasExpressivas/>}
        <div className="funilador-preferencia-rodape">
            <Text size="xs" c="dimmed" role="status" className="funilador-preferencia-status">{alterado ? "Alterações ainda não salvas" : "Nenhuma alteração pendente"}</Text>
            <div className="funilador-preferencia-acoes">
                <Button loading={salvando} disabled={!alterado} onClick={()=>salvar(rascunho)}>Salvar preferências</Button>
                <Button variant="default" disabled={salvando} onClick={()=>setRascunho({...aparenciaPadrao})}>Restaurar padrão</Button>
                <Button variant="subtle" color="gray" disabled={salvando || !alterado} className="funilador-preferencia-descartar" onClick={()=>setRascunho({...inicial})}>Descartar alterações</Button>
            </div>
        </div>
    </Stack>;
}
