import type { MouseEvent, ReactNode } from "react";
import { Card, Group, SegmentedControl, Text, Title } from "@mantine/core";
import { motion } from "motion/react";
import { IconFolder, IconClipboardList, IconUsers, IconWallet, IconMail, IconCalendar, IconArrowUpRight, IconRefresh, IconChartBar, IconClock, IconReceipt, IconAlertCircle, IconCoins, IconUser } from "@tabler/icons-react";
import { useAparencia, useMovimentoReduzido, useExpressivo } from "../lib/contextoAparencia";

const icones = {projetos:IconFolder, solicitacoes:IconClipboardList, clientes:IconUsers, financeiro:IconWallet, convites:IconMail, calendario:IconCalendar, abrir:IconArrowUpRight, atualizar:IconRefresh, grafico:IconChartBar, prazo:IconClock, recebido:IconReceipt, alerta:IconAlertCircle, estimado:IconCoins, pessoa:IconUser};
type NomeIcone = keyof typeof icones;

export function IconeModerno({nome, tamanho=18}: {nome:NomeIcone; tamanho?:number}) {
    const Icone = icones[nome];
    return <span className="funilador-icone-moderno" aria-hidden="true"><Icone size={tamanho} stroke={1.7}/></span>;
}

export function CabecalhoModerno({titulo, descricao, secao, icone, acoes, classeTitulo, ordem=1, original}: {titulo:string; descricao?:string; secao?:string; icone:NomeIcone; acoes?:ReactNode; classeTitulo?:string; ordem?:1|2; original?:ReactNode}) {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();

    if ((aparencia.estilo !== "moderno" && !expressivo) && original) return <>{original}</>;
    return <Group justify="space-between" align="center" wrap="wrap" className="funilador-cabecalho-moderno" data-ex-area={icone}>
        <div className="funilador-cabecalho-identidade"><IconeModerno nome={icone} tamanho={26}/><div className="funilador-cabecalho-texto">
            {secao && <Text size="xs" className="funilador-sobretitulo">{secao}</Text>}
            <Title order={ordem} className={classeTitulo}>{titulo}</Title>
            {descricao && <Text size="sm" c="dimmed">{descricao}</Text>}
        </div></div>
        {acoes && <div className="funilador-cabecalho-acoes">{acoes}</div>}
    </Group>;
}

// Os cards mantêm o elemento Card e os handlers originais. Motion só entra no desktop Moderno.
export function CartaoRegistro({children, className, tipo, estado}: {children:ReactNode; className:string; tipo:string; estado?:string}) {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();

    const reduzir = useMovimentoReduzido();
    const moderno = aparencia.estilo === "moderno" || expressivo;
    if (!moderno) return <Card withBorder padding="sm" className={className}>{children}</Card>;
    function abrirCartao(evento: MouseEvent<HTMLDivElement>) {
        const alvo = evento.target;
        if (!(alvo instanceof Element) || !evento.currentTarget.contains(alvo)) return;
        if (evento.button !== 0 || alvo.closest('button,a,input,select,textarea,label,[role="button"],[role="combobox"],[contenteditable], [data-no-card-click]')) return;
        if (window.getSelection()?.toString()) return;
        evento.currentTarget.querySelector<HTMLButtonElement>("button.funilador-abrir-cartao:not(:disabled)")?.click();
    }
    return <Card component={motion.div} onClick={abrirCartao} withBorder padding="sm" className={`${className} funilador-cartao-moderno`} data-tipo-registro={tipo} data-ex-estado={expressivo ? estado : undefined}
        layout={reduzir || expressivo ? false : "position"} initial={reduzir ? false : expressivo ? {opacity:0} : {opacity:0, y:6}} animate={expressivo ? {opacity:1} : {opacity:1,y:0}} transition={{duration:reduzir?0:expressivo ? .48 : .26,ease:[.22,1,.36,1]}}>{children}</Card>;
}

// A cápsula continua sendo um grupo de radio nativo do Mantine.
export function SegmentoModerno({value, onChange, data}: {value:string; onChange:(v:string)=>void; data:{value:string;label:ReactNode}[]}) {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();

    const reduzir = useMovimentoReduzido();
    const moderno = aparencia.estilo === "moderno" || expressivo;
    return <SegmentedControl value={value} onChange={onChange} data={data} className={moderno ? "funilador-segmento-moderno" : undefined}
        transitionDuration={reduzir ? 0 : moderno ? 410 : undefined} transitionTimingFunction={moderno ? "cubic-bezier(.22,1,.36,1)" : undefined} withItemsBorders={!moderno}/>;
}
