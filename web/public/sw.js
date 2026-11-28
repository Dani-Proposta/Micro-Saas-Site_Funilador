// Funilador — Service Worker exclusivo para notificações.
// Sem cache, sem interceptação de fetch e sem dados privados no aviso.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const avisos = Object.freeze({
  novidade: ['Você tem uma novidade!', 'Acesse o Funilador para conferir suas novas notificações.'],
  nova_mensagem: ['Nova mensagem', 'Você recebeu uma nova mensagem.'],
  projeto_atualizado: ['Projeto atualizado', 'Há uma novidade em um projeto.'],
  marco_concluido: ['Marco concluído', 'Uma etapa de projeto foi concluída.'],
  aguardando_validacao: ['Aguardando validação', 'Há uma etapa aguardando avaliação.'],
  entrega_validada: ['Entrega validada', 'Uma entrega foi validada.'],
  nova_proposta: ['Nova proposta', 'Há uma proposta aguardando avaliação.'],
  negociacao_atualizada: ['Negociação atualizada', 'Há novidades em uma negociação.'],
  nova_solicitacao: ['Nova solicitação', 'Há uma solicitação aguardando avaliação.'],
  solicitacao_atualizada: ['Solicitação atualizada', 'Há novidades em uma solicitação.'],
  lembrete_pagamento: ['Lembrete de pagamento', 'Confira seus pagamentos no Funilador.'],
  aguardando_pagamento: ['Pagamento pendente', 'Há uma etapa aguardando pagamento.'],
  pagamento_atualizado: ['Pagamento atualizado', 'Confira as novidades financeiras no Funilador.'],
  reabertura: ['Reabertura de conversa', 'Há novidades em um pedido de reabertura.'],
  conversa_atualizada: ['Conversa atualizada', 'Há uma novidade em uma conversa.'],
});
self.addEventListener('push', (event) => {
  let categoria = 'novidade';
  try {
    const dados = event.data?.json();
    if (typeof dados?.categoria === 'string' && Object.hasOwn(avisos, dados.categoria)) categoria = dados.categoria;
  } catch { /* teste do DevTools e payload desconhecido usam fallback */ }
  const [title, body] = avisos[categoria];
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/brand/funilador-app-192.png',
    tag: `funilador-${categoria}`,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      return;
    }
    await self.clients.openWindow(new URL('/', self.location.origin).href);
  })());
});
