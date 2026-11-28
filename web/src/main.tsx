import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ProvedorAparencia } from './components/ProvedorAparencia';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import './styles/AcoesMinimalista.css';
import './styles/FormulariosMinimalista.css';
import './styles/CampoData.css';
import './styles/ListasMinimalista.css';
import './styles/Toasts.css';
import './styles/ModernoDesktop.css';
import './styles/ModernoPolimento.css';
import './styles/ModernoInteracao.css';
import './styles/ModernoDetalhes.css';
import './styles/ModernoMobile.css';
import App from './App.tsx'
import { BrowserRouter } from 'react-router';
import './styles/ExpressivoDesktop.css';
import './styles/ExpressivoMobile.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorAparencia>
        <App />
      </ProvedorAparencia>
    </BrowserRouter>
  </StrictMode>,
)

// Registro isolado: não solicita permissão nem interfere nas requisições.
if ('serviceWorker' in navigator && window.isSecureContext) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((erro: unknown) => {
    console.warn('Não foi possível registrar o Service Worker:', erro);
  });
}
