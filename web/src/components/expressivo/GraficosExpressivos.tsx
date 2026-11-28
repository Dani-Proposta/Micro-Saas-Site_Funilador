import { useId, useState } from "react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Button, Card, Group, Modal, Select, Stack, Text, Table, Center } from "@mantine/core";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { IconMaximize, IconMinimize, IconRotateClockwise, IconChartBar, IconTable } from "@tabler/icons-react";
import { useMovimentoReduzido } from "../../lib/contextoAparencia";
import { usePreferenciasExpressivo } from "../../lib/expressivo";
import { formatarValor } from "../../lib/comercial";
import "@mantine/charts/styles.css";

type Modo = "barras"|"linha"|"area"|"pontos"|"combinado"|"rosca"|"bolhas"|"medidor"|"anel";
const rotulos:Record<Modo,string>={barras:"Barras",linha:"Linhas",area:"Área",pontos:"Dispersão / pontos",combinado:"Combinado",rosca:"Rosca",bolhas:"Bolhas",medidor:"Medidor",anel:"Anel de composição"};
type Linha = {id:string;nome:string;valor:number;secundario?:number;acumulado?:number;dia?:number;cor?:string};
const cores=["var(--mantine-color-teal-5)","var(--mantine-primary-color-5)","var(--mantine-color-orange-5)","var(--mantine-color-blue-5)","var(--mantine-color-pink-5)","var(--mantine-color-cyan-5)","var(--mantine-color-violet-5)","var(--mantine-color-yellow-5)","var(--mantine-color-gray-5)"];
const moeda=(v:number)=>formatarValor(String(v));
const abreviar=(v:number)=>new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:1}).format(v);
const numero=(v:string|undefined)=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;

// Medição do espaço real: o canvas nunca depende de height:100% de uma Stack.
function AreaGrafico({altura,children}:{altura:number;children:(largura:number)=>ReactNode}) {
    const {ref,width}=useElementSize<HTMLDivElement>();
    return <div ref={ref} className="ex-plot" style={{height:altura,minHeight:altura,flex:`0 0 ${altura}px`,minWidth:0,width:"100%"}}>{width>0 ? children(Math.floor(width)) : <Center h={altura}><Text size="xs" c="dimmed">Preparando gráfico…</Text></Center>}</div>;
}

// Anel com valores reais, setores focáveis pela legenda e leitura por mouse/toque.
function AnelComposicao({dados,total}: {dados:Linha[];total:number}) {
    const reduzir=useMovimentoReduzido();
    const [ativo,setAtivo]=useState<string|null>(null);
    const positivo=dados.filter(d=>d.valor>0);
    const atual=dados.find(d=>d.id===ativo);
    const ponto=(angulo:number)=>`${85+67*Math.cos(angulo)} ${85+67*Math.sin(angulo)}`;
    const arco=(inicio:number,fracao:number)=>{
        const a=inicio*2*Math.PI-Math.PI/2;
        if(fracao>=1-1e-12)return `M ${ponto(a)} A 67 67 0 0 1 ${ponto(a+Math.PI)} A 67 67 0 0 1 ${ponto(a+2*Math.PI)}`;
        return `M ${ponto(a)} A 67 67 0 ${fracao>.5?1:0} 1 ${ponto(a+fracao*2*Math.PI)}`;
    };
    const pct=(v:number)=>`${(100*v/total).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`;
    return <div className="ex-anel-layout" onPointerLeave={e=>{if(e.pointerType==="mouse")setAtivo(null);}}>
        <div className="ex-anel-grafico"><svg viewBox="0 0 170 170" role="img" aria-label="Composição dos recebíveis">
            <circle cx="85" cy="85" r="67" stroke="var(--mantine-color-default-border)" strokeWidth="22" fill="none"/>
            {positivo.map((d,i)=>{const inicio=positivo.slice(0,i).reduce((s,item)=>s+item.valor,0)/total;return <motion.path key={d.id} d={arco(inicio,d.valor/total)} fill="none" stroke={d.cor??cores[i%cores.length]} initial={reduzir?false:{pathLength:0}} animate={{pathLength:1,strokeWidth:ativo===d.id?28:22,opacity:ativo && ativo!==d.id ? .4 : 1}} transition={{duration:reduzir?0:.55,ease:"easeOut"}} onPointerEnter={()=>setAtivo(d.id)} onClick={()=>setAtivo(d.id)}><title>{d.nome}: {pct(d.valor)} · {moeda(d.valor)}</title></motion.path>;})}
        </svg><div className="ex-anel-centro" aria-live="polite"><Text size="xs" c="dimmed">{atual?.nome??"Total"}</Text><Text fw={800} size="lg" className="ex-anel-centro-total" data-longo={(atual?pct(atual.valor):moeda(total)).length>12} title={atual?pct(atual.valor):moeda(total)}>{atual?pct(atual.valor):moeda(total)}</Text>{atual&&<Text size="xs" className="ex-anel-centro-valor" data-longo={moeda(atual.valor).length>12}>{moeda(atual.valor)}</Text>}</div></div>
        <div className="ex-anel-legenda">{dados.map((d,i)=><button type="button" key={d.id} data-ativo={ativo===d.id} onPointerEnter={()=>setAtivo(d.id)} onFocus={()=>setAtivo(d.id)} onBlur={()=>setAtivo(null)} onClick={()=>setAtivo(d.id)} aria-label={`${d.nome}: ${pct(d.valor)}, ${moeda(d.valor)}`}><span className="ex-anel-amostra" style={{background:d.cor??cores[i%cores.length]}}/><span className="ex-anel-nome">{d.nome}</span><strong>{pct(d.valor)}</strong><span className="ex-anel-valor">{moeda(d.valor)}</span></button>)}</div>
    </div>;
}

// Medidor responsivo: a mesma proporção financeira, sem a caixa fixa da biblioteca.
function MedidorExpressivo({valor}: {valor:number}) {
    const reduzir=useMovimentoReduzido();
    const v=Math.min(100,Math.max(0,valor));
    const texto=`${v.toLocaleString("pt-BR",{maximumFractionDigits:1})}%`;
    const arco="M 48 168 A 94 94 0 1 1 192 168";
    // O arco cobre aproximadamente 260 graus, com o número no centro geométrico.
    return <div className="ex-medidor-layout"><div className="ex-medidor-figura"><svg viewBox="0 0 240 206" role="meter" aria-label="Saldos com vencimento atrasados" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><path d={arco} fill="none" stroke="var(--mantine-color-default-border)" strokeWidth="16" strokeLinecap="round"/>{v>0&&<motion.path d={arco} fill="none" stroke="var(--mantine-color-red-5)" strokeWidth="16" strokeLinecap="round" initial={reduzir?false:{pathLength:0}} animate={{pathLength:v/100}} transition={{duration:reduzir?0:1.1,ease:[.22,1,.36,1]}}/>}<text x="120" y="114" textAnchor="middle" fontSize="30" fontWeight="800" fill="currentColor">{texto}</text><text x="120" y="133" textAnchor="middle" fontSize="11" fill="var(--mantine-color-dimmed)">EM ATRASO</text><text x="37" y="193" textAnchor="middle" fontSize="11" fill="var(--mantine-color-dimmed)">0%</text><text x="203" y="193" textAnchor="middle" fontSize="11" fill="var(--mantine-color-dimmed)">100%</text></svg></div><div className="ex-medidor-descricao"><Text size="sm" fw={750}>Saldos com vencimento</Text><Text size="sm" c="dimmed">{texto} dos saldos com data estão atrasados.</Text><Text size="xs" c="dimmed">Valores sem vencimento não entram neste cálculo.</Text></div></div>;
}

function PainelGrafico({id,titulo,descricao,modos,dados,serie2=false,rotulo="Valor",rotulo2="A receber",acoes,medidor,className,selecionadoId}: {id:string;titulo:string;descricao:string;modos:Modo[];dados:Linha[];serie2?:boolean;rotulo?:string;rotulo2?:string;acoes?:ReactNode;medidor?:number|null;className?:string;selecionadoId?:string}) {
    const {chave}=usePreferenciasExpressivo();
    const reduzir=useMovimentoReduzido();
    const mobile=useMediaQuery("(max-width:47.99em)",false,{getInitialValueInEffect:false});
    const chaveGrafico=chave?`${chave}:${mobile?"mobile":"desktop"}:grafico:${id}`:null;
    const lerModo=():Modo=>{try{const v=chaveGrafico?localStorage.getItem(chaveGrafico):null;return modos.find(m=>m===v)??modos[0];}catch{return modos[0];}};
    const [preferencia,setPreferencia]=useState(()=>({chave:chaveGrafico,modo:lerModo()}));
    const modo=preferencia.chave===chaveGrafico?preferencia.modo:lerModo();
    const [expandido,setExpandido]=useState(false);
    const [virado,setVirado]=useState(false);
    const [paginaTabela,setPaginaTabela]=useState(0);
    const {ref:refPlot,height:alturaPlot}=useElementSize<HTMLDivElement>();
    const selecionado=dados.find(d=>d.id===selecionadoId);
    const grad=useId().replace(/[^a-zA-Z0-9_-]/g,"");
    const escolhido=modos.includes(modo)?modo:modos[0];
    const trocar=(v:string|null)=>{const m=modos.find(m=>m===v);if(!m)return;setPreferencia({chave:chaveGrafico,modo:m});try{if(chaveGrafico)localStorage.setItem(chaveGrafico,m);}catch{/* uso em sessão continua disponível */}};
    const total=dados.reduce((s,d)=>s+d.valor,0);
    const tooltip=<Tooltip formatter={v=>moeda(Number(v))} contentStyle={{background:"var(--mantine-color-body)",border:"1px solid var(--mantine-color-default-border)",borderRadius:12,color:"var(--mantine-color-text)"}} itemStyle={{color:"var(--mantine-color-text)"}} labelStyle={{color:"var(--mantine-color-text)"}}/>;
    const desenhar=(altura:number)=>{
        if (!dados.length || (total===0 && !dados.some(d=>(d.secundario??0)>0))) return <Center h={180}><Text c="dimmed" size="sm">Não há valores para esta visualização.</Text></Center>;
        if(escolhido==="medidor") return medidor==null?<Center h={altura}><Text c="dimmed">Não há base para calcular o percentual.</Text></Center>:<MedidorExpressivo valor={medidor}/>;
        if(escolhido==="anel")return <AnelComposicao dados={dados} total={total}/>;
        if(escolhido==="rosca") return <AreaGrafico altura={altura}>{largura=><PieChart width={largura} height={altura}><Pie data={dados.filter(d=>d.valor>0)} dataKey="valor" nameKey="nome" innerRadius="53%" outerRadius={mobile?"76%":"82%"} paddingAngle={2} isAnimationActive={!reduzir} label={mobile?false:({percent})=>percent!=null&&percent>=.05?`${Math.round(percent*100)}%`:""} labelLine={!mobile}>{dados.filter(d=>d.valor>0).map((d,i)=><Cell key={d.id} fill={d.cor??cores[i%cores.length]} fillOpacity={!selecionadoId||d.id===selecionadoId?1:.48}/>)}</Pie>{tooltip}<Legend layout={mobile?"vertical":"horizontal"} align="center" verticalAlign="bottom" wrapperStyle={{fontSize:mobile?13:12}} formatter={value=>{const d=dados.find(item=>item.nome===String(value));return mobile&&d&&total>0?`${d.nome} · ${(d.valor/total*100).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`:String(value);}}/></PieChart>}</AreaGrafico>;
        if(escolhido==="pontos"||escolhido==="bolhas") {
            const pontos=dados.map((d,i)=>({...d,x:d.dia??i+1,z:d.valor}));
            return <AreaGrafico altura={altura}>{largura=><ScatterChart width={largura} height={altura} margin={{top:16,right:mobile?12:22,bottom:16,left:mobile?0:8}}><CartesianGrid stroke="var(--mantine-color-default-border)" strokeDasharray="3 5"/><XAxis type="number" dataKey="x" name={id==="pagamentos"?"Data":"Posição"} tickFormatter={v=>id==="pagamentos"&&Number.isFinite(Number(v))?new Date(Number(v)*86400000).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",timeZone:"UTC"}):String(v)} allowDecimals={false} tick={{fontSize:11,fill:"var(--mantine-color-dimmed)"}}/><YAxis type="number" dataKey="valor" name={rotulo} tickFormatter={abreviar} width={mobile?34:60} tick={{fontSize:mobile?12:11,fill:"var(--mantine-color-dimmed)"}}/><ZAxis type="number" dataKey={escolhido==="bolhas"?"z":undefined} range={escolhido==="bolhas"?[45,900]:[55,55]}/><Tooltip cursor={{strokeDasharray:"3 3"}} content={({active,payload})=>{const p=payload?.[0]?.payload as Linha|undefined;return active&&p?<Card withBorder padding="xs"><Text fw={700} size="sm">{p.nome}</Text><Text size="xs">{moeda(p.valor)}</Text></Card>:null;}}/><Scatter name={rotulo} data={pontos} fill="var(--mantine-primary-color-5)" isAnimationActive={!reduzir}>{pontos.map((p,i)=><Cell key={p.id} fill={cores[i%cores.length]} fillOpacity={!selecionadoId||p.id===selecionadoId?1:.42}/>)}</Scatter></ScatterChart>}</AreaGrafico>;
        }
        return <AreaGrafico altura={altura}>{largura=><ComposedChart width={largura} height={altura} data={dados} margin={{top:26,right:mobile?8:12,bottom:mobile?18:12,left:0}}><defs><linearGradient id={grad} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cores[0]} stopOpacity={.65}/><stop offset="100%" stopColor={cores[0]} stopOpacity={.05}/></linearGradient></defs><CartesianGrid stroke="var(--mantine-color-default-border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="nome" tick={{fontSize:mobile?12:11,fill:"var(--mantine-color-dimmed)"}} interval={mobile?"preserveStartEnd":0} tickFormatter={v=>mobile&&v==="Sem vencimento"?"Sem data":String(v).length>(mobile?10:14)?String(v).slice(0,mobile?8:12)+"…":String(v)}/><YAxis tickFormatter={abreviar} tick={{fontSize:mobile?12:11,fill:"var(--mantine-color-dimmed)"}} width={mobile?34:50}/>{tooltip}{(!mobile||serie2||escolhido==="combinado")&&<Legend wrapperStyle={{fontSize:mobile?13:12}}/>}{selecionado && <ReferenceLine x={selecionado.nome} stroke="var(--mantine-primary-color-5)" strokeWidth={2} strokeDasharray="5 4"/>}{escolhido==="barras"||escolhido==="combinado"?<Bar name={rotulo} dataKey="valor" fill={cores[0]} radius={[6,6,0,0]} isAnimationActive={!reduzir}>{dados.some(d=>d.cor)&&dados.map((d,i)=><Cell key={d.id} fill={d.cor??cores[i%cores.length]}/>)}{dados.length<=6&&<LabelList dataKey="valor" position="top" formatter={v=>abreviar(Number(v))} fill="var(--mantine-color-text)" fontSize={mobile?12:11}/>}</Bar>:escolhido==="area"?<Area type="linear" name={rotulo} dataKey="valor" stroke={cores[0]} fill={`url(#${grad})`} strokeWidth={3} isAnimationActive={!reduzir}/>:<Line type="linear" name={rotulo} dataKey="valor" stroke={cores[0]} strokeWidth={3} dot={{r:4}} isAnimationActive={!reduzir}/>} {serie2&&(escolhido==="barras"?<Bar name={rotulo2} dataKey="secundario" fill={cores[1]} radius={[6,6,0,0]} isAnimationActive={!reduzir}/>:escolhido==="area"?<Area type="linear" name={rotulo2} dataKey="secundario" stroke={cores[1]} fill={cores[1]} fillOpacity={.20} strokeWidth={3} isAnimationActive={!reduzir}/>:<Line type="linear" name={rotulo2} dataKey="secundario" stroke={cores[1]} strokeWidth={3} dot={{r:4}} isAnimationActive={!reduzir}/>)}{escolhido==="combinado"&&!serie2&&<Line type="linear" name="Acumulado no período" dataKey="acumulado" stroke={cores[1]} strokeWidth={3} isAnimationActive={!reduzir}/>}</ComposedChart>}</AreaGrafico>;
    };
    // Paginação local mantém as duas faces com a mesma altura sem scrollbar para séries normais.
    const linhasPagina=mobile?3:6;
    const paginas=Math.max(1,Math.ceil(dados.length/linhasPagina));
    const paginaAtual=Math.min(paginaTabela,paginas-1);
    const registrosPagina=dados.slice(paginaAtual*linhasPagina,(paginaAtual+1)*linhasPagina);
    const tabela=<div className="ex-tabela-face">{mobile?<div className="ex-tabela-mobile" aria-label="Valores exatos">{registrosPagina.map(d=><dl key={d.id} data-selecionado={d.id===selecionadoId}><div className="ex-tabela-referencia"><dt>Referência</dt><dd>{d.nome}</dd></div><div className="ex-tabela-valores"><div><dt>{rotulo}</dt><dd>{moeda(d.valor)}</dd></div>{serie2&&<div><dt>{rotulo2}</dt><dd>{moeda(d.secundario??0)}</dd></div>}</div></dl>)}</div>:<Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Referência</Table.Th><Table.Th>{rotulo}</Table.Th>{serie2&&<Table.Th>{rotulo2}</Table.Th>}</Table.Tr></Table.Thead><Table.Tbody>{registrosPagina.map(d=><Table.Tr key={d.id} data-selecionado={d.id===selecionadoId}><Table.Td>{d.nome}</Table.Td><Table.Td>{moeda(d.valor)}</Table.Td>{serie2&&<Table.Td>{moeda(d.secundario??0)}</Table.Td>}</Table.Tr>)}</Table.Tbody></Table>}{paginas>1&&<Group justify="space-between" gap="xs" className="ex-tabela-paginacao"><Button size="compact-xs" variant="light" disabled={paginaAtual===0} onClick={()=>setPaginaTabela(paginaAtual-1)}>Anterior</Button><Text size="xs" c="dimmed">{paginaAtual+1} / {paginas}</Text><Button size="compact-xs" variant="light" disabled={paginaAtual===paginas-1} onClick={()=>setPaginaTabela(paginaAtual+1)}>Próxima</Button></Group>}</div>;
    const conteudo=()=><Stack gap="sm" className="ex-chart-conteudo">
        <div className="ex-chart-toolbar"><Select label="Visualização" size="sm" value={escolhido} allowDeselect={false} onChange={trocar} data={modos.map(m=>({value:m,label:rotulos[m]}))}/><Button variant="light" size="sm" leftSection={expandido?<IconMinimize size={16}/>:<IconMaximize size={16}/>} onClick={()=>setExpandido(v=>!v)}>{expandido?"Recolher":"Expandir gráfico"}</Button></div>
        {acoes && <div className="ex-chart-consulta">{acoes}</div>}
        <div className="ex-flip-cabecalho"><Group gap={7}><span className="ex-flip-icon">{virado?<IconTable size={19}/>:<IconChartBar size={19}/>}</span><Text fw={700} size="sm">{virado?"Valores exatos":"Visualização gráfica"}</Text></Group>{!mobile&&<Button size="xs" variant="light" aria-pressed={virado} leftSection={<IconRotateClockwise size={16}/>} onClick={()=>setVirado(v=>!v)}>{virado?"Voltar ao gráfico":"Virar · valores exatos"}</Button>}</div>
        <div ref={refPlot} className="ex-flip-viewport" data-virado={virado} data-modo={escolhido} data-paginado={paginas>1}><div className="ex-flip-inner"><div className="ex-flip-face ex-flip-front" aria-hidden={virado} inert={virado}>{desenhar(Math.max(1,Math.floor(alturaPlot||300)))}</div><div className="ex-flip-face ex-flip-back" aria-hidden={!virado} inert={!virado}>{tabela}</div></div></div>
        {mobile&&<button type="button" className="ex-flip-borda" aria-pressed={virado} onClick={()=>setVirado(v=>!v)}><IconRotateClockwise size={17} aria-hidden="true"/><span>{virado?"Voltar ao gráfico":"Virar para ver os valores"}</span></button>}
    </Stack>;
    return <Card withBorder className={`ex-chart ${className??""}`}><Stack gap="sm"><Text fw={800} size="lg">{titulo}</Text><Text size="xs" c="dimmed">{descricao}</Text>{!expandido&&conteudo()}{expandido&&<Text size="sm" c="dimmed">Visualização expandida.</Text>}</Stack><Modal opened={expandido} onClose={()=>setExpandido(false)} title={titulo} fullScreen classNames={{content:"ex-chart-modal",body:"ex-chart-modal-body",header:"ex-chart-modal-header"}}><Text size="xs" c="dimmed" mb="xs">{descricao}</Text>{expandido&&conteudo()}</Modal></Card>;
}

export function SerieExpressiva({meses,previsao,titulo,onMes,onRecebido,mesAtual,controle,className}: {meses:{mes:string;recebido:string;previsto?:string}[];previsao:boolean;titulo:string;onMes?:(m:string)=>void;onRecebido?:(m:string)=>void;mesAtual?:string;controle?:ReactNode;className?:string}) {
    const [mes,setMes]=useState("");const escolhido=meses.some(m=>m.mes===mes)?mes:mesAtual && meses.some(m=>m.mes===mesAtual)?mesAtual:meses.at(-1)?.mes??"";
    const dados=meses.map((m,index)=>({
        id:m.mes,
        nome:`${m.mes.slice(5)}/${m.mes.slice(2,4)}`,
        valor:numero(m.recebido),
        secundario:numero(m.previsto),
        acumulado:meses.slice(0,index+1).reduce((total,item)=>total+numero(item.recebido),0),
    }));
    const registro=dados.find(d=>d.id===escolhido);
    return <PainelGrafico className={className} id={previsao?"previsao":"historico"} titulo={titulo} descricao={previsao?"Este mês + 5 meses. Recebimentos efetivos e saldos por vencimento, sem atrasados ou valores sem data.":"Pagamentos efetivos, sem anulados, incluindo o mês atual."} modos={previsao?["barras","linha","area","combinado"]:["barras","linha","area","pontos","combinado","rosca"]} dados={dados} serie2={previsao} rotulo="Recebido" selecionadoId={escolhido} acoes={<Stack gap="xs"><Group align="end" justify="space-between" gap="xs">{controle}<Select label="Mês em foco" size="sm" value={escolhido||null} allowDeselect={false} onChange={v=>setMes(v??"")} data={dados.map(d=>({value:d.id,label:d.nome}))}/></Group>{registro&&<div className="ex-mes-foco"><div><Text size="xs" c="dimmed">Recebido · {registro.nome}</Text><Text fw={800}>{moeda(registro.valor)}</Text></div>{previsao&&<div><Text size="xs" c="dimmed">A receber · {registro.nome}</Text><Text fw={800}>{moeda(registro.secundario??0)}</Text></div>}</div>}<Group gap="xs" wrap="wrap">{onMes&&<Button size="xs" variant="filled" disabled={!escolhido} onClick={()=>onMes(escolhido)}>{previsao?"Consultar vencimentos":"Consultar recebimentos"} ↗</Button>}{previsao&&onRecebido&&<Button size="xs" variant="light" disabled={!escolhido||!!mesAtual&&escolhido>mesAtual} onClick={()=>onRecebido(escolhido)}>Consultar recebimentos ↗</Button>}</Group><Text size="xs" c="dimmed">O mês em foco destaca os valores acima. Consultar abre os registros filtrados; a série mantém o período completo.</Text></Stack>}/>;
}
export function DistribuicaoExpressiva({grupos,tipo,selecionar}: {grupos:{id:string;nome:string;valor:string}[];tipo:"cliente"|"projeto";selecionar?:(id:string)=>void}) {
    const [grupo,setGrupo]=useState("");const dados=grupos.map(g=>({id:g.id,nome:g.nome,valor:numero(g.valor)}));const escolhido=grupos.some(g=>g.id===grupo&&g.id!=="outros")?grupo:grupos.find(g=>g.id!=="outros")?.id??"";
    return <PainelGrafico key={tipo} id={`distribuicao-${tipo}`} titulo={`Distribuição por ${tipo==='cliente'?"cliente":"projeto"}`} descricao="Todos os registros da seleção; até oito grupos e Outros (agrupados pela API). Nas bolhas, a posição é a ordem dos grupos e o tamanho representa o valor." modos={["barras","rosca","bolhas"]} dados={dados} acoes={<Group align="end"><Select label="Grupo" size="xs" value={escolhido||null} onChange={v=>setGrupo(v??"")} data={grupos.filter(g=>g.id!=="outros").map(g=>({value:g.id,label:g.nome}))}/>{selecionar&&<Button size="xs" variant="light" disabled={!escolhido} onClick={()=>selecionar(escolhido)}>Consultar ↗</Button>}</Group>}/>;
}
export function ComposicaoExpressiva({dados}: {dados:{atrasado:string;semData:string;totalPendente:string}}) {
    const total=numero(dados.totalPendente),atrasado=numero(dados.atrasado),semData=numero(dados.semData),comData=Math.max(0,total-semData);
    const linhas=[{id:"vencido",nome:"Atrasado",valor:atrasado,cor:"var(--mantine-color-red-5)"},{id:"a-vencer",nome:"Não vencido",valor:Math.max(0,comData-atrasado),cor:"var(--mantine-color-teal-5)"},{id:"sem-data",nome:"Sem vencimento",valor:semData,cor:"var(--mantine-color-yellow-6)"}];
    return <PainelGrafico id="composicao" titulo="Saúde e composição dos recebíveis" descricao="O medidor usa apenas saldos com vencimento; as demais visualizações incluem saldos sem data." modos={["rosca","barras","anel","medidor"]} dados={linhas} medidor={comData>0?Math.min(100,atrasado/comData*100):null}/>;
}
export function DispersaoPagamentos({itens,pagina}: {itens:{id:string;data:string|null;valor:string;projeto:string;anuladoEm:string|null}[];pagina:number}) {
    const dados=itens.filter(i=>!i.anuladoEm&&i.data&&Number(i.valor)>0).map(i=>({id:i.id,nome:`${i.data} · ${i.projeto}`,dia:Date.parse(`${i.data}T00:00:00Z`)/86400000,valor:numero(i.valor)}));
    return <PainelGrafico id="pagamentos" titulo="Dispersão de pagamentos" descricao={`Somente pagamentos válidos da página ${pagina} dos registros filtrados (até 25). Eixo X: data; eixo Y: valor. Não representa a seleção integral.`} modos={["pontos"]} dados={dados} rotulo="Pagamento"/>;
}
