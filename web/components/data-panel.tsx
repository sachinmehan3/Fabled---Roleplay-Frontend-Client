import { useEffect, useRef, useState } from 'react';
import { Download, HardDrive, LoaderCircle, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/select';

type Storage = Awaited<ReturnType<typeof api.storageInfo>>;

function formatBytes(n: number | undefined) {
  if (n === undefined) return 'unknown';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** Everything lives in this browser, so this is where you take it with you, bring it back, or wipe it. */
export function DataPanel() {
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [includeKey, setIncludeKey] = useState(false);
  const [busy, setBusy] = useState<'export' | 'import' | 'clear' | null>(null);

  useEffect(() => {
    api.storageInfo().then(setStorage).catch(() => {});
  }, []);

  const exportBackup = async () => {
    setBusy('export');
    try {
      const backup = await api.exportBackup({ includeApiKey: includeKey });
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fabled-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async (file: File) => {
    const ok = await confirm({
      title: 'Replace everything with this backup?',
      description:
        'Every character, chat, lorebook and setting in this browser is replaced by what is in the file. Export a backup first if you might want them back.',
      confirmText: 'Replace',
      destructive: true,
    });
    if (!ok) return;
    setBusy('import');
    try {
      await api.importBackup(file);
      toast.success('Backup restored');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: 'Delete all data in this browser?',
      description:
        'Characters, chats, lorebooks, pictures, settings and your API key are all removed. This cannot be undone.',
      confirmText: 'Delete everything',
      destructive: true,
    });
    if (!ok) return;
    setBusy('clear');
    try {
      await api.clearAllData();
      location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <>
      <div className="grid gap-2">
        <Label className="flex items-center gap-2">
          <HardDrive className="size-4 opacity-60" /> Where your data lives
        </Label>
        <p className="text-muted-foreground text-sm">
          Everything is kept in this browser, on this device. Nothing is uploaded anywhere, and your messages go only to
          the provider you connected. Another browser or device starts empty.
        </p>
        {storage && (
          <p className="text-muted-foreground text-xs">
            Using {formatBytes(storage.used)}
            {storage.quota ? ` of ${formatBytes(storage.quota)} available` : ''}.
          </p>
        )}
        {storage && !storage.persisted && (
          <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <ShieldAlert className="mt-px size-4 shrink-0" />
            The browser has not promised to keep this data, and may clear it if the device runs low on space or the site
            goes unused for a while. Export a backup now and then.
          </p>
        )}
      </div>

      <div className="grid gap-3 border-t pt-5">
        <div>
          <Label>Backup</Label>
          <p className="text-muted-foreground mt-1 text-xs">
            One file with everything, pictures included. Use it to move to another browser, or to be safe.
          </p>
        </div>
        <Checkbox
          checked={includeKey}
          onChange={setIncludeKey}
          label="Include my API key (anyone with the file could use it)"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportBackup} disabled={busy !== null}>
            {busy === 'export' ? <LoaderCircle className="animate-spin" /> : <Download />}
            Export backup
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
          >
            {busy === 'import' ? <LoaderCircle className="animate-spin" /> : <Upload />}
            Restore from backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importBackup(file);
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 border-t pt-5">
        <div>
          <Label>Clear all data</Label>
          <p className="text-muted-foreground mt-1 text-xs">
            Removes everything Fabled keeps in this browser, including your API key.
          </p>
        </div>
        <div>
          <Button type="button" variant="destructive" size="sm" onClick={clearAll} disabled={busy !== null}>
            {busy === 'clear' ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            Delete everything
          </Button>
        </div>
      </div>
    </>
  );
}
