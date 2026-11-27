export type OrdemRegistros = "padrao" | "recentes" | "antigos" | "titulo";

export const opcoesOrdenacao = [
    {value: "padrao", label: "Padrão"},
    {value: "recentes", label: "Mais recentes"},
    {value: "antigos", label: "Mais antigos"},
    {value: "titulo", label: "Título (A–Z)"},
];

export function ordenarRegistros<T extends {titulo: string; criadaEm: string}>(registros: T[], ordem: OrdemRegistros): T[] {
    if (ordem === "padrao") return registros;
    return [...registros].sort((a, b) => {
        const titulo = a.titulo.localeCompare(b.titulo, "pt-BR", {sensitivity: "base"});
        if (ordem === "titulo") return titulo;
        const diferenca = Date.parse(a.criadaEm) - Date.parse(b.criadaEm);
        return (Number.isFinite(diferenca) ? (ordem === "recentes" ? -diferenca : diferenca) : 0) || titulo;
    });
}
