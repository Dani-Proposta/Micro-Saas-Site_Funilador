export const coresAparencia = [
    {id:"grape", nome:"Orquídea", cor:"#862e9c"},
    {id:"violet", nome:"Violeta", cor:"#6741d9"},
    {id:"blue", nome:"Azul", cor:"#1864ab"},
    {id:"cyan", nome:"Ciano", cor:"#0b7285"},
    {id:"teal", nome:"Turquesa", cor:"#087f5b"},
    {id:"orange", nome:"Laranja", cor:"#b54c06"},
    {id:"pink", nome:"Rosa", cor:"#a61e4d"},
] as const;

export type Aparencia = {
    tema: "light" | "dark" | "auto";
    estilo: "minimalista" | "moderno" | "expressivo";
    acento: typeof coresAparencia[number]["id"];
    densidade: "compacta" | "normal" | "confortavel";
    movimento: "sistema" | "reduzido";
};

export const aparenciaPadrao: Aparencia = {tema:"dark", estilo:"moderno", acento:"grape", densidade:"normal", movimento:"sistema"};

export function normalizarAparencia(dados: Partial<Aparencia> | null | undefined): Aparencia {
    return {
        tema: dados?.tema === "light" || dados?.tema === "auto" ? dados.tema : "dark",
        estilo: dados?.estilo === "minimalista" || dados?.estilo === "expressivo" ? dados.estilo : "moderno",
        acento: coresAparencia.some(c => c.id === dados?.acento) ? dados!.acento! : "grape",
        densidade: dados?.densidade === "compacta" || dados?.densidade === "confortavel" ? dados.densidade : "normal",
        movimento: dados?.movimento === "reduzido" ? "reduzido" : "sistema",
    };
}
