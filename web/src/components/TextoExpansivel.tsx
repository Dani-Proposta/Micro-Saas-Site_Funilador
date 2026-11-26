import { useEffect, useRef, useState } from "react";
import { Text, UnstyledButton } from "@mantine/core";

export function TextoExpansivel({texto, linhas = 7}: {texto: string; linhas?: number}) {
    const [expandido, setExpandido] = useState(false);
    const [excede, setExcede] = useState(false);
    const conteudoRef = useRef<HTMLDivElement>(null);
    const limite = linhas * 1.45;

    useEffect(() => {
        const conteudo = conteudoRef.current;
        if (!conteudo) return;
        const medir = () => {
            const estilo = getComputedStyle(conteudo);
            setExcede(conteudo.getBoundingClientRect().height > parseFloat(estilo.fontSize) * limite + 1);
        };
        const observer = new ResizeObserver(medir);
        observer.observe(conteudo);
        return () => observer.disconnect();
    }, [limite, texto]);

    return (
        <div style={{minWidth: 0, fontSize: "var(--mantine-font-size-sm)", lineHeight: 1.45}}>
            <div style={{maxHeight: expandido ? undefined : `${limite}em`, overflow: "hidden"}}>
                <div ref={conteudoRef} style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{texto}</div>
            </div>
            {excede && <UnstyledButton type="button" aria-expanded={expandido} onClick={() => setExpandido(v => !v)} style={{color: "inherit", textDecoration: "underline", cursor: "pointer", marginTop: 4}}><Text span size="xs" fw={600}>{expandido ? "Recolher" : "Ler mais"}</Text></UnstyledButton>}
        </div>
    );
}
