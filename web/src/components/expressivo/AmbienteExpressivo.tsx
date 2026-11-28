import { useExpressivo, useExpressivoMobile, useMovimentoReduzido } from "../../lib/contextoAparencia";
import { usePreferenciasExpressivo } from "../../lib/expressivo";
import { motion } from "motion/react";
export function AmbienteExpressivo() {
    const ativo = useExpressivo();
    const mobile = useExpressivoMobile();
    const reduzir = useMovimentoReduzido();
    const {valor} = usePreferenciasExpressivo();
    if(!ativo)return null;
    const fundo = mobile ? "aurora" : valor.fundoDesktop;
    const movimento = fundo === "prisma" ? {rotate:[0,24,-12,0],scale:[1,1.08,1.03,1]} : fundo === "aurora" ? {x:[0,100,-60,0],y:[0,-40,65,0],rotate:[0,-5,6,0]} : {x:[0,90,-75,0],y:[0,-65,45,0],rotate:[0,12,-8,0],scale:[1,1.18,1.06,1]};
    return <div className="ex-ambiente" data-fundo={fundo} aria-hidden="true"><motion.div key={fundo} className="ex-ambiente-ondas" animate={reduzir ? {x:0,y:0,rotate:0,scale:1} : movimento} transition={reduzir?{duration:0}:{duration:fundo === "prisma" ? 24 : 15,repeat:Infinity,ease:"easeInOut"}}/><div className="ex-ambiente-ruido"/></div>;
}
