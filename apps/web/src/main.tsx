import '@free360/ui/global.css';
import { requestPersistentStorage } from '@free360/storage';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createServices } from './services';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

void requestPersistentStorage();

createRoot(root).render(
  <StrictMode>
    <App services={createServices()} />
  </StrictMode>,
);
