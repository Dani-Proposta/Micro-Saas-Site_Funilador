import { useEffect, useRef, useState } from "react";
import { Button, Group } from "@mantine/core";
import { useExpressivo, useMovimentoReduzido } from "../../lib/contextoAparencia";

// Feedback puramente visual: não dispara ações e nunca captura eventos.
export function EfeitosExpressivos() {
    const ativo=useExpressivo();const reduzir=useMovimentoReduzido();
    useEffect(()=>{
        if(!ativo||reduzir)return;
        const existentes=new Map<HTMLElement,number>();
        let anterior:HTMLElement|null=null;
        const mover=(e:PointerEvent)=>{if(e.pointerType!=="mouse"&&e.pointerType!=="pen")return;const alvo=e.target instanceof Element?e.target.closest<HTMLElement>(".ex-trajetoria-item,.ex-indicador,.ex-cliente-filtro,.funilador-cartao-moderno,.funilador-cartao-valor,.funilador-convite-registro,.ex-profile,.ex-cliente-card,.funilador-cabecalho-moderno,.funilador-projeto-hero,.ex-chart,.ex-marco"):null;if(anterior&&anterior!==alvo){anterior.style.removeProperty("--ex-x");anterior.style.removeProperty("--ex-y");}anterior=alvo;if(!alvo)return;const r=alvo.getBoundingClientRect();if(!r.width||!r.height)return;alvo.style.setProperty("--ex-x",`${(e.clientX-r.left)/r.width*100}%`);alvo.style.setProperty("--ex-y",`${(e.clientY-r.top)/r.height*100}%`);};
        const clicar=(e:MouseEvent)=>{if(e.detail===0||!(e.target instanceof Element))return;const alvo=e.target.closest<HTMLElement>(".mantine-Button-root,.ex-trajetoria-item,.ex-cliente-filtro,.ex-indicador,.funilador-cartao-clicavel,.ex-dock-link,.ex-bubble-trigger,.ex-bubble-grid a,.ex-stagger-list a");if(!alvo||alvo.matches(":disabled,[data-disabled],[data-loading],[aria-disabled=true]"))return;const camada=document.createElement("span");camada.className="ex-spark";camada.setAttribute("aria-hidden","true");camada.style.left=`${e.clientX}px`;camada.style.top=`${e.clientY}px`;for(let i=0;i<8;i++){const p=document.createElement("i");p.style.setProperty("--ex-ang",`${i*45}deg`);camada.append(p);}document.body.append(camada);existentes.set(camada,window.setTimeout(()=>{camada.remove();existentes.delete(camada);},540));};
        window.addEventListener("pointermove",mover,{passive:true});window.addEventListener("click",clicar,{passive:true});return()=>{window.removeEventListener("pointermove",mover);window.removeEventListener("click",clicar);for(const [el,id] of existentes){clearTimeout(id);el.remove();}if(anterior){anterior.style.removeProperty("--ex-x");anterior.style.removeProperty("--ex-y");}};
    },[ativo,reduzir]);return null;
}

// Mantém confirmação convencional disponível inclusive com teclado ou movimento reduzido.
export function ConfirmacaoExpressiva({children,confirmar,loading=false}:{children:string;confirmar:()=>void;loading?:boolean}) {
    const expressivo=useExpressivo();const reduzir=useMovimentoReduzido();const [pressionado,setPressionado]=useState(false);const timer=useRef<number|null>(null);
    function cancelar(){if(timer.current!==null)clearTimeout(timer.current);timer.current=null;setPressionado(false);}
    useEffect(()=>{const cancelarAoSair=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;setPressionado(false);}};window.addEventListener("blur",cancelarAoSair);return()=>{window.removeEventListener("blur",cancelarAoSair);if(timer.current!==null)clearTimeout(timer.current);timer.current=null;};},[]);
    if(!expressivo||reduzir)return <Button color="red" loading={loading} onClick={confirmar}>{children}</Button>;
    return <Group gap="xs" wrap="wrap"><Button type="button" color="red" variant="light" loading={loading} onClick={()=>{cancelar();confirmar();}}>{children}</Button><Button type="button" color="red" loading={loading} className="ex-hold" data-pressionado={pressionado} onPointerDown={e=>{if(!e.isPrimary||e.button!==0||loading||timer.current!==null)return;cancelar();setPressionado(true);timer.current=window.setTimeout(()=>{timer.current=null;setPressionado(false);confirmar();},850);}} onPointerUp={cancelar} onPointerLeave={cancelar} onPointerCancel={cancelar} onBlur={cancelar} onClick={e=>{if(e.detail===0&&!loading){cancelar();confirmar();}}}>Segure para confirmar</Button></Group>;
}
