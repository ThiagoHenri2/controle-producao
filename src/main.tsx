import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ConfigErrorScreen } from './components/ConfigErrorScreen';
import { supabaseConfig } from './lib/supabase';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Elemento #root não encontrado em index.html.');

createRoot(rootEl).render(
  <StrictMode>
    {supabaseConfig.ok ? <App /> : <ConfigErrorScreen config={supabaseConfig} />}
  </StrictMode>,
);
