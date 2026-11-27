import { useState } from "react";
import type { CSSProperties } from "react";
import { Button, Group, Radio, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { aparenciaPadrao, coresAparencia } from "../lib/aparencia";
import type { Aparencia } from "../lib/aparencia";

const estilos = [{id:"minimalista",nome:"Minimalista",descricao:"Contornos simples e pouca ornamentação"},{id:"moderno",nome:"Moderno",descricao:"Equilíbrio entre superfícies e destaque"},{id:"expressivo",nome:"Expressivo",descricao:"Mais cor, relevo e identidade visual"}] as const;
const densidades = [{id:"compacta",nome:"Compacta"},{id:"normal",nome:"Normal"},{id:"confortavel",nome:"Confortável"}] as const;

export function EditorAparencia({inicial, salvando, salvar}: {inicial:Aparencia; salvando:boolean; salvar:(valor:Aparencia)=>void}) {
    const [rascunho,setRascunho] = useState(inicial);
    const escuroSistema = useMediaQuery("(prefers-color-scheme: dark)", true, {getInitialValueInEffect:false});
    const escuro = rascunho.tema === "dark" || (rascunho.tema === "auto" && escuroSistema);
    const cor = coresAparencia.find(c => c.id === rascunho.acento)!;
    const alterado = Object.keys(inicial).some(c => inicial[c as keyof Aparencia] !== rascunho[c as keyof Aparencia]);
    function alterar<K extends keyof Aparencia>(chave:K, valor:Aparencia[K]) {setRascunho(a => ({...a,[chave]:valor}));}
    return <Stack gap="md">
        <Radio.Group label="Tema" value={rascunho.tema} onChange={v => {if(v === "light" || v === "dark" || v === "auto") alterar("tema",v);}}>
            <Group gap="sm" mt={6}><Radio value="light" label="Claro" disabled={salvando}/><Radio value="dark" label="Escuro" disabled={salvando}/><Radio value="auto" label="Sistema" disabled={salvando}/></Group>
        </Radio.Group>
        <Radio.Group label="Estilo da interface" value={rascunho.estilo} onChange={v => {const e=estilos.find(x=>x.id===v); if(e) alterar("estilo",e.id);}}>
            <Stack gap={6} mt={6}>{estilos.map(e => <Radio key={e.id} value={e.id} label={e.nome} description={e.descricao} disabled={salvando}/>)}</Stack>
        </Radio.Group>
        <div><Text size="sm" fw={500}>Cor de destaque · {cor.nome}</Text>
            <Group gap={8} mt={6} role="group" aria-label="Cor de destaque">
                {coresAparencia.map(c => <UnstyledButton key={c.id} type="button" className="funilador-amostra-cor" title={c.nome} aria-label={c.nome} aria-pressed={c.id===rascunho.acento} disabled={salvando} onClick={()=>alterar("acento",c.id)} style={{background:c.cor}}>{c.id===rascunho.acento ? "✓" : ""}</UnstyledButton>)}
            </Group>
            <Text size="xs" c="dimmed" mt={4}>As cores de alertas e estados financeiros são preservadas.</Text>
        </div>
        <Radio.Group label="Densidade" value={rascunho.densidade} onChange={v=>{const d=densidades.find(x=>x.id===v);if(d) alterar("densidade",d.id);}}>
            <Group gap="sm" mt={6}>{densidades.map(d=><Radio key={d.id} value={d.id} label={d.nome} disabled={salvando}/>)}</Group>
        </Radio.Group>
        <Radio.Group label="Movimento" description="A preferência de movimento reduzido do dispositivo sempre será respeitada." value={rascunho.movimento} onChange={v=>{if(v==="sistema" || v==="reduzido") alterar("movimento",v);}}>
            <Stack gap={6} mt={6}><Radio value="sistema" label="Seguir sistema" disabled={salvando}/><Radio value="reduzido" label="Reduzir animações" disabled={salvando}/></Stack>
        </Radio.Group>
        <div><Text size="sm" fw={500} mb={6}>Prévia</Text>
            <div className="funilador-previa" data-estilo={rascunho.estilo} data-densidade={rascunho.densidade} style={{background:escuro?"#202024":"#f3f4f6",color:escuro?"#f3f3f5":"#202024",borderColor:escuro?"#48484f":"#d5d5db", "--previa-acento":cor.cor} as CSSProperties}>
                <Text fw={700} size="sm">Visão geral</Text>
                <div className="funilador-previa-grade">{[{nome:"Projetos ativos",valor:4},{nome:"Solicitações",valor:2}].map(d=><div key={d.nome} className="funilador-previa-card" style={{background:escuro?"#29292e":"#ffffff"}}><Text size="xs">{d.nome}</Text><Text fw={700} size="xl">{d.valor}</Text></div>)}</div>
                <div className="funilador-previa-botao">Novo projeto</div>
            </div><Text size="xs" c="dimmed" mt={4}>Dados ilustrativos. A aplicação inteira muda ao salvar.</Text>
        </div>
        <Button loading={salvando} disabled={!alterado} onClick={()=>salvar(rascunho)}>Salvar preferências</Button>
        <Button variant="default" disabled={salvando} onClick={()=>setRascunho({...aparenciaPadrao})}>Restaurar padrão</Button>
    </Stack>;
}
