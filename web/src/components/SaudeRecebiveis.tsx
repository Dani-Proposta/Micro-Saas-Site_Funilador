import { CartaoValor, NumeroModerno } from "./InteracaoModerna";
import { motion } from "motion/react";
import { useAparencia, useMovimentoReduzido, useExpressivo } from "../lib/contextoAparencia";
import { IconeModerno } from "./AcabamentoModerno";
import { Button, Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { formatarValor } from "../lib/comercial";
import classes from "../styles/Financeiro.module.css";

type Dados = {totalPendente:string; atrasado:string; semData:string; proximos7?:string; atraso7?:string; atraso15?:string; atraso30?:string; atrasoMaior30?:string};
const numero = (v:string|undefined) => Math.max(0, Number(v ?? 0) || 0);
const percentual = (v:number,t:number) => t>0 ? Math.min(100, v/t*100) : 0;
const formatarPercentual = (v:number) => v.toLocaleString("pt-BR",{maximumFractionDigits:1}) + "%";

export function SaudeRecebiveis({dados,onAgenda,onAtrasados,repeticao=0}:{dados:Dados;onAgenda:()=>void;onAtrasados:()=>void;repeticao?:number}) {
    const {aparencia} = useAparencia();
    const expressivo = useExpressivo();

    const reduzir = useMovimentoReduzido();
    const moderno = (aparencia.estilo === "moderno" || expressivo);
    const animar = moderno && !reduzir;
    const total = numero(dados.totalPendente);
    const atrasado = numero(dados.atrasado);
    const semData = numero(dados.semData);
    const comData = Math.max(0,total-semData);
    const naoVencido = Math.max(0,comData-atrasado);
    const faixas = [{nome:"1–7 dias",valor:dados.atraso7},{nome:"8–15 dias",valor:dados.atraso15},{nome:"16–30 dias",valor:dados.atraso30},{nome:"Mais de 30 dias",valor:dados.atrasoMaior30}];
    return <Card withBorder padding="sm" className={classes.saude}><Stack gap="sm">
        <Group justify="space-between" align="start" wrap="wrap"><Stack gap={2}><Text fw={600}><IconeModerno nome="grafico" tamanho={20}/>Saúde dos recebíveis</Text><Text size="xs" c="dimmed">Posição geral dos saldos pendentes</Text></Stack><Button size="xs" variant="light" onClick={onAgenda}>Agenda de vencimentos</Button></Group>
        <SimpleGrid cols={{base:1,xs:2,lg:4}} spacing="sm" className="funilador-saude-metricas">
            <Stack gap={2}><Text size="xs" c="dimmed">Total a receber</Text><Text fw={700}>{<NumeroModerno valor={dados.totalPendente} moeda repeticao={repeticao}/>}</Text></Stack>
            {moderno ? <CartaoValor titulo="Em atraso" valor={dados.atrasado} repeticao={repeticao} cor={atrasado>0?"red":undefined} icone={<IconeModerno nome="alerta"/>} acao={onAtrasados}/> : <Stack gap={2}><Text size="xs" c="dimmed">Em atraso</Text><Text fw={700} c={atrasado>0?"red":undefined}>{formatarValor(dados.atrasado)}</Text><Button size="compact-xs" variant="subtle" style={{alignSelf:"flex-start"}} onClick={onAtrasados}>Consultar</Button></Stack>}
            <Stack gap={2}><Text size="xs" c="dimmed">Atraso sobre saldo com data</Text><Text fw={700}>{comData>0?formatarPercentual(percentual(atrasado,comData)):"—"}</Text></Stack>
            <Stack gap={2}><Text size="xs" c="dimmed">Hoje + 6 dias</Text><Text fw={700}>{dados.proximos7===undefined?"—":<NumeroModerno valor={dados.proximos7} moeda repeticao={repeticao}/>}</Text></Stack>
        </SimpleGrid>
        {total>0 && <><div className={classes.composicao} aria-hidden="true"><motion.span className={classes.naoVencido} initial={false} animate={{width:`${percentual(naoVencido,total)}%`}} transition={{duration:animar ? .45 : 0}}/><motion.span className={classes.atrasado} initial={false} animate={{width:`${percentual(atrasado,total)}%`}} transition={{duration:animar ? .45 : 0}}/><motion.span className={classes.semData} initial={false} animate={{width:`${percentual(semData,total)}%`}} transition={{duration:animar ? .45 : 0}}/></div>
            <Group gap="sm" wrap="wrap"><span className={classes.legenda}><i className={classes.naoVencido}/>Não vencido: {formatarValor(String(naoVencido))}</span><span className={classes.legenda}><i className={classes.atrasado}/>Atrasado: {formatarValor(dados.atrasado)}</span><span className={classes.legenda}><i className={classes.semData}/>Sem data: {formatarValor(dados.semData)}</span></Group></>}
        <Text size="xs" c="dimmed">O percentual de atraso exclui saldos sem vencimento. A agenda não inclui atrasados nem registros sem data.</Text>
        <Text fw={600} size="sm">Tempo de atraso</Text>
        {faixas.some(f=>f.valor===undefined) ? <Text size="xs" c="dimmed">Confira a versão da API para consultar as faixas.</Text> : atrasado===0 ? <Text size="sm" c="dimmed">Nenhum saldo atrasado.</Text> : <SimpleGrid cols={{base:1,sm:2}} spacing="sm" className="funilador-saude-faixas">{faixas.map(f=><Stack key={f.nome} gap={4}><Group justify="space-between" gap={4}><Text size="xs">{f.nome}</Text><Text size="xs" fw={500}>{formatarValor(f.valor ?? "0")}</Text></Group><div className={classes.barraGrupo} aria-hidden="true"><div className={classes.atrasado} style={{width:`${percentual(numero(f.valor),atrasado)}%`}}/></div></Stack>)}</SimpleGrid>}
    </Stack></Card>;
}
