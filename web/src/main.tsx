import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ProvedorAparencia } from './components/ProvedorAparencia';
import '@mantine/core/styles.css';
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

