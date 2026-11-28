# Funilador — Avisos de terceiros

Este documento identifica recursos de terceiros utilizados pelo Funilador. O código original do projeto tem política própria, descrita em `LICENSE.md`. Nenhuma atribuição de titularidade sobre materiais de terceiros é feita pelo Funilador.

## React Bits

- Projeto: React Bits, David Haz (DavidHDev).
- Repositório: https://github.com/DavidHDev/react-bits
- Licença oficial consultada em 28/11/2026: MIT + Commons Clause License Condition v1.0. Texto preservado em `licenses/react-bits.md`.
- Componentes: LineSidebar e PillNav, integrados e adaptados para a interface do Funilador.
- Caminhos: `web/src/components/ui/react-bits/LineSidebar.tsx`, `LineSidebar.css`, `PillNav.tsx`, `PillNav.css` e `PillNavTabs.css` (estilos de integração).
- Registro local de incorporação informado: commit `5bf1ea8`, 27/11/2026. A revisão upstream exata não foi identificada.

Os componentes são utilizados como parte da aplicação, e não oferecidos como biblioteca, pacote de componentes ou produto independente. Permanecem sujeitos à licença do React Bits.

## Dependências npm

Dependências diretas e transitivas são identificadas nos lockfiles de `api/` e `web/`. A auditoria de produção reportou MIT, ISC, BSD-3-Clause, 0BSD, MIT OR CC0-1.0 e MIT AND ISC AND BSD-3-Clause. Entre as ferramentas de desenvolvimento também foi identificada Apache-2.0 (TypeScript). Os metadados não substituem os textos originais de licença e atribuição.

Execute `node scripts/collect-third-party-notices.mjs` na raiz do repositório com as dependências instaladas. O coletor registra os textos disponíveis nos pacotes instalados, incluindo avisos de copyright e NOTICE, em `licenses/npm-notices.txt` e gera `web/public/third-party-notices.txt` para distribuição com a aplicação. Revise os avisos de arquivos ausentes antes de publicar; o coletor não é uma validação jurídica nem uma análise completa do bundle.

## Recursos visuais

A auditoria preliminar não identificou fontes locais nem referências a fontes remotas no diretório `web/src`. Os arquivos `web/public/favicon.svg` e `web/public/icons.svg` são recursos preexistentes com aparência de template inicial do Vite; a origem exata não foi confirmada. Revisar a substituição do favicon e a remoção do sprite se não utilizado na etapa de identidade visual. Marcas de terceiros não são reivindicadas pelo Funilador.
