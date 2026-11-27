import type { MantineColorsTuple } from "@mantine/core";

export const paletasAparencia = [
    {id:"neutra", nome:"Neutra", descricao:"Cinza original"},
    {id:"obsidiana", nome:"Obsidiana", descricao:"Preto e branco"},
    {id:"meia-noite", nome:"Meia-noite", descricao:"Azul profundo"},
    {id:"ametista", nome:"Ametista", descricao:"Violeta suave"},
    {id:"floresta", nome:"Floresta", descricao:"Verde profundo"},
] as const;

type Paleta = typeof paletasAparencia[number]["id"];

export const escalasPaleta: Record<Exclude<Paleta,"neutra">,{dark:MantineColorsTuple;gray:MantineColorsTuple}> = {
    obsidiana: {dark:["#f0f0f2","#d0d0d5","#a3a3ab","#73737d","#45454e","#28282e","#1a1a20","#101014","#0b0b0e","#070709"],gray:["#fafafa","#f1f1f4","#e4e4e9","#d0d0d8","#b5b5bf","#858590","#666671","#4c4c55","#303039","#17171d"]},
    "meia-noite": {dark:["#e6eefb","#c0d0e6","#96aac7","#667c9a","#3a506d","#273b55","#1d2b40","#121e30","#0c1524","#080f1b"],gray:["#f6f9fd","#eaf0f8","#dce6f3","#c6d5e8","#aabed7","#7e96b5","#526e91","#3b5271","#263b55","#14253a"]},
    ametista: {dark:["#f2eafa","#d9cae8","#b7a3cb","#85739c","#564565","#382b46","#2b2137","#1b1525","#140e1c","#0d0913"],gray:["#faf7fd","#f2edf8","#e8dff1","#d6c8e5","#bdabd2","#9b85b5","#745c92","#584570","#3e2e53","#241a32"]},
    floresta: {dark:["#e7f3ed","#c2d9ce","#99b7a8","#678b7b","#395b4c","#294438","#1d3329","#12251c","#0c1a14","#07110c"],gray:["#f5faf7","#e9f3ed","#d9e9df","#c3d8cb","#a6c3b2","#7c9e8b","#527963","#385b48","#263e32","#17291f"]},
};

export function obterEscalasPaleta(paleta:Paleta) { return paleta === "neutra" ? undefined : escalasPaleta[paleta]; }

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
    paleta: Paleta;
    estilo: "minimalista" | "moderno" | "expressivo";
    acento: typeof coresAparencia[number]["id"];
    densidade: "compacta" | "normal" | "confortavel";
    movimento: "sistema" | "reduzido";
};

export const aparenciaPadrao: Aparencia = {tema:"dark", paleta:"neutra", estilo:"moderno", acento:"grape", densidade:"normal", movimento:"sistema"};

export function normalizarAparencia(dados: Partial<Aparencia> | null | undefined): Aparencia {
    return {
        paleta: paletasAparencia.find(p=>p.id===dados?.paleta)?.id ?? "neutra",
        tema: dados?.tema === "light" || dados?.tema === "auto" ? dados.tema : "dark",
        estilo: dados?.estilo === "minimalista" || dados?.estilo === "expressivo" ? dados.estilo : "moderno",
        acento: coresAparencia.some(c => c.id === dados?.acento) ? dados!.acento! : "grape",
        densidade: dados?.densidade === "compacta" || dados?.densidade === "confortavel" ? dados.densidade : "normal",
        movimento: dados?.movimento === "reduzido" ? "reduzido" : "sistema",
    };
}
