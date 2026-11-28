// A API protegida responde 401 quando a sessão deixa de existir.
// Não intercepta o Better Auth, nem substitui o tratamento de erros das páginas.
const protegida = /^\/api\/(?:me|conta|clientes|solicitacoes|projetos|dashboard|convites|conversas|notificacoes)(?:\/|$)/;
let redirecionando = false;

function rotaPublica(pathname: string) {
    const rota = pathname.toLowerCase().replace(/\/+$/, "");
    return rota === "/login" || rota === "/redefinir" || rota.startsWith("/convite/");
}

export async function apiFetch(endereco: string, opcoes?: RequestInit): Promise<Response> {
    const url = new URL(endereco, window.location.href);
    const resposta = await fetch(endereco, opcoes);
    if (resposta.status === 401 && url.origin === window.location.origin && protegida.test(url.pathname)
        && !opcoes?.signal?.aborted && !rotaPublica(window.location.pathname) && !redirecionando) {
        redirecionando = true;
        // Uma navegação completa descarta o estado em memória de todos os painéis.
        // Não chama signOut: o servidor já recusou a sessão.
        window.location.replace("/login");
    }
    return resposta;
}
