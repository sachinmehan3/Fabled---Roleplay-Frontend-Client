import { useEffect, useState, type CSSProperties } from 'react';
import { Ellipsis, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { Character } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { hueFor, initials } from '@/components/character-avatar';
import { useImageUrl } from '@/hooks/use-image-url';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: Character[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onCreate: () => void;
  onImport: () => void;
}

/** Everyone you've saved, as portraits. Names only - the card itself has the details. */
export function CharacterGallery({
  open,
  onOpenChange,
  characters,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onImport,
}: Props) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filtered = characters.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Characters</DialogTitle>
          <DialogDescription>
            {characters.length === 1 ? '1 character saved' : `${characters.length} characters saved`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-6 pt-4">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search characters"
              aria-label="Search characters"
              className="h-9 pl-8"
              autoFocus
            />
          </div>
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={onImport}>
            <Upload />
            Import
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {characters.length === 0 ? 'No characters yet.' : 'No matches.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((c) => {
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={c.id === selectedId || undefined}
                      className="w-full text-left outline-none"
                    >
                      <div
                        className={cn(
                          'bg-muted relative aspect-[3/4] overflow-hidden rounded-xl border transition',
                          'group-hover:border-primary/40 group-focus-visible:ring-ring/50 group-focus-visible:ring-[3px]',
                          c.id === selectedId && 'ring-primary ring-2',
                        )}
                      >
                        <Portrait id={c.avatar} name={c.name} />
                        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                          {c.chats ?? 0} {c.chats === 1 ? 'chat' : 'chats'}
                        </span>
                      </div>
                      <div className="mt-2 truncate text-sm font-medium" title={c.name}>
                        {c.name}
                      </div>
                    </button>

                    {/* Siblings of the tile rather than inside it: a button cannot hold buttons. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          aria-label={`Options for ${c.name}`}
                          className="absolute top-1.5 right-1.5 shadow-sm"
                        >
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onSelect={() => onEdit(c.id)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(c.id)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Portrait({ id, name }: { id: string | null; name: string }) {
  const url = useImageUrl(id);
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  return (
    <div
      className="rp-avatar-fallback flex size-full items-center justify-center text-4xl"
      style={{ '--avatar-hue': `${hueFor(name)}deg` } as CSSProperties}
    >
      {initials(name)}
    </div>
  );
}
