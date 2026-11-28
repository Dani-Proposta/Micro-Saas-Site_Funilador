import { motion } from "motion/react";
import { IconArrowUpRight, IconCheck, IconClock, IconCoins, IconReceipt, IconSparkles } from "@tabler/icons-react";
import { NumeroModerno, ComparativoMensal } from "../InteracaoModerna";
import { useMovimentoReduzido } from "../../lib/contextoAparencia";
import { formatarValor } from "../../lib/comercial";
import classes from "../../styles/BentoFinanceiro.module.css";

function composicaoMensal(recebido: string, previsto: string) {
    const r = Number(recebido), p = Number(previsto);
    if (!recebido.trim() || !previsto.trim() || !Number.isFinite(r) || !Number.isFinite(p) || r < 0 || p < 0) return null;
    const total = r + p;
    if (!Number.isFinite(total) || total <= 0) return null;
    const completo = r > 0 && p === 0;
    const percentual = r / total * 100;
    const rotulo = completo ? "100%" : percentual >= 99.95 ? "< 100%" : percentual > 0 && percentual < .05 ? "< 0,1%" : `${percentual.toLocaleString("pt-BR", {maximumFractionDigits:1})}%`;
    return {percentual, completo, rotulo};
}

type Props = {total:string; recebido:string; previsto:string; anterior?:string; repeticao:number; abrirFinanceiro:()=>void; abrirRecebidos:()=>void; abrirPrevistos:()=>void};

function Valor({valor,repeticao}: {valor:string;repeticao:number}) {
    const texto = formatarValor(valor);
    // Valores excepcionais continuam legíveis em vez de estourar a largura do contador.
    return <span className={classes.valor}>{texto.length > 12 ? texto : <NumeroModerno valor={valor} moeda repeticao={repeticao}/>}</span>;
}

export function BentoFinanceiro({total,recebido,previsto,anterior,repeticao,abrirFinanceiro,abrirRecebidos,abrirPrevistos}: Props) {
    const reduzir = useMovimentoReduzido();
    const composicao = composicaoMensal(recebido,previsto);
    const quitado = composicao?.completo === true;
    const saldo = Number(previsto);
    const recebidoPositivo = Number(recebido) > 0;
    const comparavel = anterior != null && Number.isFinite(Number(anterior)) && Number(anterior)>0 && Number.isFinite(Number(recebido));
    return <div className={classes.estrutura} data-reduzido={reduzir}>
        <div className={classes.grade}>
            <button type="button" className={`${classes.card} ${classes.estimado}`} data-conquista={quitado} onClick={abrirFinanceiro} aria-label={`Total estimado do mês: ${formatarValor(total)}. ${composicao ? `${composicao.rotulo} recebido do total estimado. ` : ""}Abrir financeiro`}>
                <span className={classes.topo}><span className={classes.icone}><IconCoins size={23} stroke={1.7}/></span><span>Total estimado do mês</span></span>
                <Valor valor={total} repeticao={repeticao}/>
                <span className={classes.descricao}>Recebido + previsto no mês, sem atrasados</span>
                <span className={classes.composicao}>
                    <span className={classes.proporcao}>{composicao ? <><span>{quitado && <IconSparkles size={15} aria-hidden="true"/>}{composicao.rotulo} recebido</span><span>{quitado ? "Previsão recebida" : "Composição do mês"}</span></> : <span>{Number(recebido) === 0 && saldo === 0 ? "Sem movimentação prevista no mês" : "Composição indisponível"}</span>}</span>
                    <span className={classes.trilho} data-disponivel={!!composicao} aria-hidden="true">
                        {composicao && <motion.span key={repeticao} className={classes.preenchimento} initial={reduzir ? false : {width:0}} animate={{width:`${composicao.percentual}%`}} transition={{duration:reduzir?0:1.15,ease:[.22,1,.36,1]}}/>}
                    </span>
                    {composicao && <span className={classes.legenda}><span><i/>Recebido</span><span><i/>A receber</span></span>}
                </span>
                <span className={classes.acao}>Abrir financeiro <IconArrowUpRight size={18} aria-hidden="true"/></span>
            </button>
            <button type="button" className={`${classes.card} ${classes.recebido}`} data-positivo={recebidoPositivo} onClick={abrirRecebidos} aria-label={`Recebido no mês: ${formatarValor(recebido)}. Consultar recebimentos`}>
                <span className={classes.topo}><span className={classes.icone}><IconReceipt size={23} stroke={1.7}/></span><span>Recebido no mês</span></span>
                <Valor valor={recebido} repeticao={repeticao}/>
                <span className={classes.descricao}>{comparavel ? <ComparativoMensal atual={recebido} anterior={anterior}/> : "Sem base para comparação"}</span>
                <span className={classes.sinal}>{recebidoPositivo ? <><IconCheck size={18} aria-hidden="true"/>Recebimentos registrados</> : "Nenhum recebimento no mês"}</span>
                <span className={classes.acao}>Consultar <IconArrowUpRight size={18} aria-hidden="true"/></span>
            </button>
            <button type="button" className={`${classes.card} ${classes.previsto}`} data-pendente={saldo>0} onClick={abrirPrevistos} aria-label={`A receber no mês: ${formatarValor(previsto)}. Consultar vencimentos`}>
                <span className={classes.topo}><span className={classes.icone}><IconClock size={23} stroke={1.7}/></span><span>A receber no mês</span></span>
                <Valor valor={previsto} repeticao={repeticao}/>
                <span className={classes.descricao}>Vencimentos até o fim do mês, sem atrasados</span>
                <span className={classes.sinal}>{saldo>0 ? <><IconClock size={18} aria-hidden="true"/>Saldo previsto</> : saldo===0 ? <><IconCheck size={18} aria-hidden="true"/>Nenhum saldo previsto</> : "Saldo indisponível"}</span>
                <span className={classes.acao}>Consultar <IconArrowUpRight size={18} aria-hidden="true"/></span>
            </button>
        </div>
    </div>;
}
