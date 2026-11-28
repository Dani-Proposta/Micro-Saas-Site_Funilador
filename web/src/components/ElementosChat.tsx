import { SegmentedControl } from "@mantine/core";
import { useAparencia } from "../lib/contextoAparencia";
import { IconMessageCircle, IconFolder, IconUser, IconSearch, IconArrowDown, IconChecks, IconFilePlus, IconEyeOff, IconEye, IconArchive, IconRestore, IconEdit, IconDotsVertical, IconPlus } from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import chat from "../styles/Chat.module.css";

const caminhos = {
    geral: "M4 5h16v12H9l-5 4V5z M8 9h8 M8 13h5",
    projeto: "M3 6h7l2 2h9v12H3z",
    avulsa: "M21 11a8 8 0 0 1-8 8H4l2-4a8 8 0 1 1 15-4z",
    cliente: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2",
    busca: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M14.5 14.5 21 21",
    naoLida: "M12 3v13m-5-5 5 5 5-5 M4 21h16",
    lida: "m3 12 4 4 9-9 M12 16l9-9",
    proposta: "M6 3h9l4 4v14H6z M15 3v5h4 M9 14h6 M12 11v6",
    ocultar: "M3 3l18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9 5.5A10 10 0 0 1 12 5c5 0 8 4 10 7a16 16 0 0 1-3 3.5 M6 6.5A17 17 0 0 0 2 12c2 3 5 7 10 7a10 10 0 0 0 4-.8",
    exibir: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    arquivo: "M4 8h16v13H4z M3 3h18v5H3z M9 12h6",
    restaurar: "M4 10a8 8 0 1 1 2 8 M4 4v6h6",
    editar: "m4 16 12-12 4 4L8 20H4z M13 7l4 4",
    menu: "M12 5h.01 M12 12h.01 M12 19h.01",
    adicionar: "M12 5v14 M5 12h14",
} as const;

const iconesModernos = {geral:IconMessageCircle, projeto:IconFolder, avulsa:IconMessageCircle, cliente:IconUser, busca:IconSearch, naoLida:IconArrowDown, lida:IconChecks, proposta:IconFilePlus, ocultar:IconEyeOff, exibir:IconEye, arquivo:IconArchive, restaurar:IconRestore, editar:IconEdit, menu:IconDotsVertical, adicionar:IconPlus};
export function IconeChat({nome, tamanho = 16}: {nome: keyof typeof caminhos; tamanho?: number}) {
    const {aparencia} = useAparencia();

    if (aparencia.estilo === "moderno") {
        const Icone = iconesModernos[nome];
        return <Icone size={tamanho} stroke={1.75} aria-hidden="true" className={chat.iconeChat}/>;
    }
    return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={nome === "menu" ? 3.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={chat.iconeChat}><path d={caminhos[nome]}/></svg>;
}

type OpcaoFiltro = {label: string; value: string; quantidade: number};

export function FiltroConversas({opcoes, value, onChange, disabled}: {opcoes: OpcaoFiltro[]; value: string; onChange: (valor: string) => void; disabled?: boolean}) {
    const {ref, width} = useElementSize<HTMLDivElement>();
    const vertical = width > 0 && width < (opcoes.length === 3 ? 210 : 146);
    const temContagem = opcoes.some(opcao => opcao.quantidade > 0);
    return <div ref={ref} className={chat.filtros}>
        <SegmentedControl fullWidth size="xs" aria-label="Filtrar conversas" orientation={vertical ? "vertical" : "horizontal"} value={value} onChange={onChange} disabled={disabled}
            data={opcoes.map(opcao => ({
                value: opcao.value,
                label: <span className={chat.filtroConteudo}>
                    <span>{opcao.label}</span>
                    {temContagem && <span className={chat.filtroContagem} aria-hidden={opcao.quantidade === 0 ? true : undefined}>{opcao.quantidade > 0 ? `(${opcao.quantidade})` : "\u00a0"}</span>}
                </span>,
            }))}/>
    </div>;
}
