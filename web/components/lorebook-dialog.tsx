import { useEffect, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import type { Character, LoreEntry, Lorebook } from '@/types';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox, Select } from '@/components/ui/select';
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
  characters: Character[];
}

const EMPTY: Omit<LoreEntry, 'id'> = {
  title: '',
  content: '',
  enabled: true,
  mode: 'selective',
  keys: [],
  secondaryKeys: [],
  logic: 'and_any',
  position: 'after_char',
  depth: 4,
  role: 'system',
  order: 100,
  caseSensitive: null,
  matchWholeWords: null,
  scanDepth: null,
  probability: 100,
  group: '',
  groupWeight: 100,
  prioritizeInclusion: false,
  excludeRecursion: false,
  preventRecursion: false,
  delayUntilRecursion: false,
  sticky: 0,
  cooldown: 0,
  delay: 0,
};

const LOGIC_LABELS: Record<LoreEntry['logic'], string> = {
  and_any: 'AND ANY of',
  and_all: 'AND ALL of',
  not_any: 'NOT ANY of',
  not_all: 'NOT ALL of',
};

const csv = (list: string[]) => list.join(', ');
const parseCsv = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);

/** A labelled control, laid out for the dense grid the entry form uses. */
function Cell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  );
}

export function LorebookDialog({ open, onOpenChange, characters }: Props) {
  const confirm = useConfirm();
  const [books, setBooks] = useState<Lorebook[]>([]);
  const [bookId, setBookId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Lorebook | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    api
      .listLorebooks()
      .then((list) => {
        setBooks(list);
        setBookId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((e: Error) => toast.error(e.message));
  }, [open]);

  useEffect(() => {
    setDraft(books.find((b) => b.id === bookId) ?? null);
    setOpenEntry(null);
  }, [bookId, books]);

  const edit = (patch: Partial<Lorebook>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const editEntry = (id: string, patch: Partial<LoreEntry>) =>
    setDraft((d) => (d ? { ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : d));

  const addBook = async () => {
    try {
      const book = await api.createLorebook();
      setBooks((list) => [...list, book]);
      setBookId(book.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const importBook = async (file: File) => {
    try {
      const book = await api.importLorebook(file);
      setBooks(await api.listLorebooks());
      setBookId(book.id);
      toast.success(`Imported ${book.name} with ${book.entries.length} entries`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeBook = async () => {
    if (!draft) return;
    const ok = await confirm({
      title: `Delete ${draft.name}?`,
      description: `All ${draft.entries.length} entries in this lorebook are removed.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteLorebook(draft.id).catch((e: Error) => toast.error(e.message));
    const list = await api.listLorebooks();
    setBooks(list);
    setBookId(list[0]?.id ?? null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.saveLorebook(draft.id, draft);
      setBooks((list) => list.map((b) => (b.id === saved.id ? saved : b)));
      toast.success('Lorebook saved');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Lorebooks</DialogTitle>
          <DialogDescription>
            Entries are pulled into the prompt when the conversation mentions their keys, so the model only carries the
            parts of your world it needs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
          <div className="min-w-44 flex-1">
            <Select
              label="Lorebook"
              value={bookId ?? 0}
              onChange={(v) => setBookId(Number(v))}
              options={
                books.length
                  ? books.map((b) => ({ value: b.id, label: `${b.name} (${b.entries.length})` }))
                  : [{ value: 0, label: 'No lorebooks yet' }]
              }
            />
          </div>
          <Button variant="outline" size="sm" onClick={addBook}>
            <Plus />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload />
            Import
          </Button>
          {draft && (
            <Button variant="ghost" size="sm" onClick={removeBook} className="hover:text-destructive">
              <Trash2 />
              Delete
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBook(f);
              e.target.value = '';
            }}
          />
        </div>

        {!draft ? (
          <div className="px-6 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              No lorebook selected. Make one, or import a SillyTavern World Info file.
            </p>
          </div>
        ) : (
          <div className="max-h-[58vh] space-y-5 overflow-y-auto px-6 py-5">
            {/* Book-wide settings */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Cell label="Name">
                <Input value={draft.name} onChange={(e) => edit({ name: e.target.value })} className="h-9" />
              </Cell>
              <Cell label="Applies to" hint="Every character unless you pick one.">
                <Select
                  value={draft.characterIds[0] ?? 0}
                  onChange={(v) => edit({ characterIds: v ? [Number(v)] : [] })}
                  options={[
                    { value: 0, label: 'Every character' },
                    ...characters.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Cell>
              <Cell label="Scan depth" hint="Messages searched for keys.">
                <Input
                  type="number"
                  min={0}
                  value={draft.scanDepth}
                  onChange={(e) => edit({ scanDepth: Number(e.target.value) })}
                  className="h-9"
                />
              </Cell>
              <Cell label="Token budget" hint="0 for no limit.">
                <Input
                  type="number"
                  min={0}
                  step={64}
                  value={draft.budget}
                  onChange={(e) => edit({ budget: Number(e.target.value) })}
                  className="h-9"
                />
              </Cell>
              <Cell label="Recursion steps" hint="1 stops entries triggering entries.">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.maxRecursionSteps}
                  onChange={(e) => edit({ maxRecursionSteps: Number(e.target.value) })}
                  className="h-9"
                />
              </Cell>
              <div className="grid content-center gap-2">
                <Checkbox checked={draft.enabled} onChange={(v) => edit({ enabled: v })} label="Book enabled" />
                <Checkbox checked={draft.caseSensitive} onChange={(v) => edit({ caseSensitive: v })} label="Case sensitive keys" />
                <Checkbox checked={draft.matchWholeWords} onChange={(v) => edit({ matchWholeWords: v })} label="Match whole words" />
              </div>
            </div>

            {/* Entries */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Entries</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const entry = { ...EMPTY, id: `e-${Date.now().toString(36)}` };
                    edit({ entries: [...draft.entries, entry] });
                    setOpenEntry(entry.id);
                  }}
                >
                  <Plus />
                  Add entry
                </Button>
              </div>

              {draft.entries.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Nothing here yet. An entry is a piece of your world plus the words that should summon it.
                </p>
              ) : (
                <ul className="divide-border/60 divide-y rounded-lg border">
                  {draft.entries.map((entry) => {
                    const expanded = openEntry === entry.id;
                    return (
                      <li key={entry.id}>
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <Checkbox
                            checked={entry.enabled}
                            onChange={(v) => editEntry(entry.id, { enabled: v })}
                            label=""
                            className="shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => setOpenEntry(expanded ? null : entry.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                          >
                            <ChevronRight className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-90')} />
                            <span className={cn('truncate text-sm', !entry.enabled && 'text-muted-foreground line-through')}>
                              {entry.title || entry.keys[0] || 'Untitled entry'}
                            </span>
                            <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                              {entry.mode === 'constant' ? 'always' : csv(entry.keys.slice(0, 3)) || 'no keys'}
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete entry"
                            className="hover:text-destructive"
                            onClick={() => edit({ entries: draft.entries.filter((e) => e.id !== entry.id) })}
                          >
                            <Trash2 />
                          </Button>
                        </div>

                        {expanded && (
                          <div className="grid gap-4 border-t px-3 py-4">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                              <Cell label="Title" hint="For you, never sent.">
                                <Input value={entry.title} onChange={(e) => editEntry(entry.id, { title: e.target.value })} className="h-9" />
                              </Cell>
                              <Cell label="Trigger">
                                <Select
                                  value={entry.mode}
                                  onChange={(v) => editEntry(entry.id, { mode: v as LoreEntry['mode'] })}
                                  options={[
                                    { value: 'selective', label: 'When keys match' },
                                    { value: 'constant', label: 'Always on' },
                                  ]}
                                />
                              </Cell>
                              <Cell label="Insertion order" hint="Higher goes nearer the end.">
                                <Input type="number" value={entry.order} onChange={(e) => editEntry(entry.id, { order: Number(e.target.value) })} className="h-9" />
                              </Cell>
                            </div>

                            <Cell label="Keys" hint="Comma separated. /regex/ works too.">
                              <Input
                                value={csv(entry.keys)}
                                onChange={(e) => editEntry(entry.id, { keys: parseCsv(e.target.value) })}
                                placeholder="vale, the vale, /val(e|ley)/"
                                className="h-9"
                              />
                            </Cell>

                            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                              <Cell label="Optional filter">
                                <Select
                                  value={entry.logic}
                                  onChange={(v) => editEntry(entry.id, { logic: v as LoreEntry['logic'] })}
                                  options={Object.entries(LOGIC_LABELS).map(([value, label]) => ({
                                    value: value as LoreEntry['logic'],
                                    label,
                                  }))}
                                />
                              </Cell>
                              <Cell label="Filter keys" hint="Leave empty to ignore the filter.">
                                <Input
                                  value={csv(entry.secondaryKeys)}
                                  onChange={(e) => editEntry(entry.id, { secondaryKeys: parseCsv(e.target.value) })}
                                  className="h-9"
                                />
                              </Cell>
                            </div>

                            <Cell label="Content" hint="What the model is told when this fires.">
                              <Textarea
                                value={entry.content}
                                onChange={(e) => editEntry(entry.id, { content: e.target.value })}
                                className="min-h-24"
                              />
                            </Cell>

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                              <Cell label="Position">
                                <Select
                                  value={entry.position}
                                  onChange={(v) => editEntry(entry.id, { position: v as LoreEntry['position'] })}
                                  options={[
                                    { value: 'before_char', label: 'Before character' },
                                    { value: 'after_char', label: 'After character' },
                                    { value: 'at_depth', label: 'At depth' },
                                  ]}
                                />
                              </Cell>
                              {entry.position === 'at_depth' && (
                                <>
                                  <Cell label="Depth" hint="Messages from the end.">
                                    <Input type="number" min={0} value={entry.depth} onChange={(e) => editEntry(entry.id, { depth: Number(e.target.value) })} className="h-9" />
                                  </Cell>
                                  <Cell label="As">
                                    <Select
                                      value={entry.role}
                                      onChange={(v) => editEntry(entry.id, { role: v as LoreEntry['role'] })}
                                      options={[
                                        { value: 'system', label: 'System' },
                                        { value: 'user', label: 'User' },
                                        { value: 'assistant', label: 'Assistant' },
                                      ]}
                                    />
                                  </Cell>
                                </>
                              )}
                              <Cell label="Chance %" hint="100 is always.">
                                <Input type="number" min={0} max={100} value={entry.probability} onChange={(e) => editEntry(entry.id, { probability: Number(e.target.value) })} className="h-9" />
                              </Cell>
                            </div>

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                              <Cell label="Group" hint="Only one entry per group.">
                                <Input value={entry.group} onChange={(e) => editEntry(entry.id, { group: e.target.value })} className="h-9" />
                              </Cell>
                              <Cell label="Group weight">
                                <Input type="number" min={0} value={entry.groupWeight} onChange={(e) => editEntry(entry.id, { groupWeight: Number(e.target.value) })} className="h-9" />
                              </Cell>
                              <Cell label="Sticky" hint="Stays in for N messages.">
                                <Input type="number" min={0} value={entry.sticky} onChange={(e) => editEntry(entry.id, { sticky: Number(e.target.value) })} className="h-9" />
                              </Cell>
                              <Cell label="Cooldown" hint="Blocked for N after.">
                                <Input type="number" min={0} value={entry.cooldown} onChange={(e) => editEntry(entry.id, { cooldown: Number(e.target.value) })} className="h-9" />
                              </Cell>
                              <Cell label="Delay" hint="Waits for N messages.">
                                <Input type="number" min={0} value={entry.delay} onChange={(e) => editEntry(entry.id, { delay: Number(e.target.value) })} className="h-9" />
                              </Cell>
                              <Cell label="Scan depth" hint="Blank uses the book's.">
                                <Input
                                  type="number"
                                  min={0}
                                  value={entry.scanDepth ?? ''}
                                  onChange={(e) => editEntry(entry.id, { scanDepth: e.target.value === '' ? null : Number(e.target.value) })}
                                  className="h-9"
                                />
                              </Cell>
                            </div>

                            <div className="flex flex-wrap gap-x-5 gap-y-2">
                              <Checkbox checked={entry.prioritizeInclusion} onChange={(v) => editEntry(entry.id, { prioritizeInclusion: v })} label="Win its group by order" />
                              <Checkbox checked={entry.excludeRecursion} onChange={(v) => editEntry(entry.id, { excludeRecursion: v })} label="Other entries cannot trigger it" />
                              <Checkbox checked={entry.preventRecursion} onChange={(v) => editEntry(entry.id, { preventRecursion: v })} label="It cannot trigger others" />
                              <Checkbox checked={entry.delayUntilRecursion} onChange={(v) => editEntry(entry.id, { delayUntilRecursion: v })} label="Only on recursion" />
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!draft || saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            Save lorebook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
