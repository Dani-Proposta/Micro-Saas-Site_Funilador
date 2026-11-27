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
import App from './App.tsx'
import { BrowserRouter } from 'react-router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorAparencia>

      <BrowserRouter>
        <App />
      </BrowserRouter>

    </ProvedorAparencia>
  </StrictMode>,
)

