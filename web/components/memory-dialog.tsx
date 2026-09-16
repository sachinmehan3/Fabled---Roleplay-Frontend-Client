import { useEffect, useState } from 'react';
import { Brain, LoaderCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import type { ChatMemory } from '@/types';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: number;
  characterName: string;
}

export function MemoryDialog({ open, onOpenChange, chatId, characterName }: Props) {
  const confirm = useConfirm();
  const [memory, setMemory] = useState<ChatMemory | null>(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [folding, setFolding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = (m: ChatMemory) => {
    setMemory(m);
    setSummary(m.summary);
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    api
      .getMemory(chatId)
      .then((m) => live && load(m))
      .catch((e: Error) => live && toast.error(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [open, chatId]);

  const summariseNow = async () => {
    setFolding(true);
    try {
      load(await api.foldMemory(chatId));
      toast.success('Memory updated');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFolding(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      load(await api.saveMemory(chatId, { summary }));
      toast.success('Memory saved');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const forget = async () => {
    const ok = await confirm({
      title: 'Forget this chat?',
      description: `${characterName} keeps only the messages still inside the context window.`,
      confirmText: 'Forget',
      destructive: true,
    });
    if (!ok) return;
    try {
      load(await api.clearMemory(chatId));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const busy = loading || folding || saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>What {characterName} remembers</DialogTitle>
          <DialogDescription>
            {memory?.folds
              ? `Written from ${memory.folds === 1 ? 'one round' : `${memory.folds} rounds`} of older messages, last updated ${new Date(memory.updatedAt).toLocaleString()}. Sent with every reply.`
              : 'Older messages are summarised here as they fall out of the context window, and sent with every reply.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor="memory-summary">Summary</Label>
            <Textarea
              id="memory-summary"
              className="max-h-[50vh] min-h-56"
              placeholder="Nothing yet. This fills in once the chat outgrows the context window."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Edit it freely - your wording is kept until the next fold rewrites it, and anything you delete is
              genuinely forgotten.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row items-center border-t px-6 py-4 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={summariseNow} disabled={busy}>
              {folding ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Summarise now
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={forget} disabled={busy}>
              <Brain />
              Forget
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {saving && <LoaderCircle className="animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
