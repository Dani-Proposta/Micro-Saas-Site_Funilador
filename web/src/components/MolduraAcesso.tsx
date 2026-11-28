import type { ReactNode } from "react";
import { Badge, Group, Text, ThemeIcon, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconLayoutDashboard, IconFolder, IconMessageCircle, IconLock } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useMovimentoReduzido } from "../lib/contextoAparencia";

type Props = {children: ReactNode; etapa: "login" | "recuperacao" | "convite"};
const rotulos = {login:"Acesso à conta", recuperacao:"Recuperação de acesso", convite:"Convite de acesso"};

export function MolduraAcesso({children, etapa}: Props) {
    const desktop = useMediaQuery("(min-width: 48em)", false, {getInitialValueInEffect:false});
    const reduzir = useMovimentoReduzido();
    return <div className="funilador-acesso">
        {!desktop && <motion.div className="funilador-acesso-mobile-marca" initial={reduzir?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduzir?0:.3}}><ThemeIcon size={48} radius="lg" variant="light"><IconLayoutDashboard size={27}/></ThemeIcon><Title order={1}>Funilador</Title><Text c="dimmed" size="sm">{rotulos[etapa]}</Text></motion.div>}
        {desktop && <motion.aside className="funilador-acesso-apresentacao" initial={reduzir ? false : {opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:reduzir?0:.36}}>
            <Group gap="sm"><ThemeIcon size={44} radius="lg" variant="light"><IconLayoutDashboard size={24} aria-hidden="true"/></ThemeIcon><Text fw={700} size="xl">Funilador</Text></Group>
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
