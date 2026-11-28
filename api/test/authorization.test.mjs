import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Recebe somente contas fictícias de development pelo stdin local.
// Nunca registrar credenciais, cookies, respostas ou identificadores de clientes.
const BASE = 'http://localhost:3001';
const ORIGIN = 'http://localhost:5173';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let contas;
try {
    contas = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(contas) || contas.length !== 2 || contas.some(c =>
        typeof c.email !== 'string' || !c.email || typeof c.password !== 'string' || !c.password)) throw Error();
} catch {
    console.error('Execute pelo script local run-authorization.ps1 com duas contas de teste.');
    process.exit(1);
}

async function request(path, { cookie, method = 'GET', body } = {}) {
    const headers = { Origin: ORIGIN };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual', signal: AbortSignal.timeout(15000) });
}
async function json(path, cookie, expected = 200) {
    const r = await request(path, { cookie });
    assert.equal(r.status, expected, `HTTP inesperado na verificacao (esperado ${expected})`);
    assert.match(r.headers.get('content-type') ?? '', /^application\/json\b/i);
    return r.json();
}
async function login(conta) {
    const r = await request('/api/auth/sign-in/email', { method: 'POST', body: conta });
    await r.arrayBuffer();
    assert.equal(r.status, 200, 'Falha no login de uma conta de teste. Confira a conta localmente.');
    const cookie = r.headers.getSetCookie().map(c => c.split(';', 1)[0]).join('; ');
    assert.ok(Boolean(cookie), 'Login nao retornou cookie de sessao.');
    return cookie;
}
function idList(items, label) {
    assert.ok(Array.isArray(items) && items.length > 0, `${label}: prepare pelo menos um registro proprio de teste.`);
    assert.ok(items.every(x => typeof x.id === 'string' && UUID.test(x.id)), `${label}: identificadores invalidos.`);
    return new Set(items.map(x => x.id));
}
function disjoint(a, b, label) {
    assert.ok([...a].every(id => !b.has(id)), `${label}: registros aparecem para os dois clientes.`);
}

test('Funilador: autorizacao autenticada local', async t => {
    const cookies = [];
    t.after(async () => {
        let falha = false;
        for (const cookie of cookies) {
            try {
                const r = await request('/api/auth/sign-out', { cookie, method: 'POST', body: {} });
                await r.arrayBuffer();
                if (!r.ok) falha = true;
            } catch { falha = true; }
        }
        assert.ok(!falha, 'Nao foi possivel encerrar todas as sessoes de teste; revogue-as localmente.');
    });
    for (const conta of contas) cookies.push(await login(conta));
    contas = null;
    const [a, b] = cookies;
    const [meA, meB] = await Promise.all([json('/api/me', a), json('/api/me', b)]);
    assert.ok(UUID.test(meA.id) && UUID.test(meB.id) && meA.id !== meB.id,
        'Use duas contas de clientes distintos, vinculadas e sem troca de senha obrigatoria.');

    await t.test('ambos os clientes sao bloqueados nas areas administrativas', async () => {
        for (const cookie of cookies) for (const path of ['/api/dashboard', '/api/clientes', '/api/projetos', '/api/conversas']) {
            const denied = await json(path, cookie, 403);
            assert.equal(denied.erro, 'Acesso restrito');
        }
    });
    await t.test('projetos e marcos: acesso proprio e bloqueio cruzado', async () => {
        const pa = idList(await json('/api/me/projetos', a), 'Cliente A: projetos ativos');
        const pb = idList(await json('/api/me/projetos', b), 'Cliente B: projetos ativos');
        disjoint(pa, pb, 'Projetos');
        for (const [own, other, cookie] of [[pa, pb, a], [pb, pa, b]]) {
            const id = [...own][0];
            const info = await json(`/api/me/projetos/${id}/marcos`, cookie);
            assert.ok(info.id === id && Array.isArray(info.marcos), 'Resposta de marcos inconsistente.');
            for (const foreign of other) {
                const denied = await json(`/api/me/projetos/${foreign}/marcos`, cookie, 404);
                assert.equal(denied.erro, 'Projeto não encontrado');
            }
        }
    });
    await t.test('conversas: acesso proprio e bloqueio cruzado', async () => {
        const ca = idList(await json('/api/me/conversas?todas=true', a), 'Cliente A: conversas');
        const cb = idList(await json('/api/me/conversas?todas=true', b), 'Cliente B: conversas');
        disjoint(ca, cb, 'Conversas');
        for (const [own, other, cookie] of [[ca, cb, a], [cb, ca, b]]) {
            const info = await json(`/api/me/conversas/${[...own][0]}/mensagens?estado=true`, cookie);
            assert.ok(Array.isArray(info.mensagens), 'Resposta de historico inconsistente.');
            for (const foreign of other) {
                const denied = await json(`/api/me/conversas/${foreign}/mensagens?estado=true`, cookie, 404);
                assert.equal(denied.erro, 'Conversa ou cursor não encontrado.');
                assert.ok(!Object.hasOwn(denied, 'mensagens'), 'Resposta indevida contem mensagens.');
            }
        }
    });
});
