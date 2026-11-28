import { useSyncExternalStore } from "react";
import { authClient } from "./auth-client";

export type PreferenciasExpressivo = {navDesktop:"dock"|"card"; navMobile:"bubble"|"staggered"; fundoDesktop:"liquid"|"prisma"|"aurora"};
const padrao:PreferenciasExpressivo = {navDesktop:"dock",navMobile:"bubble",fundoDesktop:"liquid"};
const evento = "funilador-expressivo-preferencias";
function subscribe(notificar:()=>void) {
    window.addEventListener(evento,notificar);window.addEventListener("storage",notificar);
    return ()=>{window.removeEventListener(evento,notificar);window.removeEventListener("storage",notificar);};
}
const vazio = ()=>"";
export function usePreferenciasExpressivo() {
    const {data} = authClient.useSession();
    const chave = data?.user.id ? `funilador:expressivo:v1:${data.user.id}` : null;
    const raw = useSyncExternalStore(subscribe,()=>{try{return chave ? localStorage.getItem(chave) ?? "" : "";}catch{return "";}},vazio);
    let valor = padrao;
    try {const p = JSON.parse(raw);valor={navDesktop:p.navDesktop === "card" ? "card" : "dock",navMobile:p.navMobile === "staggered" ? "staggered" : "bubble",fundoDesktop:p.fundoDesktop === "prisma" || p.fundoDesktop === "aurora" ? p.fundoDesktop : "liquid"};}catch{/* configurações antigas ou ausentes */}
    function salvar(proximo:PreferenciasExpressivo) {if(!chave)return false;try{localStorage.setItem(chave,JSON.stringify(proximo));window.dispatchEvent(new Event(evento));return true;}catch{return false;}}
    return {valor,salvar,chave};
}
