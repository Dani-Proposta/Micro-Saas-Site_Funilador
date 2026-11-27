import { useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, RefObject } from "react";
import { Badge, NavLink, Tabs, Text } from "@mantine/core";
import { NavLink as RouterNavLink } from "react-router";
import { IconePainel } from "./MenuConta";
import estrutura from "../styles/Estrutura.module.css";
import classes from "../styles/Navegacao.module.css";

type ItemNavegacao = {
    rota: string;
    texto: string;
    icone: ComponentPropsWithoutRef<typeof IconePainel>["nome"];
    exato?: boolean;
    mensagens?: boolean;
};

const admin: ItemNavegacao[] = [
    {rota:"/", texto:"Visão geral", icone:"painel", exato:true},
    {rota:"/clientes", texto:"Clientes", icone:"clientes"},
    {rota:"/solicitacoes", texto:"Solicitações", icone:"solicitacoes"},
    {rota:"/projetos", texto:"Projetos", icone:"projetos"},
    {rota:"/financeiro", texto:"Financeiro", icone:"financeiro"},
    {rota:"/mensagens", texto:"Mensagens", icone:"mensagens", mensagens:true},
    {rota:"/convites", texto:"Convites", icone:"convites"},
];
const cliente: ItemNavegacao[] = [
    {rota:"/portal", texto:"Visão geral", icone:"painel", exato:true},
    {rota:"/portal/projetos", texto:"Meus projetos", icone:"projetos"},
    {rota:"/portal/solicitacoes", texto:"Minhas solicitações", icone:"solicitacoes"},
    {rota:"/portal/mensagens", texto:"Mensagens", icone:"mensagens", mensagens:true},
];

// indicador visual independente do estado de navegação
// observa a seleção real do router e do mantine, sem duplicar estado react
function useTrilho(ref: RefObject<HTMLElement | null>, seletor: string) {
    useLayoutEffect(() => {
        const raiz = ref.current;
        if (!raiz) return;
        const atualizar = () => {
            const ativo = raiz.querySelector<HTMLElement>(seletor);
            if (!ativo || !ativo.offsetWidth || !ativo.offsetHeight) {
                delete raiz.dataset.trilhoAtivo;
                return;
            }
            raiz.style.setProperty("--trilho-x", `${ativo.offsetLeft}px`);
            raiz.style.setProperty("--trilho-y", `${ativo.offsetTop}px`);
            raiz.style.setProperty("--trilho-w", `${ativo.offsetWidth}px`);
            raiz.style.setProperty("--trilho-h", `${ativo.offsetHeight}px`);
            raiz.dataset.trilhoAtivo = "true";
        };
        const resize = new ResizeObserver(atualizar);
        const observarTamanho = () => {
            resize.disconnect();
            resize.observe(raiz);
            for (const item of raiz.children) resize.observe(item);
        };
        const mudancas = new MutationObserver(registros => {
            if (registros.some(r => r.type === "childList")) observarTamanho();
            atualizar();
        });
        observarTamanho();
        mudancas.observe(raiz, {subtree:true, childList:true, attributes:true, attributeFilter:["aria-current", "aria-selected"]});
        atualizar();
        return () => {resize.disconnect(); mudancas.disconnect();};
    }, [ref, seletor]);
}

export function NavegacaoPainel({lado, naoLidas, fechar, aberto}: {lado: "admin" | "cliente"; naoLidas: number | null; fechar: () => void; aberto: boolean}) {
    const itens = lado === "admin" ? admin : cliente;
    const ref = useRef<HTMLElement>(null);
    useTrilho(ref, 'a[aria-current="page"]');
    return <>
        <Text size="xs" c="dimmed" fw={600} className={estrutura.navLabel}>{lado === "admin" ? "Área de trabalho" : "Navegação"}</Text>
        <nav ref={ref} className={classes.trilho} aria-label={lado === "admin" ? "Área de trabalho" : "Navegação do cliente"} data-mobile-aberto={aberto}>
            {itens.map((item, i) => <NavLink key={item.rota} className={`${estrutura.navLink} ${classes.link}`} label={item.texto}
                leftSection={<IconePainel nome={item.icone}/>} rightSection={item.mensagens && !!naoLidas ? <Badge color="red" size="sm" aria-label={`${naoLidas} mensagens não lidas`}>{naoLidas}</Badge> : undefined}
                style={{"--ordem-nav":i} as CSSProperties}
                onClick={fechar} renderRoot={props => <RouterNavLink to={item.rota} end={item.exato} {...props}/>}/>) }
        </nav>
    </>;
}

export function AbasNavegacao({className, ...props}: ComponentPropsWithoutRef<typeof Tabs.List>) {
    const ref = useRef<HTMLDivElement>(null);
    useTrilho(ref, 'button[role="tab"][aria-selected="true"]');
    return <Tabs.List {...props} ref={ref} className={`${classes.abas} ${className ?? ""}`}/>;
}
