import classes from "../styles/AssinaturaAteliezinho.module.css";

export function AssinaturaAteliezinho() {
    return (
        <footer className={classes.assinatura}>
            <img src={`${import.meta.env.BASE_URL}brand/ateliezinho-assinatura.svg`} alt="" width={48} height={35} loading="lazy" decoding="async"/>
            <span>Desenvolvido no <strong>Ateliêzinho</strong></span>
        </footer>
    );
}
