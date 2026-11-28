import { Alert, Radio, Stack, Text, Group } from "@mantine/core";
import { useState } from "react";
import { usePreferenciasExpressivo } from "../../lib/expressivo";
export function PreferenciasExpressivas() {
    const {valor,salvar} = usePreferenciasExpressivo();
    const [erro,setErro] = useState(false);
    return <Stack gap="sm" className="ex-preferencias">
        <Text fw={800} size="lg">Laboratório Expressivo</Text><Text size="xs" c="dimmed">Preferências deste navegador, por conta. Aplicação imediata, independente do botão Salvar preferências.</Text>
        {erro && <Alert color="red">Não foi possível armazenar a escolha neste navegador.</Alert>}
        <Radio.Group label="Navegação desktop" value={valor.navDesktop} onChange={v=>{if(v==="dock"||v==="card")setErro(!salvar({...valor,navDesktop:v}));}}><Group mt="xs"><Radio value="dock" label="Dock flutuante"/><Radio value="card" label="Card Nav expansível"/></Group></Radio.Group>
        <Radio.Group label="Ambientação desktop" value={valor.fundoDesktop} onChange={v=>{if(v==="liquid"||v==="prisma"||v==="aurora")setErro(!salvar({...valor,fundoDesktop:v}));}}><Stack gap={6} mt="xs"><Radio value="liquid" label="Fluido luminoso" description="Inspirado no Liquid Ether"/><Radio value="prisma" label="Prismático" description="Inspirado no Prismatic Burst"/><Radio value="aurora" label="Aurora"/></Stack></Radio.Group>
        <Radio.Group label="Navegação mobile" value={valor.navMobile} onChange={v=>{if(v==="bubble"||v==="staggered")setErro(!salvar({...valor,navMobile:v}));}}><Group mt="xs"><Radio value="bubble" label="Bubble Menu"/><Radio value="staggered" label="Staggered Menu"/></Group></Radio.Group>
    </Stack>;
}
