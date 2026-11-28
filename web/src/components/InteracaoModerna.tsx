import { useModerno, useAnimacaoConteudo } from "../hooks/useInteracaoModerna";
import { useEffect, useState, type ReactNode } from "react";
import { Card, Text, Progress } from "@mantine/core";
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useMovimentoReduzido } from "../lib/contextoAparencia";
import { formatarValor } from "../lib/comercial";

// A animação é somente visual; o valor acessível permanece o valor confirmado pela API.
function NumeroRolante({valor, moeda, percentual}: {valor:number; moeda:boolean; percentual:boolean}) {
    const [pronto,setPronto] = useState(false);
    useEffect(() => {
        let segundo = 0;
        const primeiro = requestAnimationFrame(() => {segundo = requestAnimationFrame(() => setPronto(true));});
        return () => {cancelAnimationFrame(primeiro);cancelAnimationFrame(segundo);};
    }, []);
    return <span aria-hidden="true"><NumberFlow value={pronto ? valor : 0} locales="pt-BR" format={moeda ? {style:"currency",currency:"BRL"} : {maximumFractionDigits:percentual ? 1 : 0}}/>{percentual && "%"}</span>;
}
export function NumeroModerno({valor, moeda=false, percentual=false, repeticao=0}: {valor:number|string|null|undefined; moeda?:boolean; percentual?:boolean; repeticao?:number}) {
    const moderno = useModerno();
    const reduzir = useMovimentoReduzido();
    const n = Number(valor);
    const texto = valor == null ? (moeda ? "Não definido" : "—") : moeda ? formatarValor(String(valor)) : percentual ? `${n.toLocaleString("pt-BR",{maximumFractionDigits:1})}%` : String(valor);
    if (!moderno || reduzir || valor == null || !Number.isFinite(n)) return <>{texto}</>;
    return <span className="funilador-numero-rolante"><span className="funilador-valor-acessivel">{texto}</span><NumeroRolante key={`${repeticao}-${n}`} valor={n} moeda={moeda} percentual={percentual}/></span>;
}

// Sem key na árvore de páginas: alterar filtro não descarta foco, formulários ou rascunhos.
export function TransicaoConteudo({identidade,children,className}: {identidade:string|number;children:ReactNode;className?:string}) {
    const scope = useAnimacaoConteudo(identidade);
    return <div ref={scope} className={className ?? "funilador-transicao-conteudo"}>{children}</div>;
}

export function CartaoValor({titulo,valor,icone,cor,descricao,acao,rotulo="Consultar",className="",categoria,repeticao=0,comparacao}: {titulo:string;valor:string;icone?:ReactNode;cor?:string;descricao?:string;acao?:()=>void;rotulo?:string;className?:string;categoria?:string;repeticao?:number;comparacao?:ReactNode}) {
    const conteudo = <><span className="funilador-valor-topo">{icone}<span>{titulo}</span>{acao && <span className="funilador-valor-seta"><IconArrowUpRight size={16} aria-hidden="true"/></span>}</span><Text component="span" fw={700} c={cor} className="funilador-valor-numero"><NumeroModerno valor={valor} moeda repeticao={repeticao}/></Text>{comparacao}{descricao && <span className="funilador-valor-descricao">{descricao}</span>}{acao && <span className="funilador-valor-acao">{rotulo} <IconArrowUpRight size={14} aria-hidden="true"/></span>}</>;
    const classe = `${className} funilador-cartao-valor`;
    return acao ? <Card component="button" type="button" withBorder className={`${classe} funilador-cartao-clicavel`} data-categoria={categoria} onClick={acao} aria-label={`${titulo}: ${formatarValor(valor)}. ${rotulo}`} title={descricao}>{conteudo}</Card> : <Card withBorder className={classe} data-categoria={categoria}>{conteudo}</Card>;
}

export function ProgressoModerno({valor,repeticao=0,cor,rotulo="Progresso do projeto"}: {valor:number; repeticao?:number; cor?:string; rotulo?:string}) {
    const moderno = useModerno();
    const reduzir = useMovimentoReduzido();
    const n = Math.max(0,Math.min(100,valor));
    if (!moderno) return <Progress value={n} aria-label={rotulo} size={cor ? undefined : "sm"} color={cor}/>;
    return <div className="funilador-progresso-vivo" role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={n}><motion.div key={repeticao} initial={reduzir ? false : {width:0}} animate={{width:`${n}%`}} transition={{duration:reduzir?0:.85,ease:[.22,1,.36,1]}}/></div>;
}

export function ComparativoMensal({atual,anterior}: {atual:string; anterior:string|null|undefined}) {
    const base = Number(anterior ?? 0), valor = Number(atual);
    const comparavel = anterior != null && Number.isFinite(base) && base > 0 && Number.isFinite(valor);
    const delta = comparavel ? (valor-base)/base*100 : 0;
    const sentido = Math.abs(delta)<.05 ? "neutro" : delta>0 ? "positivo" : "negativo";
    return <span className="funilador-comparativo" data-sentido={sentido} title={comparavel ? `Mês anterior completo: ${formatarValor(String(base))}` : "Sem base positiva no mês anterior; 0% é apenas uma indicação neutra."}>{sentido==="positivo"?"↑ +":sentido==="negativo"?"↓ ":""}{comparavel ? delta.toLocaleString("pt-BR",{maximumFractionDigits:1}) : "0"}% <span>{comparavel ? "vs. mês anterior" : "sem base anterior"}</span></span>;
}

// O valor em uma linha de urgência não pode ser cortado por um contador de largura intrínseca.
export function ValorUrgencia({valor,repeticao=0}: {valor:string; repeticao?:number}) {
    const texto = formatarValor(valor);
    return texto.length > 19 ? <>{texto}</> : <NumeroModerno valor={valor} moeda repeticao={repeticao}/>;
}
