import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { useInViewport } from "@mantine/hooks";
import { IconCheck, IconClock, IconPlayerPlay, IconHourglass } from "@tabler/icons-react";
import { useMovimentoReduzido } from "../../lib/contextoAparencia";
import { NumeroModerno, ProgressoModerno } from "../InteracaoModerna";
import type { ResumoMarcos } from "../MarcosProjeto";

type Marco = ResumoMarcos["marcos"][number];
const estados:Record<string,string> = {pendente:"Pendente",em_andamento:"Em andamento",aguardando_validacao:"Aguardando validação",concluido:"Concluído"};

// Cada ponto representa um marco real; não se presume que os primeiros N estejam concluídos.
export function TrilhoMarcos({marcos, repeticao=0}: {marcos:Marco[]; repeticao?:number}) {
    const reduzir=useMovimentoReduzido();
    const ativos=marcos.filter(m=>m.status!=="cancelado");
    if(!ativos.length)return <span className="ex-trilho-vazio">Nenhum marco ativo.</span>;
    return <div className="ex-trilho-scroll"><ol className="ex-trilho-marcos" aria-label="Etapas do projeto" style={{gridTemplateColumns:`repeat(${ativos.length}, minmax(64px,1fr))`}}>{ativos.map((m,i)=>{
        const Icone=m.status==="concluido"?IconCheck:m.status==="em_andamento"?IconPlayerPlay:m.status==="aguardando_validacao"?IconHourglass:IconClock;
        return <li key={m.id} data-estado={m.status} title={`${m.titulo} · ${estados[m.status]??m.status}`}><motion.span key={repeticao} className="ex-trilho-ponto" initial={reduzir?false:{scale:.55,opacity:.35}} animate={{scale:1,opacity:1}} transition={{duration:reduzir?0:.42,delay:reduzir?0:Math.min(i*.075,.6),type:"tween"}}><Icone size={19}/></motion.span><span className="ex-trilho-nome">{m.titulo}</span><small>{estados[m.status]??m.status}</small></li>;
    })}</ol></div>;
}
export function ProgressoCartaoExpressivo({valor,carregando=false,erro=false}: {valor:number|null|undefined;carregando?:boolean;erro?:boolean}) {
    const valido=typeof valor==="number"&&Number.isFinite(valor);
    const completo=valido&&valor>=100;
    return <div className="ex-card-progresso" data-completo={completo}><div className="ex-card-progresso-topo"><span>{completo?<><IconCheck size={17}/> Progresso completo</>:"Progresso do projeto"}</span><strong>{valido?<NumeroModerno valor={valor} percentual/>:carregando?"Consultando…":erro?"Indisponível":"Não definido"}</strong></div>{valido&&<ProgressoModerno valor={valor}/>}</div>;
}
// A listagem administrativa antiga não devolve progresso. Consulta apenas cards que chegaram à viewport.
export function ProgressoCartaoAdmin({id,atualizadaEm}: {id:string;atualizadaEm:string}) {
    const {ref,inViewport}=useInViewport<HTMLDivElement>();
    const [resultado,setResultado]=useState<{chave:string;valor:number|null;erro:boolean}|null>(null);
    const chave=`${id}:${atualizadaEm}`;
    useEffect(()=>{
        if(!inViewport||resultado?.chave===chave)return;
        const controller=new AbortController();
        void fetch(`/api/projetos/${encodeURIComponent(id)}/marcos`,{signal:controller.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error();const dados=await r.json() as ResumoMarcos;if(!controller.signal.aborted)setResultado({chave,valor:dados.progresso!=null&&Number.isFinite(Number(dados.progresso))?Number(dados.progresso):null,erro:false});}).catch(()=>{if(!controller.signal.aborted)setResultado({chave,valor:null,erro:true});});
        return ()=>controller.abort();
    },[id,chave,inViewport,resultado?.chave]);
    const atual=resultado?.chave===chave?resultado:null;
    return <div ref={ref}><ProgressoCartaoExpressivo valor={atual?.valor} carregando={!atual} erro={atual?.erro}/></div>;
}

// SVG animado: a geometria e o valor permanecem sincronizados com a API.
export function CircularExpressivo({valor,repeticao=0}: {valor:number;repeticao?:number}) {
    const reduzir=useMovimentoReduzido();
    const percentual=Math.max(0,Math.min(100,valor));
    return <div className="ex-progresso-circular" role="progressbar" aria-label="Progresso do projeto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentual}>
        <svg viewBox="0 0 172 172" aria-hidden="true"><circle cx="86" cy="86" r="68" fill="none" stroke="var(--mantine-color-default-border)" strokeWidth="17"/>{percentual>0&&<motion.circle key={repeticao} cx="86" cy="86" r="68" fill="none" stroke="var(--mantine-primary-color-filled)" strokeWidth="17" strokeLinecap={percentual===100?"butt":"round"} transform="rotate(-90 86 86)" initial={reduzir?false:{pathLength:0,opacity:0}} animate={{pathLength:percentual/100,opacity:1}} transition={{duration:reduzir?0:1.25,ease:[.22,1,.36,1]}}/>}</svg>
        <span className="ex-progresso-circular-rotulo" aria-hidden="true"><NumeroModerno valor={percentual} percentual repeticao={repeticao}/></span>
    </div>;
}

export function SloshExpressivo({valor,repeticao=0}:{valor:number;repeticao?:number}) {
    const reduzir=useMovimentoReduzido();const id=useId();const v=Math.min(100,Math.max(0,valor));
    return <div className="ex-slosh" role="progressbar" aria-label="Progresso do projeto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><svg viewBox="0 0 220 178" aria-hidden="true"><defs><clipPath id={id}><rect x="12" y="8" width="196" height="162" rx="35"/></clipPath><linearGradient id={`${id}-agua`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--ex-c)"/><stop offset="1" stopColor="var(--ex-a)"/></linearGradient></defs><rect x="12" y="8" width="196" height="162" rx="35" fill="var(--md-inset)" stroke="var(--ex-edge)" strokeWidth="2"/><g clipPath={`url(#${id})`}><motion.g key={repeticao} initial={reduzir?false:{y:162}} animate={{y:162*(1-v/100)}} transition={{duration:reduzir?0:1.15,ease:[.22,1,.36,1]}}>{v>0&&<><rect x="12" y="8" width="196" height="162" fill={`url(#${id}-agua)`} opacity=".74"/><motion.path d="M-80 8 Q-25 -7 30 8 T140 8 T250 8 T360 8 V170 H-80 Z" fill={`url(#${id}-agua)`} opacity=".75" animate={reduzir?{x:0}:{x:[0,-110,0]}} transition={reduzir?{duration:0}:{duration:3.5,repeat:Infinity,ease:"easeInOut"}}/></>}</motion.g></g>{[0,1,2,3,4].map(i=><line key={i} x1="184" x2="195" y1={22+i*33} y2={22+i*33} stroke="var(--mantine-color-text)" opacity=".4"/>)}<text x="110" y="83" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--mantine-color-text)" stroke="var(--mantine-color-body)" strokeWidth="3" paintOrder="stroke">{Math.round(v)}%</text><text x="110" y="108" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--mantine-color-text)">CONCLUÍDO</text></svg></div>;
}
