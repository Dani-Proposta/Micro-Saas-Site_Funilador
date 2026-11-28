import type { ReactNode } from "react";
import { Badge, Group, Text, ThemeIcon, Title, useComputedColorScheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconFolder, IconMessageCircle, IconLock } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useMovimentoReduzido } from "../lib/contextoAparencia";

type Props = {children: ReactNode; etapa: "login" | "recuperacao" | "convite"};
const rotulos = {login:"Acesso à conta", recuperacao:"Recuperação de acesso", convite:"Convite de acesso"};

export function MolduraAcesso({children, etapa}: Props) {
    const desktop = useMediaQuery("(min-width: 48em)", false, {getInitialValueInEffect:false});
    const reduzir = useMovimentoReduzido();
    const tema = useComputedColorScheme("light", {getInitialValueInEffect: true});
    const logo = tema === "dark" ? "claro" : "escuro";
    return <div className="funilador-acesso">
        {!desktop && <motion.div className="funilador-acesso-mobile-marca" initial={reduzir?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduzir?0:.3}}><img src="/brand/funilador-emblema.svg" width={48} height={48} alt="" aria-hidden="true"/><Title order={1}>Funilador</Title><Text c="dimmed" size="sm">{rotulos[etapa]}</Text></motion.div>}
        {desktop && <motion.aside className="funilador-acesso-apresentacao" initial={reduzir ? false : {opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:reduzir?0:.36}}>
            <Group gap="sm"><img src={`/brand/funilador-logo-${logo}.svg`} alt="Funilador" width={190} height={60} style={{display:"block",maxWidth:"100%",height:"auto"}}/></Group>
            <div className="funilador-acesso-intro"><Badge variant="light">{rotulos[etapa]}</Badge><Title order={1}>Seu trabalho,<br/>em um só lugar.</Title><Text c="dimmed">Acompanhe projetos, solicitações e conversas em um espaço organizado.</Text></div>
            <div className="funilador-acesso-recursos">
                <Group wrap="nowrap"><ThemeIcon variant="light" radius="md" size={36}><IconFolder size={20} aria-hidden="true"/></ThemeIcon><Text size="sm">Projetos e etapas</Text></Group>
                <Group wrap="nowrap"><ThemeIcon variant="light" radius="md" size={36}><IconMessageCircle size={20} aria-hidden="true"/></ThemeIcon><Text size="sm">Comunicação centralizada</Text></Group>
                <Group wrap="nowrap"><ThemeIcon variant="light" radius="md" size={36}><IconLock size={20} aria-hidden="true"/></ThemeIcon><Text size="sm">Acesso individual por conta</Text></Group>
            </div>
            <Text size="xs" c="dimmed">Área administrativa e portal do cliente</Text>
        </motion.aside>}
        <div className="funilador-acesso-formulario">{children}</div>
    </div>;
}
