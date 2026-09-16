import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { AuthGate } from '@/components/auth-gate';
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
          <AuthGate>
            <App />
          </AuthGate>
          <Toaster position="top-right" richColors closeButton />
        </ConfirmProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
