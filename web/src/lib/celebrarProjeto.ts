// Somente depois de o servidor confirmar a transição de estado.
export function celebrarProjeto() {
    const raiz=document.documentElement;
    if(raiz.dataset.funiladorExpressivoDesktop!=="true"||raiz.dataset.funiladorMovimento==="reduzido"||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    void import("canvas-confetti").then(({default:confetti})=>{
        if(document.documentElement.dataset.funiladorExpressivoDesktop!=="true")return;
        void confetti({particleCount:85,spread:85,startVelocity:33,origin:{y:.68},ticks:140,zIndex:500,disableForReducedMotion:true});
    }).catch(()=>{});
}

