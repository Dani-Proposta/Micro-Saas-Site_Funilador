import express from "express";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db.ts";
import { chavePublicaPush, endpointPushValido, lerInscricaoPush, enviarPush } from "./push.ts";
import type { InscricaoPush } from "./push.ts";

type Limitar = (chave: string, limite: number) => void;
type Registro = InscricaoPush & {id: string};

// Montar depois de exigirConta; nenhuma identidade é aceita no corpo da requisição.
export function criarRotasPush(limitar: Limitar) {
    const router = express.Router();
    function permite(res: Response, chave: string, limite: number) {
        try { limitar(chave, limite); return true; }
        catch {res.set("Retry-After", "600"); res.status(429).json({erro:"Muitas tentativas. Tente novamente mais tarde."}); return false;}
    }
    router.use(async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const {usuarioId, sessaoId, contaAdmin} = res.locals;
            const acesso = await pool.query(`SELECT 1 FROM "session" s WHERE s.id = $1 AND s."userId" = $2 AND s."expiresAt" > clock_timestamp()
                AND ($3::boolean OR EXISTS (SELECT 1 FROM clientes c WHERE c.usuario_id = s."userId"))`, [sessaoId, usuarioId, contaAdmin]);
            if (!acesso.rows.length) {res.status(403).json({erro:"Sessão ou conta indisponível"}); return;}
            next();
        } catch {res.status(500).json({erro:"Não foi possível verificar a conta"});}
    });
    router.get("/config", (_req, res) => {
        const chavePublica = chavePublicaPush();
        res.json({disponivel: Boolean(chavePublica), chavePublica});
    });
    router.post("/status", async (req, res) => {
        const endpoint: unknown = req.body?.endpoint;
        if (!endpointPushValido(endpoint)) {res.status(400).json({erro:"Inscrição inválida"}); return;}
        try {
            const r = await pool.query(`SELECT 1 FROM inscricoes_push WHERE sessao_id = $1 AND endpoint = $2`, [res.locals.sessaoId, endpoint]);
            res.json({ativa: Boolean(r.rows.length)});
        } catch {res.status(500).json({erro:"Não foi possível consultar as notificações"});}
    });
    router.post("/inscricao", async (req, res) => {
        if (!permite(res, `push-inscricao:${res.locals.usuarioId}`, 20)) return;
        if (!chavePublicaPush()) {res.status(503).json({erro:"Push indisponível"}); return;}
        const inscricao = lerInscricaoPush(req.body);
        if (!inscricao) {res.status(400).json({erro:"Inscrição inválida ou serviço Push não suportado"}); return;}
        const db = await pool.connect();
        try {
            await db.query("BEGIN");
            const s = await db.query(`SELECT 1 FROM "session" WHERE id = $1 AND "userId" = $2 AND "expiresAt" > clock_timestamp() FOR UPDATE`, [res.locals.sessaoId,res.locals.usuarioId]);
            if (!s.rows.length) {await db.query("ROLLBACK"); res.status(401).json({erro:"Sessão indisponível"}); return;}
            const r = await db.query(`INSERT INTO inscricoes_push (sessao_id,endpoint,p256dh,auth)
                SELECT $1,$2,$3,$4 WHERE (SELECT count(*) FROM inscricoes_push WHERE sessao_id = $1) < 5
                    OR EXISTS (SELECT 1 FROM inscricoes_push WHERE sessao_id = $1 AND endpoint = $2)
                ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, atualizada_em = now()
                    WHERE inscricoes_push.sessao_id = EXCLUDED.sessao_id RETURNING id`, [res.locals.sessaoId,inscricao.endpoint,inscricao.p256dh,inscricao.auth]);
            if (!r.rows.length) {await db.query("ROLLBACK"); res.status(409).json({erro:"Inscrição indisponível. Desative e reative neste navegador."}); return;}
            await db.query("COMMIT");
            res.json({ativa:true});
        } catch {await db.query("ROLLBACK").catch(()=>{}); res.status(500).json({erro:"Não foi possível ativar as notificações"});}
        finally {db.release();}
    });
    router.delete("/inscricao", async (req, res) => {
        const endpoint: unknown = req.body?.endpoint;
        if (!endpointPushValido(endpoint)) {res.status(400).json({erro:"Inscrição inválida"}); return;}
        try {
            await pool.query(`DELETE FROM inscricoes_push WHERE sessao_id = $1 AND endpoint = $2`, [res.locals.sessaoId,endpoint]);
            res.json({ativa:false});
        } catch {res.status(500).json({erro:"Não foi possível desativar as notificações"});}
    });
    router.post("/teste", async (req, res) => {
        if (!permite(res, `push-teste:${res.locals.usuarioId}`, 5)) return;
        const endpoint: unknown = req.body?.endpoint;
        if (!endpointPushValido(endpoint)) {res.status(400).json({erro:"Inscrição inválida"}); return;}
        try {
            const r = await pool.query<Registro>(`SELECT p.id,p.endpoint,p.p256dh,p.auth FROM inscricoes_push p JOIN "session" s ON s.id = p.sessao_id
                WHERE p.sessao_id = $1 AND p.endpoint = $2 AND s."userId" = $3 AND s."expiresAt" > clock_timestamp()`, [res.locals.sessaoId,endpoint,res.locals.usuarioId]);
            const inscricao = r.rows[0];
            if (!inscricao) {res.status(404).json({erro:"Ative as notificações neste dispositivo"}); return;}
            const resultado = await enviarPush(inscricao);
            if (resultado === "expirado") {
                await pool.query(`DELETE FROM inscricoes_push WHERE id = $1 AND sessao_id = $2 AND endpoint = $3 AND p256dh = $4 AND auth = $5`, [inscricao.id,res.locals.sessaoId,inscricao.endpoint,inscricao.p256dh,inscricao.auth]);
                res.status(410).json({erro:"Inscrição expirada. Ative novamente."}); return;
            }
            if (resultado !== "enviado") {res.status(resultado === "indisponivel" ? 503 : 502).json({erro:"Não foi possível enviar o teste"}); return;}
            res.json({enviado:true});
        } catch {res.status(500).json({erro:"Não foi possível enviar o teste"});}
    });
    return router;
}
