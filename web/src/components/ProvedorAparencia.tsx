import { EfeitosExpressivos } from "./expressivo/EfeitosExpressivos";
import { AmbienteExpressivo } from "./expressivo/AmbienteExpressivo";
import { usePreferenciasExpressivo } from "../lib/expressivo";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MantineProvider, createTheme, Select, SegmentedControl } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { authClient } from "../lib/auth-client";
import { theme } from "../theme";
import { aparenciaPadrao, normalizarAparencia, obterEscalasPaleta, escalasClaras } from "../lib/aparencia";
import type { Aparencia } from "../lib/aparencia";
import { ContextoAparencia } from "../lib/contextoAparencia";
import "../styles/Aparencia.css";
import { useLocation } from "react-router";
import { AmbienteModerno } from "./AmbienteModerno";
import { CentralToasts } from "./CentralToasts";

export function ProvedorAparencia({children}: {children: ReactNode}) {
    const {data:sessao} = authClient.useSession();
    const id = sessao?.user.id ?? null;
    const [registro, setRegistro] = useState<{id: string; valor: Aparencia} | null>(null);
    const consulta = useRef<AbortController | null>(null);
    const identidade = useRef<string | null>(null);
    const escuroSistema = useMediaQuery("(prefers-color-scheme: dark)", true, {getInitialValueInEffect:false});
    const sistemaReduzido = useReducedMotion();
    const desktop = useMediaQuery("(min-width:48em)",false,{getInitialValueInEffect:false});
    const {valor:expressivo} = usePreferenciasExpressivo();
    const {pathname} = useLocation();
    // Rotas públicas têm identidade própria, mesmo se houver uma sessão ativa.
    const rota = pathname.toLowerCase().replace(/\/+$/, "");
    const publico = rota === "/login" || rota === "/redefinir" || rota.startsWith("/convite/");
    const aparencia = !publico && id && registro?.id === id ? registro.valor : aparenciaPadrao;
    useLayoutEffect(() => {identidade.current = id;}, [id]);
    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        consulta.current = controller;
        void fetch("/api/conta", {cache:"no-store", signal:controller.signal}).then(async resposta => {
            if (!resposta.ok) return;
            const dados = await resposta.json();
            if (!controller.signal.aborted && identidade.current === id) setRegistro({id, valor:normalizarAparencia(dados)});
        }).catch(() => {});
        return () => controller.abort();
    }, [id]);
    const aplicar = useCallback((valor: Aparencia) => {
        if (!id || identidade.current !== id) return;
        consulta.current?.abort();
        setRegistro({id, valor:normalizarAparencia(valor)});
    }, [id]);
    useLayoutEffect(() => {
        const raiz = document.documentElement;
        raiz.dataset.funiladorExpressivoDesktop = String(aparencia.estilo === "expressivo" && desktop);
        raiz.dataset.funiladorExpressivoMobile = String(aparencia.estilo === "expressivo" && !desktop);
        raiz.dataset.funiladorExNav = expressivo.navDesktop;
        raiz.dataset.funiladorExNavMobile = expressivo.navMobile;
        raiz.dataset.funiladorPaleta = aparencia.paleta;
        raiz.dataset.funiladorEstilo = aparencia.estilo;
        raiz.dataset.funiladorDensidade = aparencia.densidade;
        raiz.dataset.funiladorMovimento = aparencia.movimento;
        return () => {delete raiz.dataset.funiladorExpressivoDesktop; delete raiz.dataset.funiladorExpressivoMobile; delete raiz.dataset.funiladorExNavMobile; delete raiz.dataset.funiladorExNav; delete raiz.dataset.funiladorPaleta; delete raiz.dataset.funiladorEstilo; delete raiz.dataset.funiladorDensidade; delete raiz.dataset.funiladorMovimento;};
    }, [aparencia.paleta, aparencia.estilo, aparencia.densidade, aparencia.movimento, desktop, expressivo.navDesktop, expressivo.navMobile]);
    const esquema = aparencia.tema === "auto" ? (escuroSistema ? "dark" : "light") : aparencia.tema;
    const modernoDesktop = aparencia.estilo === "moderno" || aparencia.estilo === "expressivo";
    const reduzir = sistemaReduzido || aparencia.movimento === "reduzido";
    const tema = useMemo(() => createTheme({
        ...theme,
        primaryColor: aparencia.acento,
        colors: {...theme.colors, ...obterEscalasPaleta(aparencia.paleta), ...(esquema === "light" ? {gray:escalasClaras[aparencia.paleta]} : {})},
        defaultRadius: aparencia.estilo === "minimalista" ? "sm" : aparencia.estilo === "expressivo" ? "xl" : "lg",
        respectReducedMotion:true,
        ...(modernoDesktop ? {components:{...theme.components,
            Select:Select.extend({defaultProps:{comboboxProps:{transitionProps:{transition:"pop-top-left",duration:reduzir ? 0 : 260}}}}),
            SegmentedControl:SegmentedControl.extend({defaultProps:{transitionDuration:reduzir ? 0 : 290,transitionTimingFunction:"cubic-bezier(.22,1,.36,1)",withItemsBorders:false}}),
        }} : {}),
        ...(aparencia.densidade === "compacta" ? {spacing:{xs:"8px",sm:"10px",md:"12px",lg:"16px",xl:"24px"}} : aparencia.densidade === "confortavel" ? {spacing:{xs:"12px",sm:"15px",md:"20px",lg:"25px",xl:"36px"}} : {}),
    }), [aparencia.acento, aparencia.paleta, aparencia.estilo, aparencia.densidade, esquema, modernoDesktop, reduzir]);
    const contexto = useMemo(() => ({aparencia, aplicar}), [aparencia, aplicar]);
    return <ContextoAparencia.Provider value={contexto}><MantineProvider theme={tema} forceColorScheme={esquema}><AmbienteModerno/><AmbienteExpressivo/><EfeitosExpressivos/><CentralToasts sessaoId={id}/>{children}</MantineProvider></ContextoAparencia.Provider>;
}
