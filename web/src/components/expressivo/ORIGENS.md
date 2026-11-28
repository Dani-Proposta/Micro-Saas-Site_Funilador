# Expressivo desktop — matriz de origem e estado da primeira entrega

Base: Funilador até o pacote 06.5.5.3 (Moderno aprovado). Escopo: desktop autenticado, administrador e cliente; sem alteração da API ou do banco. A interface pública continua Moderna. O Expressivo mobile dedicado será uma etapa posterior.

## Bibliotecas efetivamente utilizadas

- Mantine Core, Dates, Notifications, Hooks: controles, modais, navegação alternativa, anéis e acessibilidade existentes.
- Motion (`motion/react`): Dock com escala por proximidade, menus, transições, contadores e efeitos de superfície.
- `@number-flow/react`: valores monetários e progresso, já presente no projeto do usuário.
- `@mantine/charts@9.8.2` e `recharts@^3`: gráfico radial GaugeChart e gráficos cartesianos, rosca, bolhas, dispersão. Documentação: https://mantine.dev/charts/getting-started/ e https://recharts.org/.
- `canvas-confetti@1.9.4`: celebração da mudança confirmada de status para concluído. Documentação: https://www.npmjs.com/package/canvas-confetti. `@types/canvas-confetti` para TypeScript.
- React Resizable Panels: painéis do chat já presentes na base.

## Catálogo React Bits — referências, não importações de código original

O acesso ao registro npm e ao código-fonte externo não foi possível neste ambiente. Os efeitos abaixo são implementações locais de CSS/Motion inspiradas nas demonstrações, não cópias nem versões oficiais do React Bits. Nenhum código Pro incorporado. As referências permanecem como alvo da próxima calibração.

| Referência | Entrega atual |
|---|---|
| [Dock](https://reactbits.dev/components/dock) | Dock com links reais, indicador ativo, ampliação do item sob o cursor e dos vizinhos. |
| [Card Nav](https://reactbits.dev/components/card-nav) | Menu agrupado com entrada animada, Popover Mantine. |
| [Liquid Ether](https://reactbits.dev/backgrounds/liquid-ether), [Prismatic Burst](https://reactbits.dev/backgrounds/prismatic-burst), [Aurora](https://reactbits.dev/backgrounds/aurora) | Gradientes animados locais por paleta/acento; não são shaders WebGL originais. |
| [Magic Bento](https://reactbits.dev/components/magic-bento), [Spotlight Card](https://reactbits.dev/components/spotlight-card) | Luz local no grid e nos cards, rastreamento do cursor, pontos decorativos e centelhas. |
| [Tilted Card](https://reactbits.dev/components/tilted-card) | Inclinação física removida na 06.5.6.2 por conflito Motion/CSS; reflexo e profundidade em camada estática, com estados visualmente distintos. |
| [Reflective Card](https://reactbits.dev/components/reflective-card) | Reflexo CSS nos valores financeiros. |
| [Pixel Card](https://reactbits.dev/components/pixel-card) | Textura de pontos/pixels e resposta à interação em solicitações/convites. |
| [Profile Card](https://reactbits.dev/components/profile-card), [Holo Card](https://reactbits.dev/components/holo-card) | Gradientes holográficos e contornos no perfil e projetos concluídos. |
| [Border Glow](https://reactbits.dev/components/border-glow), [Electric Border](https://reactbits.dev/animations/electric-border) | Luz semântica âmbar/vermelha e pulso em urgências; sem o traçado elétrico original. |
| [Specular Button](https://reactbits.dev/components/specular-button), [Ripple Button](https://magicui.design/docs/components/ripple-button), [Star Border](https://reactbits.dev/animations/star-border) | Reflexo e resposta elástica; centelhas de clique; brilho semântico nas ações de aprovação/validação. Sem efeito de onda original ou contorno orbital original. |
| [Hold Button](https://reactbits.dev/micro/hold-button) | Confirmação adicional por pressão de 850 ms nos modais de revogar/excluir convite. Alternativa convencional continua disponível. |
| [Status Mark](https://reactbits.dev/micro/status-mark), [Sling Button](https://reactbits.dev/micro/sling-button) | Feedback nos ícones dos toasts e efeito no envio do chat. |
| [Branched Menu](https://reactbits.dev/micro/branched-menu) | Menu de conta com entrada sequencial e bordas laterais. |
| [Animated Content](https://reactbits.dev/animations/animated-content), [Click Spark](https://reactbits.dev/animations/click-spark), [Count Up](https://reactbits.dev/text-animations/count-up) | Transição Motion, centelhas decorativas e contador numérico local. |
| Circular Progress | Mantine RingProgress com número animado no projeto em destaque. |
| [Stepper](https://reactbits.dev/components/stepper) | Sinalização lateral dos estados dos marcos; não é ainda o componente Stepper original. |
| Glass Surface | Superfícies translúcidas com bordas e blur. |

Pendências explícitas: Flip Card real; microcomponentes originais de seleção, carregamento, botões, Stepper e listas; substituição/calibração dos shaders e efeitos originais; Bubble Menu, Staggered Menu, Slosh Gauge, Orb, gestos e experiência mobile. Não considerar essas peças concluídas. O modo mobile mantém a interface Expressiva anterior até a etapa própria.

## Dados e preferências

- Navegação/ambientação novas e tipos de gráficos persistem no localStorage por conta e navegador, sem alterar o schema de preferências do servidor. As preferências antigas continuam na API. A escolha de navegação mobile é reservada, sem efeito visual nesta entrega.
- Histórico mensal usa o histórico da API (3/6/12 meses). Previsão não inclui vencidos nem valores sem data. Não há série histórica inventada de saldos pendentes.
- Distribuição por clientes/projetos utiliza os totais agregados pelo servidor para toda a seleção (até 8 maiores grupos e Outros); não usa apenas a página. A dispersão de pagamentos usa somente os registros válidos da página atual, com essa limitação indicada. Bolhas usam posição ordinal e valor como tamanho, não uma variável financeira inexistente.
- Tipos de gráfico ficam independentes por área. Atalhos de consulta por mês e grupo continuam disponíveis pelo seletor e botões; o novo gráfico não reproduz ainda o clique direto das barras antigas.
- Sem alterações no backend, package.json, package-lock.json ou dados de sessão; instalar as dependências separadamente no projeto real. Revisar licença e versão antes de publicar.

## Instalação (na raiz do repositório)

```powershell
npm --prefix web install @mantine/charts@9.8.2 recharts@^3 canvas-confetti@1.9.4
npm --prefix web install -D @types/canvas-confetti
npm --prefix web run lint
npm --prefix web run build
```

A validação estática local não substitui o typecheck com dependências instaladas, nem o teste visual/interativo em navegador.

## 06.5.6.2 — correções após teste visual

- Recharts usa dimensão explícita medida com Mantine Hooks e altura reservada; ainda exige teste real.
- O Dock pode ser recolhido e o chat reserva sua altura.
- Projetos: planejado (grade), em andamento (varredura), concluído (holográfico), cancelado (faixas) e arquivado (pontos discretos). Estados decorativos não movem o card clicável.
- Clientes Expressivo desktop: grid de cards Spotlight adaptados, com estado de acesso e ações originais.
- Notificações: entrada na viewport com Motion, não Animated List original.
- As três ambientações seguem a preferência global; cabeçalhos apresentam motivos por área.
- Não foram baixados componentes originais nesta rodada; Stepper, Flip Card e demais pendências continuam no catálogo.

## 06.5.6.3 — identidade viva

- Trilho de marcos de consulta (adaptação Motion/CSS inspirada no Stepper): quantidade, ordem e estados reais; cancelados excluídos. Não é o componente React Bits original. A listagem administrativa consulta o resumo de marcos quando o card entra na viewport, pois a rota de listagem não fornece o progresso. Não altera status ao alcançar 100%.
- Flip Card do gráfico: rotação CSS com duas faces de altura fixa, tabela rolável, face oculta inerte e botão acessível. Não é o componente React Bits original.
- Mês em foco destaca os valores reais já retornados; os atalhos consultam os registros com o mês ou intervalo na URL. A previsão permanece a janela de seis meses da API e o histórico permanece o período 3/6/12. A consulta não substitui o resumo geral.
- Iluminação reativa dos cabeçalhos, movimentos internos e reflexo holográfico mais intenso para progresso completo e concluídos. Não foram adicionadas dependências.

### 06.5.6.4 — acabamento desktop
- Progresso circular: SVG + Motion local; respeita movimento reduzido e a atualização real do percentual.
- Marcos: trilho local agora também exibido em modo manual, com o percentual manual separado da contagem de marcos.
- Anel de composição: SVG + Motion local, valores reais com legenda interativa e acessível; o medidor Mantine Charts e as demais visualizações Recharts foram preservados.
- Flip Card: tabela paginada em seis registros, dimensões estáveis; expansão mede a área restante da janela. Em janelas extremamente baixas ou conteúdo excepcionalmente longo, rolagem de segurança permanece disponível.
- Calendário: alinhamento CSS limitado ao Expressivo desktop, Mantine Dates permanece responsável pela seleção.

### 06.5.6.5 — personalidade e acabamento de interação
- Ficha individual: cards com os mesmos estados da lista de projetos e solicitações; progresso consultado pela rota existente de marcos. A API da ficha não devolve descrição/orçamento, portanto o card relacionado não inventa esses detalhes.
- Solicitações: padrões por estado (pendente, aprovada, recusada), Pixel Card adaptado localmente. Convites: reflexos e pixels semânticos. Clientes: feedback elástico dos ícones e avatar, superfície interna reativa e filtros clicáveis mais explícitos; sem transformações concorrentes da área de interação.
- Dock: seta integrada com transição de posição; a navegação recolhida é inerte. Medidor: substituição do GaugeChart por SVG + Motion responsivo, com os mesmos dados reais. Não foram adicionadas dependências.
- Ideia futura (não implementada): aviso contextual de pagamento/marco na conversa, sem confirmar pagamento automaticamente. Definir permissões, deduplicação, anexos e revisão manual antes de alterar o backend.

### 06.5.6.6 — trajetória e cabeçalhos vivos
- Cabeçalho administrativo: estados distintos e camada luminosa proporcional ao progresso real no estado em andamento, com texto explícito; efeitos locais CSS, sem transformar a área clicável. Progresso indefinido não é convertido em 0%; conclusão de status e percentual continuam independentes.
- Portal Expressivo desktop: resumo de urgências, trajetória compacta com contagens reais da API, projeto destacado e pendências expansíveis. Contagens de projetos excluem arquivados conforme a API; não são contagens históricas totais. Solicitações pendentes são mostradas como tal. Os planejados são acessíveis pelo filtro correspondente, sem repetir a prévia de três cards.
- Sem mudanças de backend ou dependências. Outros estilos mantêm a composição anterior.

### 06.5.7 — Expressivo Mobile Consolidado
- Navegações independentes: Bubble Menu adaptado (botão flutuante e menu de bolhas em modal fullscreen) e Staggered Menu adaptado (Drawer esquerdo de trabalho e Drawer direito da conta; sino mantém acesso direto às notificações). Mantine/Motion, não as versões originais React Bits. Menus fechados não mantêm uma camada modal ativa; atalhos de navegação usam as rotas existentes. Bubble fica oculto na conversa selecionada e em viewport baixa com teclado em foco.
- Aurora móvel em gradiente animado local, Orb decorativo na trajetória, Slosh Gauge local em SVG/Motion com porcentagem real, sem sensores. Stepper pode rolar horizontalmente quando houver muitas etapas. Contadores, urgências, trajetória, identidades de estado, clientes, convites e ações herdados do desktop e adaptados ao toque.
- Financeiro: mesmos dados e visualizações do desktop, escolha persistida por área/dispositivo no navegador, Flip Card com quatro linhas por página, expansão fullscreen, anel/medidor responsivos. Scroll de segurança em tela pequena para não cortar conteúdo. Sem dados históricos novos. Dispersão individual continua limitada à página de registros.
- Chat: gestos horizontais revelam ações explícitas de abrir e (cliente, quando permitido) ocultar/exibir; alternativa por botão, sem alteração automática por gesto. Notificações com infinite scroll e animação ao entrar na viewport. Toasts superiores com gesto de descarte Mantine no Expressivo; testar em dispositivo físico para confirmar que não captura toques fora do toast.
- Sem dependências novas, sem alteração de API. Base CSS mobile do Moderno e efeitos locais do Expressivo adaptados para media query própria; duplicação de regras é dívida de manutenção a revisar na auditoria global. Componentes originais React Bits continuam pendentes; não são apresentados como imports oficiais. Validar lint, build, gestos, teclado e regressões no ambiente real.

### 06.5.7.4 — Bento Financeiro
- Apenas o resumo do Dashboard administrativo no Expressivo recebe a nova composição. Total estimado: reflexo metálico, anéis decorativos e proporção de recebimentos animada; recebido: partículas verdes e NumberFlow; previsto: halo âmbar com saldo e neutro quando zerado. Adaptação local CSS/Motion, não componentes originais React Bits.
- Proporção = recebido / (recebido + previsto no mês), excluindo atrasados conforme API. Total zero não é conquista; saldo previsto zero e recebido positivo aciona brilho de conquista da previsão, não quitação de todas as dívidas. Sem base anterior positiva, comparação não exibe percentual. Cards são botões nativos e mantêm os destinos existentes; layout responsivo por largura disponível e movimento reduzido.
