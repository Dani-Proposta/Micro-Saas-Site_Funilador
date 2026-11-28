import test from "node:test";
import assert from "node:assert/strict";

// Somente o backend local de development. Não enviar credenciais ou dados reais.
const BASE = "http://localhost:3001";
const ORIGIN = "http://localhost:5173";
const jsonHeaders = { Origin: ORIGIN, "Content-Type": "application/json" };

async function request(path, options = {}) {
    const response = await fetch(`${BASE}${path}`, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    return { response, body };
}

function expectJson(result, status, expected) {
    assert.equal(result.response.status, status, result.body);
    assert.match(result.response.headers.get("content-type") ?? "", /^application\/json\b/i);
    const data = JSON.parse(result.body);
    if (expected !== undefined) assert.deepEqual(data, expected);
    return data;
}

test("Funilador: segurança da API local", async (t) => {
    // Falha imediatamente se o serviço local não estiver disponível.
    const health = await request("/api/health");
    expectJson(health, 200, { status: "ok" });

    await t.test("respostas da API não armazenadas em cache; sem X-Powered-By", () => {
        assert.equal(health.response.headers.get("cache-control"), "no-store");
        assert.equal(health.response.headers.has("x-powered-by"), false);
    });

    await t.test("área do cliente exige sessão", async () => {
        expectJson(await request("/api/me"), 401);
        expectJson(await request("/api/me/projetos"), 401);
    });

    await t.test("área administrativa exige sessão", async () => {
        expectJson(await request("/api/dashboard"), 401);
        expectJson(await request("/api/clientes"), 401);
    });

    await t.test("origem desconhecida, ausente e cross-site são rejeitadas", async () => {
        for (const headers of [
            { "Content-Type": "application/json", Origin: "https://example.invalid" },
            { "Content-Type": "application/json" },
            { ...jsonHeaders, "Sec-Fetch-Site": "cross-site" },
        ]) {
            expectJson(await request("/api/me/solicitacoes", {
                method: "POST", headers, body: "{}",
            }), 403, { erro: "Origem não autorizada" });
        }
    });

    await t.test("origem legítima não substitui autenticação", async () => {
        expectJson(await request("/api/me/solicitacoes", {
            method: "POST", headers: jsonHeaders, body: "{}",
        }), 401);
    });

    await t.test("cadastro público não está disponível", async () => {
        expectJson(await request("/api/auth/sign-up/email", {
            method: "POST", headers: jsonHeaders, body: "{}",
        }), 404, { erro: "Rota indisponível" });
    });

    await t.test("JSON inválido não expõe detalhes internos", async () => {
        expectJson(await request("/api/recuperacao", {
            method: "POST", headers: jsonHeaders, body: "{",
        }), 400, { erro: "Requisição inválida" });
    });

    await t.test("convite inválido é bloqueado na 16ª tentativa", async () => {
        // Requer contador vazio (reiniciar o backend antes e após esta suíte).
        // O token deliberadamente inválido não chega a uma consulta de convite.
        for (let i = 1; i <= 16; i++) {
            const result = await request("/api/convite/invalido/aceitar", {
                method: "POST", headers: jsonHeaders, body: "{}",
            });
            assert.equal(result.response.status, i === 16 ? 429 : 404,
                `Tentativa ${i}: ${result.body}. Reinicie o backend se o contador não estiver vazio.`);
            if (i === 16) {
                assert.match(result.response.headers.get("retry-after") ?? "", /^\d+$/);
                expectJson(result, 429);
            }
        }
    });
});
