import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { ThemeProvider } from '@/hooks/use-theme';
import { ConfirmProvider } from '@/hooks/use-confirm';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <ConfirmProvider>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </ConfirmProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
