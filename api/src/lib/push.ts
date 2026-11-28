import * as webpush from "web-push";
import { createECDH } from "node:crypto";

export type InscricaoPush = { endpoint: string; p256dh: string; auth: string };

export function endpointPushValido(valor: unknown): valor is string {
    if (typeof valor !== "string" || valor.length > 2048) return false;
    try {
        const url = new URL(valor);
        const host = url.hostname;
        return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash &&
            url.href === valor && (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
            host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com"));
    } catch { return false; }
}

export function lerInscricaoPush(valor: unknown): InscricaoPush | null {
    if (!valor || typeof valor !== "object" || !("endpoint" in valor) || !("keys" in valor)) return null;
    const {endpoint, keys} = valor;
    if (!endpointPushValido(endpoint) || !keys || typeof keys !== "object" || !("p256dh" in keys) || !("auth" in keys)) return null;
    const {p256dh, auth} = keys;
    if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) ||
        typeof auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return null;
    try {
        const pub = Buffer.from(p256dh, "base64url");
        const secret = Buffer.from(auth, "base64url");
        if (pub.length !== 65 || pub[0] !== 4 || secret.length !== 16 || pub.toString("base64url") !== p256dh || secret.toString("base64url") !== auth) return null;
        const ecdh = createECDH("prime256v1");
        ecdh.generateKeys();
        ecdh.computeSecret(pub);
    } catch { return null; }
    return {endpoint, p256dh, auth};
}

function configuracaoVapid() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return null;
    try {
        const chave = createECDH("prime256v1");
        chave.setPrivateKey(Buffer.from(privateKey, "base64url"));
        if (chave.getPublicKey().toString("base64url") !== publicKey) return null;
        webpush.setVapidDetails(subject, publicKey, privateKey);
        return {publicKey, privateKey, subject};
    } catch { return null; }
}

export function chavePublicaPush(): string | null {
    return configuracaoVapid()?.publicKey ?? null;
}

export async function enviarPush(inscricao: InscricaoPush, categoria?: string): Promise<"enviado" | "expirado" | "falhou" | "indisponivel"> {
    const vapidDetails = configuracaoVapid();
    if (!vapidDetails) return "indisponivel";
    if (!endpointPushValido(inscricao.endpoint)) return "falhou";
    try {
        await webpush.sendNotification({endpoint: inscricao.endpoint, keys: {p256dh: inscricao.p256dh, auth: inscricao.auth}}, categoria ? JSON.stringify({categoria}) : undefined, {
            vapidDetails, TTL: 60, urgency: "normal", timeout: 8000,
        });
        return "enviado";
    } catch (erro) {
        const status = erro && typeof erro === "object" && "statusCode" in erro ? erro.statusCode : null;
        if (status === 404 || status === 410) return "expirado";
        // Nunca registrar endpoint, chaves, corpo ou cabeçalhos do serviço push.
        console.warn("Falha no envio Web Push", typeof status === "number" ? status : "sem status");
        return "falhou";
    }
}
