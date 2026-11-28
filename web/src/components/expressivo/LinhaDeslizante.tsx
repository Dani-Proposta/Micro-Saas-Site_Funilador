import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Group } from "@mantine/core";
import { motion } from "motion/react";
import { useExpressivoMobile, useMovimentoReduzido } from "../../lib/contextoAparencia";

// Um gesto revela ações explícitas, nunca executa ocultação/arquivamento sozinho.
export function LinhaDeslizante({children,abrir,acao,rotulo,disabled=false}:{children:ReactNode;abrir:()=>void;acao?:()=>void;rotulo?:string;disabled?:boolean}) {
    const mobile=useExpressivoMobile();const reduzir=useMovimentoReduzido();
    const [revelado,setRevelado]=useState(false);
    const inicio=useRef<{x:number;y:number}|null>(null);
    const suprimir=useRef(false);
    if(!mobile)return <>{children}</>;
    return <div className="ex-swipe-row" onTouchStart={e=>{if(e.touches.length!==1){inicio.current=null;return;}suprimir.current=false;inicio.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchCancel={()=>{inicio.current=null;suprimir.current=false;}} onTouchEnd={e=>{const p=inicio.current;inicio.current=null;if(!p||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-p.x,dy=e.changedTouches[0].clientY-p.y;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5){suprimir.current=true;setRevelado(dx<0);}}} onClickCapture={e=>{if(suprimir.current&&e.detail>0){e.preventDefault();e.stopPropagation();suprimir.current=false;}}}>
        {children}
        <button className="ex-swipe-expander" type="button" aria-expanded={revelado} aria-label={revelado?"Fechar ações rápidas":"Mostrar ações rápidas"} onClick={()=>setRevelado(v=>!v)}>{revelado?"−":"⋯"}</button>
        {revelado&&<motion.div className="ex-swipe-actions" initial={reduzir?false:{opacity:0,x:14}} animate={{opacity:1,x:0}} transition={{duration:reduzir?0:.22}}><Group gap="xs"><Button size="xs" variant="light" disabled={disabled} onClick={()=>{setRevelado(false);abrir();}}>Abrir ↗</Button>{acao&&rotulo&&<Button size="xs" variant="default" disabled={disabled} onClick={()=>{setRevelado(false);acao();}}>{rotulo}</Button>}</Group></motion.div>}
    </div>;
}
