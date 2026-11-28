import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:3001';
const ORIGIN = 'http://localhost:5173';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let input;
try {
    input = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
    if (input.confirmacao !== 'DEVELOPMENT' || ![input.admin, input.cliente].every(c =>
        typeof c?.email === 'string' && c.email && typeof c?.password === 'string' && c.password)) throw Error();
} catch {
    console.error('Execute run-integrity.ps1 somente em development, com contas de teste.');
    process.exit(1);
}
async function request(path, cookie, method = 'GET', body) {
    const headers = { Origin: ORIGIN };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(20000) });
}
async function api(path, cookie, method = 'GET', body, status = 200) {
    const r = await request(path, cookie, method, body);
    assert.equal(r.status, status, `${method}: HTTP esperado ${status}`);
    assert.match(r.headers.get('content-type') ?? '', /^application\/json\b/i);
    return r.json();
}
async function login(c) {
    const r = await request('/api/auth/sign-in/email', null, 'POST', c);
    await r.arrayBuffer();
    assert.equal(r.status, 200, 'Falha no login da conta de teste.');
    const cookie = r.headers.getSetCookie().map(c => c.split(';', 1)[0]).join('; ');
    assert.ok(cookie, 'Sessao nao retornada.');
    return cookie;
}
function uuid(v) { assert.ok(typeof v === 'string' && UUID.test(v), 'Identificador de teste invalido.'); return v; }
function money(v, expected) { assert.ok(v !== null && v !== undefined && v !== '' && Number(v) === expected, `Valor esperado: ${expected}`); }

// As escritas sao feitas apenas em um projeto novo, com identificador unico.
// O arquivamento preserva o historico; nenhum registro financeiro e apagado.
test('Funilador: integridade operacional local', async t => {
    const cookies = [];
    let admin, client, project, conversation, payment, milestone;
    const title = `AUDITORIA 06.6.3 - ${randomUUID()}`;
    t.after(async () => {
        let failed = false;
        const cleanup = async (path, method, body) => {
            try { const r = await request(path, admin, method, body); await r.arrayBuffer(); if (!r.ok) failed = true; }
            catch { failed = true; }
        };
        if (conversation) await cleanup(`/api/conversas/${conversation}/arquivar`, 'PATCH');
        if (project) await cleanup(`/api/projetos/${project}/arquivar`, 'PATCH');
        for (const cookie of cookies) {
            try { const r = await request('/api/auth/sign-out', cookie, 'POST', {}); await r.arrayBuffer(); if (!r.ok) failed = true; }
            catch { failed = true; }
        }
        if (failed) console.error('Limpeza incompleta. Confira o projeto ficticio pelo titulo: ' + title);
        assert.ok(!failed, 'Falha no arquivamento ou encerramento de sessoes.');
    });
    admin = await login(input.admin); cookies.push(admin);
    client = await login(input.cliente); cookies.push(client);
    input = null;
    const accountAdmin = await api('/api/conta', admin);
    const accountClient = await api('/api/conta', client);
    assert.equal(accountAdmin.admin, true, 'A primeira conta deve ser administrativa.');
    assert.equal(accountClient.admin, false, 'A segunda conta deve ser cliente.');
    const clientId = uuid((await api('/api/me', client)).id);
    const created = await api('/api/projetos', admin, 'POST', { clienteId: clientId, titulo: title, descricao: 'Projeto ficticio de regressao automatizada.' }, 201);
    project = uuid(created.id);
    assert.ok(created.clienteId === clientId && created.titulo === title, 'Projeto ficticio inconsistente.');
    const p = `/api/projetos/${project}`;
    await api(`${p}/comercial`, admin, 'PATCH', { valorAcordado: '100.00', prazoAcordado: null, prioridade: null, progresso: null, tecnologias: [], observacoesInternas: null });
    conversation = uuid((await api('/api/conversas', admin, 'POST', { clienteId: clientId, projetoId: project, tipo: 'projeto' }, 201)).id);
    const ca = `/api/conversas/${conversation}/propostas`;
    const cc = `/api/me/conversas/${conversation}/propostas`;
    const summary = () => api(`${p}/marcos`, admin);
    const proposal = async (titulo, valor) => uuid((await api(ca, admin, 'POST', { tipo: 'marco', titulo, descricao: 'Teste automatizado.', valor }, 201)).id);
    const decision = (id, acao, cookie, path, status) => api(`${path}/${id}`, cookie, 'PATCH', { acao }, status);
    const getMilestone = async () => {
        const result = await summary();
        assert.ok(Array.isArray(result.marcos) && result.marcos.length === 1 && result.marcos[0].id === milestone, 'Quantidade ou identidade de marcos inconsistente.');
        return result.marcos[0];
    };

    await t.test('proposta acima do acordo nao cria marco nem altera total', async () => {
        const id = await proposal('Excesso ficticio', '100.01');
        await decision(id, 'aceitar', client, cc, 409);
        const s = await summary();
        assert.equal(s.marcos.length, 0);
        money(s.valorAcordado, 100);
        await decision(id, 'retirar', admin, ca, 200);
    });
    await t.test('aceitacao legitima cria um unico marco mesmo com repeticao', async () => {
        const id = await proposal('Marco ficticio', '100.00');
        const accepted = await decision(id, 'aceitar', client, cc, 200);
        assert.equal(accepted.status, 'aceita');
        await decision(id, 'aceitar', client, cc, 409);
        const s = await summary();
        assert.equal(s.marcos.length, 1);
        milestone = uuid(s.marcos[0].id);
        assert.equal(s.marcos[0].acordado, true);
        money(s.valorAcordado, 100);
        money(s.marcos[0].saldo, 100);
    });
    await t.test('recebimento idempotente e excesso de saldo bloqueado', async () => {
        assert.ok(milestone, 'Marco de teste nao foi criado.');
        payment = randomUUID();
        const path = `${p}/marcos/${milestone}/pagamentos`;
        const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const body = { pagamentoId: payment, valor: '30.00', recebidoEm: date };
        await api(path, admin, 'POST', body, 201);
        await api(path, admin, 'POST', body, 201);
        await api(path, admin, 'POST', { ...body, valor: '31.00' }, 409);
        await api(path, admin, 'POST', { ...body, pagamentoId: randomUUID(), valor: '70.01' }, 409);
        const m = await getMilestone();
        money(m.recebido, 30); money(m.saldo, 70);
        assert.equal(m.pagamentos.length, 1);
        assert.ok(m.pagamentos[0].id === payment && m.pagamentos[0].anuladoEm === null, 'Recebimento inconsistente.');
    });
    await t.test('anulacao preserva historico e restaura saldo', async () => {
        assert.ok(milestone && payment, 'Recebimento ficticio nao foi criado.');
        const path = `${p}/marcos/${milestone}/pagamentos/${payment}/anular`;
        await api(path, admin, 'PATCH');
        await api(path, admin, 'PATCH', undefined, 409);
        const m = await getMilestone();
        money(m.recebido, 0); money(m.saldo, 100);
        assert.equal(m.pagamentos.length, 1);
        assert.ok(m.pagamentos[0].id === payment && Boolean(m.pagamentos[0].anuladoEm), 'Historico de anulacao ausente.');
        await api(`${p}/marcos/${milestone}`, admin, 'DELETE', undefined, 409);
        const preserved = await getMilestone();
        assert.equal(preserved.pagamentos.length, 1);
    });
});
