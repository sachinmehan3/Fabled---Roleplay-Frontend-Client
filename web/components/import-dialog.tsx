import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileUp, Link2, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFile: (file: File) => Promise<void>;
  onUrl: (url: string) => Promise<void>;
}

/** Bring a character in from a card file, or from a link to its page on Chub. */
export function ImportDialog({ open, onOpenChange, onFile, onUrl }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) run(() => onUrl(url.trim()));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a character</DialogTitle>
          <DialogDescription>From a Tavern card file, or a link to the character on Chub.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label>From a file</Label>
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp />
            Choose a PNG or JSON card
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".png,.json,image/png,application/json"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) run(() => onFile(file));
            }}
          />
        </div>

        <form onSubmit={submitUrl} className="grid gap-2 border-t pt-4">
          <Label htmlFor="import-url">From a link</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="import-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://chub.ai/characters/…"
                className="pl-8"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy && <LoaderCircle className="animate-spin" />}
              Import
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">chub.ai and characterhub.org character pages are supported.</p>
        </form>

        {error && (
          <p role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
