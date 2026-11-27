import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { authClient } from "../lib/auth-client";
import { theme } from "../theme";
import { aparenciaPadrao, normalizarAparencia, obterEscalasPaleta } from "../lib/aparencia";
import type { Aparencia } from "../lib/aparencia";
import { ContextoAparencia } from "../lib/contextoAparencia";
import "../styles/Aparencia.css";

export function ProvedorAparencia({children}: {children: ReactNode}) {
    const {data:sessao} = authClient.useSession();
    const id = sessao?.user.id ?? null;
    const [registro, setRegistro] = useState<{id: string; valor: Aparencia} | null>(null);
    const consulta = useRef<AbortController | null>(null);
    const identidade = useRef<string | null>(null);
    const escuroSistema = useMediaQuery("(prefers-color-scheme: dark)", true, {getInitialValueInEffect:false});
    const aparencia = id && registro?.id === id ? registro.valor : aparenciaPadrao;
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
        raiz.dataset.funiladorPaleta = aparencia.paleta;
        raiz.dataset.funiladorEstilo = aparencia.estilo;
        raiz.dataset.funiladorDensidade = aparencia.densidade;
        raiz.dataset.funiladorMovimento = aparencia.movimento;
        return () => {delete raiz.dataset.funiladorPaleta; delete raiz.dataset.funiladorEstilo; delete raiz.dataset.funiladorDensidade; delete raiz.dataset.funiladorMovimento;};
    }, [aparencia.paleta, aparencia.estilo, aparencia.densidade, aparencia.movimento]);
    const tema = useMemo(() => createTheme({
        ...theme,
        primaryColor: aparencia.acento,
        colors: {...theme.colors, ...obterEscalasPaleta(aparencia.paleta)},
        defaultRadius: aparencia.estilo === "minimalista" ? "sm" : aparencia.estilo === "expressivo" ? "xl" : "lg",
        respectReducedMotion:true,
        ...(aparencia.densidade === "compacta" ? {spacing:{xs:"8px",sm:"10px",md:"12px",lg:"16px",xl:"24px"}} : aparencia.densidade === "confortavel" ? {spacing:{xs:"12px",sm:"15px",md:"20px",lg:"25px",xl:"36px"}} : {}),
    }), [aparencia.acento, aparencia.paleta, aparencia.estilo, aparencia.densidade]);
    const contexto = useMemo(() => ({aparencia, aplicar}), [aparencia, aplicar]);
    const esquema = aparencia.tema === "auto" ? (escuroSistema ? "dark" : "light") : aparencia.tema;
    return <ContextoAparencia.Provider value={contexto}><MantineProvider theme={tema} forceColorScheme={esquema}>{children}</MantineProvider></ContextoAparencia.Provider>;
}
