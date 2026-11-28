import { pool } from '../db.ts';
import { chavePublicaPush, enviarPush } from './push.ts';
import type { InscricaoPush } from './push.ts';
import { categoriaPush } from './catalogo-push.ts';

type Evento = { id: string; tipo: string; titulo: string; recente: boolean };
type Destino = InscricaoPush & { id: string; sessao_id: string };
let iniciado = false;

// Um consumidor por processo; SKIP LOCKED evita que instâncias concorrentes
// reivindiquem o mesmo evento. Entrega best effort, sem repetir após reinício.
async function processar() {
    for (let i = 0; i < 10; i++) {
        const resultado = await pool.query<Evento>(`
            WITH pendente AS (
                SELECT id FROM public.notificacoes
                WHERE push_processada_em IS NULL
                ORDER BY criada_em, id LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            UPDATE public.notificacoes n SET push_processada_em = clock_timestamp()
            FROM pendente p WHERE n.id = p.id
            RETURNING n.id, n.tipo, n.titulo,
                n.criada_em >= clock_timestamp() - interval '5 minutes' AS recente
        `);
        const evento = resultado.rows[0];
        if (!evento) return;
        if (!evento.recente) continue;
        const destinos = await pool.query<Destino>(`
            SELECT p.id, p.sessao_id, p.endpoint, p.p256dh, p.auth
            FROM public.notificacoes n
            JOIN public.inscricoes_push p ON p.criada_em <= n.criada_em
            JOIN public.session s ON s.id = p.sessao_id
            JOIN public."user" u ON u.id = s."userId"
            WHERE n.id = $1 AND s."expiresAt" > clock_timestamp()
                AND (u.banned IS NOT TRUE OR u."banExpires" <= clock_timestamp())
                AND (
                    (n.publico = 'admin' AND 'admin' = ANY(string_to_array(u.role, ',')))
                    OR (n.publico = 'cliente' AND 'user' = ANY(string_to_array(u.role, ','))
                        AND NOT ('admin' = ANY(string_to_array(u.role, ',')))
                        AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = n.cliente_id AND c.usuario_id = u.id)
                        AND NOT EXISTS (SELECT 1 FROM public.usuarios_configuracoes cfg WHERE cfg.usuario_id = u.id AND cfg.senha_provisoria_ate IS NOT NULL))
                )
                AND NOT EXISTS (SELECT 1 FROM public.notificacoes_leituras l WHERE l.notificacao_id = n.id AND l.usuario_id = u.id)
                AND (n.mensagem_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.mensagens_leituras ml WHERE ml.mensagem_id = n.mensagem_id AND ml.usuario_id = u.id))
        `, [evento.id]);
        const categoria = categoriaPush(evento.tipo, evento.titulo);
        // Lotes limitados; não manter transação/conexão presa durante envio HTTP.
        for (let j = 0; j < destinos.rows.length; j += 5) {
            await Promise.all(destinos.rows.slice(j, j + 5).map(async (d) => {
                // Revalida inscrição e sessão imediatamente antes da entrega.
                const atual = await pool.query(`SELECT 1 FROM public.inscricoes_push p JOIN public.session s ON s.id = p.sessao_id
                    WHERE p.id = $1 AND p.sessao_id = $2 AND p.endpoint = $3 AND p.p256dh = $4 AND p.auth = $5
                        AND s."expiresAt" > clock_timestamp()`, [d.id, d.sessao_id, d.endpoint, d.p256dh, d.auth]);
                if (!atual.rows.length) return;
                const status = await enviarPush(d, categoria);
                if (status === 'expirado') await pool.query(`DELETE FROM public.inscricoes_push WHERE id = $1 AND sessao_id = $2 AND endpoint = $3 AND p256dh = $4 AND auth = $5`, [d.id,d.sessao_id,d.endpoint,d.p256dh,d.auth]);
            }));
        }
    }
}

export function iniciarProcessamentoPush() {
    if (iniciado || !chavePublicaPush()) return;
    iniciado = true;
    async function ciclo() {
        let intervalo = 15000;
        try { await processar(); }
        catch { console.warn('Processamento Push indisponível; notificações internas preservadas.'); intervalo = 60000; }
        finally { setTimeout(() => { void ciclo(); }, intervalo).unref(); }
    }
    void ciclo();
}
