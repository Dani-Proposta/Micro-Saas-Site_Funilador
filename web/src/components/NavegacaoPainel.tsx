import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, RefObject, ReactElement, ReactNode } from "react";
import { Badge, Drawer, NavLink, Tabs, Text, useComputedColorScheme, useTabsContext } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { NavLink as RouterNavLink, useLocation, matchPath } from "react-router";
import LineSidebar from "./ui/react-bits/LineSidebar";
import PillNav from "./ui/react-bits/PillNav";
import "./ui/react-bits/PillNavTabs.css";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";
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

type PropsNavegacao = {lado: "admin" | "cliente"; naoLidas: number | null; fechar: () => void; aberto: boolean};

function NavegacaoMantine({itens, lado, naoLidas, fechar, aberto}: PropsNavegacao & {itens: ItemNavegacao[]}) {
    const ref = useRef<HTMLElement>(null);
    useTrilho(ref, 'a[aria-current="page"]');
    return <nav ref={ref} className={classes.trilho} aria-label={lado === "admin" ? "Área de trabalho" : "Navegação do cliente"} data-mobile-aberto={aberto}>
        {itens.map((item, i) => <NavLink key={item.rota} className={`${estrutura.navLink} ${classes.link}`} label={item.texto}
            leftSection={<IconePainel nome={item.icone}/>} rightSection={item.mensagens && !!naoLidas ? <Badge color="red" size="sm" aria-label={`${naoLidas} mensagens não lidas`}>{naoLidas}</Badge> : undefined}
            style={{"--ordem-nav":i} as CSSProperties}
            onClick={fechar} renderRoot={props => <RouterNavLink to={item.rota} end={item.exato} {...props}/>}/>) }
    </nav>;
}

// Mobile Moderno: as mesmas rotas do desktop, em uma superfície própria para toque.
export function NavegacaoMobile({lado, naoLidas, fechar, aberto}: PropsNavegacao) {
    const {aparencia} = useAparencia();
    const reduzir = useMovimentoReduzido();
    const desktop = useMediaQuery("(min-width: 48em)");
    const moderno = aparencia.estilo === "moderno";
    const {pathname} = useLocation();
    const itens = lado === "admin" ? admin : cliente;
    const atual = itens.find(item => matchPath({path:item.rota, end:item.exato ?? false}, pathname));

    useEffect(() => {
        if (moderno && desktop && aberto) fechar();
    }, [moderno, desktop, aberto, fechar]);

    if (!moderno) return null;
    return <Drawer
        opened={aberto && !desktop}
        onClose={fechar}
        title="Navegação"
        position="bottom"
        size="auto"
        classNames={{content:classes.mobileSheet, header:classes.mobileSheetHeader, body:classes.mobileSheetBody}}
        transitionProps={{duration:reduzir ? 0 : 320, timingFunction:"cubic-bezier(.22,1,.36,1)"}}
        overlayProps={{backgroundOpacity:.48}}
        closeButtonProps={{"aria-label":"Fechar navegação"}}
    >
        <Text size="xs" c="dimmed" mb="sm">{lado === "admin" ? "Área de trabalho" : "Portal do cliente"}{atual ? ` · ${atual.texto}` : ""}</Text>
        <nav className={classes.mobileGrid} aria-label={lado === "admin" ? "Área de trabalho" : "Navegação do cliente"}>
            {itens.map((item, index) => <RouterNavLink key={item.rota}
                to={item.rota} end={item.exato} onClick={fechar}
                className={classes.mobileTile} style={{"--ordem-nav":index} as CSSProperties}>
                <span className={classes.mobileTileIcon}><IconePainel nome={item.icone} tamanho={22}/></span>
                <span className={classes.mobileTileLabel}>{item.texto}</span>
                {item.mensagens && !!naoLidas && <Badge color="red" size="sm" className={classes.mobileBadge} aria-label={`${naoLidas} mensagens não lidas`}>{naoLidas > 99 ? "99+" : naoLidas}</Badge>}
                <span className={classes.mobileTileMark} aria-hidden="true"/>
            </RouterNavLink>)}
        </nav>
    </Drawer>;
}

export function NavegacaoPainel({lado, naoLidas, fechar, aberto}: PropsNavegacao) {
    const itens = lado === "admin" ? admin : cliente;
    const {aparencia} = useAparencia();
    const reduzir = useMovimentoReduzido();
    const {pathname} = useLocation();
    const ativo = itens.findIndex(item => matchPath({path:item.rota, end:item.exato ?? false}, pathname));
    const titulo = lado === "admin" ? "Área de trabalho" : "Navegação";
    const altura = aparencia.densidade === "compacta" ? 3 : aparencia.densidade === "confortavel" ? 8 : 5;
    return <>
        <Text size="xs" c="dimmed" fw={600} className={estrutura.navLabel}>{titulo}</Text>
        {aparencia.estilo === "moderno" ? <LineSidebar
            className={classes.lineOriginal}
            ariaLabel={lado === "admin" ? "Área de trabalho" : "Navegação do cliente"}
            items={itens.map(item => item.texto)} activeIndex={ativo < 0 ? null : ativo}
            accentColor="var(--mantine-primary-color-light-color)" textColor="var(--mantine-color-text)" markerColor="var(--mantine-color-dimmed)"
            showIndex={false} showMarker markerLength={22} markerGap={10} tickScale={.5}
            maxShift={24} proximityRadius={64} itemGap={altura} fontSize={.875} smoothing={115}
            reducedMotion={reduzir}
            renderItem={(index, _label, content) => {
                const item = itens[index];
                return <RouterNavLink className={classes.lineLink} to={item.rota} end={item.exato} onClick={fechar}>
                    <span className={classes.lineIcon} aria-hidden="true"><IconePainel nome={item.icone}/></span>
                    {content}
                    {item.mensagens && !!naoLidas && <Badge color="red" size="sm" className={classes.lineBadge} aria-label={`${naoLidas} mensagens não lidas`}>{naoLidas > 99 ? "99+" : naoLidas}</Badge>}
                </RouterNavLink>;
            }}/>
        : <NavegacaoMantine itens={itens} lado={lado} naoLidas={naoLidas} fechar={fechar} aberto={aberto}/>}
    </>;
}

function AbasMantine({className, ...props}: ComponentPropsWithoutRef<typeof Tabs.List>) {
    const ref = useRef<HTMLDivElement>(null);
    useTrilho(ref, 'button[role="tab"][aria-selected="true"]');
    return <Tabs.List {...props} ref={ref} className={`${classes.abas} ${className ?? ""}`}/>;
}


type PropsAba = ComponentPropsWithoutRef<typeof Tabs.Tab>;

// Somente abas textuais: qualquer configuração mais complexa mantém o Mantine.
function textoAba(node: ReactNode): string | null {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) {
        const partes = node.map(textoAba);
        return partes.some(parte => parte === null) ? null : partes.join("");
    }
    return null;
}

export function AbasNavegacao({className, children, ...props}: ComponentPropsWithoutRef<typeof Tabs.List>) {
    const {aparencia} = useAparencia();
    const reduzir = useMovimentoReduzido();
    const tema = useComputedColorScheme("light", {getInitialValueInEffect: true});
    const contexto = useTabsContext();
    const mobile = useMediaQuery("(max-width: 47.99em)");
    const listaRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const lista = listaRef.current;
        if (!mobile || !lista) return;
        const selecionada = lista.querySelector<HTMLElement>('button[role="tab"][aria-selected="true"]');
        if (!selecionada) return;
        const area = lista.getBoundingClientRect();
        const aba = selecionada.getBoundingClientRect();
        const deslocamento = aba.left < area.left ? aba.left - area.left - 4
            : aba.right > area.right ? aba.right - area.right + 4 : 0;
        if (deslocamento) lista.scrollTo({left:lista.scrollLeft + deslocamento, behavior:reduzir ? "auto" : "smooth"});
    }, [mobile, contexto.value, reduzir, aparencia.estilo, aparencia.densidade]);
    const elementos = Children.toArray(children);
    const abas: {elemento: ReactElement<PropsAba>; label: string; href: string}[] = [];

    for (const elemento of elementos) {
        if (!isValidElement<PropsAba>(elemento) || elemento.type !== Tabs.Tab) break;
        const {value, children: conteudo, leftSection, rightSection, disabled} = elemento.props;
        const label = textoAba(conteudo);
        if (typeof value !== "string" || label === null || leftSection || rightSection || disabled) break;
        abas.push({elemento, label, href: value});
    }

    if (aparencia.estilo !== "moderno" || contexto.orientation === "vertical" || props.grow || !abas.length || abas.length !== elementos.length) {
        return <AbasMantine {...props} className={className}>{children}</AbasMantine>;
    }

    const tamanho = mobile ? "lg" : aparencia.densidade === "compacta" ? "sm" : aparencia.densidade === "confortavel" ? "lg" : "md";
    return <Tabs.List {...props} ref={listaRef} className={`funilador-abas-pill ${className ?? ""}`}>
        <PillNav
            items={abas.map(({label, href}) => ({label, href}))}
            activeHref={contexto.value ?? ""}
            theme={tema}
            layout="joined" size={tamanho} surface="solid" itemStyle="plain"
            hoverEffect={mobile ? "none" : "glide"} indicator="pill" bounce={mobile ? .34 : .56} stretch={mobile ? .42 : .72}
            barColor="var(--mantine-color-default-hover)" textColor="var(--mantine-color-text)"
            collapse="never" intro={false} reducedMotion={reduzir}
            renderTab={(index, classe, content) => {
                const elemento = abas[index].elemento;
                return cloneElement(elemento, {
                    className: `${elemento.props.className ?? ""} ${classe}`,
                    children: content,
                });
            }}
        />
    </Tabs.List>;
}
