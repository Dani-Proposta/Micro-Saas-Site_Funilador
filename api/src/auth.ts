import { betterAuth } from "better-auth";
import { pool } from "./db.ts";
import { admin } from "better-auth/plugins";

const producao = process.env.NODE_ENV === "production";

function origemProducao(): string {
    const valor = process.env.BETTER_AUTH_URL;
    if (!valor) throw new Error("BETTER_AUTH_URL obrigatória em produção");
    const url = new URL(valor);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("BETTER_AUTH_URL deve ser uma origem HTTPS, sem caminho ou credenciais");
    }
    return url.origin;
}

const baseURL = producao ? origemProducao() : "http://localhost:5173";
if (producao && (process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error("BETTER_AUTH_SECRET obrigatória em produção (mínimo de 32 caracteres)");
}

export const auth = betterAuth({
    database: pool,
    baseURL,
    trustedOrigins: producao ? [baseURL] : ["http://localhost:5173/", "http://192.168.15.14:5173"],
    ...(producao ? {advanced: {
        useSecureCookies: true,
        ipAddress: {ipAddressHeaders: ["x-envoy-external-address"]},
    }} : {}),

    emailAndPassword: {enabled:true, disableSignUp:true, minPasswordLength:8, maxPasswordLength:128,},
    //alterações de perfil passam pela API com controle de intervalo
    disabledPaths: ["/update-user", "/admin/update-user"],
    session: {cookieCache: {enabled:false}},
    plugins: [admin()],
});