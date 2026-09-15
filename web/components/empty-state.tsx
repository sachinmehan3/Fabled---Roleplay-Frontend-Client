import type { ReactNode } from 'react';
import { Check, PanelLeft, PlugZap, Plus, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Props {
  hasModel: boolean;
  hasCharacters: boolean;
  onImport: () => void;
  onCreate: () => void;
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
  sidebarCollapsed: boolean;
}

function Step({ n, done, title, text, action }: { n: number; done: boolean; title: string; text: string; action: ReactNode }) {
  return (
    <li className="bg-card flex items-center gap-4 rounded-xl border p-4 text-left shadow-xs">
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium',
          done && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        )}
      >
        {done ? <Check className="size-4" /> : n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-muted-foreground text-xs">{text}</div>
      </div>
      {action}
    </li>
  );
}

export function EmptyState({
  hasModel,
  hasCharacters,
  onImport,
  onCreate,
  onOpenSettings,
  onOpenSidebar,
  sidebarCollapsed,
}: Props) {
  return (
    <div className="relative flex h-full items-center justify-center p-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn('absolute top-3 left-3', !sidebarCollapsed && 'md:hidden')}
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <PanelLeft />
      </Button>
      <div className="w-full max-w-md text-center">
        <img src="/fabled-icon.svg" alt="" className="mx-auto mb-5 size-14" />
        <h1 className="text-2xl font-semibold tracking-tight">Start a roleplay</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {hasCharacters
            ? 'Pick a character from the sidebar to continue a chat.'
            : 'Connect a model, import a character card, and start chatting.'}
        </p>
        <ol className="mt-8 space-y-3">
          <Step
            n={1}
            done={hasModel}
            title="Connect a model"
            text="OpenRouter, Ollama, LM Studio, KoboldCpp…"
            action={
              <Button size="sm" variant={hasModel ? 'ghost' : 'default'} onClick={onOpenSettings}>
                <PlugZap />
                {hasModel ? 'Change' : 'Connect'}
              </Button>
            }
          />
          <Step
            n={2}
            done={hasCharacters}
            title="Add a character"
            text="Write your own card, or import a Tavern PNG / JSON"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant={hasModel && !hasCharacters ? 'default' : 'outline'} onClick={onCreate}>
                  <Plus />
                  Create
                </Button>
                <Button size="sm" variant="outline" onClick={onImport}>
                  <Upload />
                  Import
                </Button>
              </div>
            }
          />
        </ol>
      </div>
    </div>
  );
}
