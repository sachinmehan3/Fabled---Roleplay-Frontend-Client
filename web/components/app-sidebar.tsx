import { useState, type ReactNode } from 'react';
import {
  Check,
  MessageSquare,
  MessageSquarePlus,
  MoonStar,
  Ellipsis,
  BookOpen,
  GitBranch,
  LayoutGrid,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Character, Chat } from '@/types';
import { cn } from '@/lib/utils';
import { THEMES, useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CharacterAvatar } from '@/components/character-avatar';

interface Props {
  className?: string;
  characters: Character[];
  selectedCharacterId: number | null;
  chats: Chat[];
  selectedChatId: number | null;
  onSelectCharacter: (id: number) => void;
  onImport: () => void;
  onCreateCharacter: () => void;
  onBrowseCharacters: () => void;
  onEditCharacter: (id: number) => void;
  onDeleteCharacter: (id: number) => void;
  onNewChat: (characterId: number) => void;
  onSelectChat: (id: number) => void;
  onDeleteChat: (id: number) => void;
  onOpenSettings: () => void;
  onOpenLorebooks: () => void;
  /** Collapse the sidebar. Desktop only - on a phone it closes by tapping away. */
  onClose?: () => void;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between px-2">
      <span className="text-muted-foreground text-xs font-medium">{children}</span>
      {action}
    </div>
  );
}

export function AppSidebar(p: Props) {
  const { theme, setTheme } = useTheme();
  const themeIcon = {
    default: <img src="/fabled-icon-transparent.svg" alt="" className="size-4 shrink-0" />,
    dark: <MoonStar />,
    light: <Sun />,
  };
  const [query, setQuery] = useState('');
  const filtered = p.characters.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = p.characters.find((c) => c.id === p.selectedCharacterId);

  return (
    <aside className={cn('bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-72 flex-col border-r', p.className)}>
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <img src="/fabled-icon.svg" alt="" className="size-8 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">Fabled</div>
          <div className="text-muted-foreground text-xs">Roleplay chat</div>
        </div>
        {p.onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-1 hidden md:inline-flex"
                aria-label="Close sidebar"
                onClick={p.onClose}
              >
                <PanelLeftClose />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Close sidebar</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="space-y-2 px-3 pb-2">
        <div className="flex gap-2">
          <Button className="flex-1 justify-start" onClick={p.onCreateCharacter}>
            <Plus />
            New character
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Import character card" onClick={p.onImport}>
                <Upload />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import a Tavern card (PNG or JSON)</TooltipContent>
          </Tooltip>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search characters"
            aria-label="Search characters"
            className="bg-background h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <button
          type="button"
          onClick={p.onBrowseCharacters}
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-ring/50 flex h-8 w-full items-center justify-between rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-[3px]"
        >
          <span className="flex items-center gap-1.5">
            Characters
            <LayoutGrid className="size-3.5" />
          </span>
          <span className="tabular-nums">{p.characters.length}</span>
        </button>
        {p.characters.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">No characters yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">No matches.</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => {
              const active = c.id === p.selectedCharacterId;
              const subtitle = c.card.tags.slice(0, 3).join(' · ') || (c.card.creator && `by ${c.card.creator}`) || 'Character';
              return (
                <li key={c.id} className="group/item relative">
                  <button
                    onClick={() => p.onSelectCharacter(c.id)}
                    aria-current={active || undefined}
                    className={cn(
                      'hover:bg-sidebar-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 pr-9 text-left outline-none focus-visible:ring-[3px]',
                      active && 'bg-sidebar-accent',
                    )}
                  >
                    <CharacterAvatar name={c.name} file={c.avatar} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Options for ${c.name}`}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
                      >
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right" className="w-44">
                      <DropdownMenuItem onSelect={() => p.onNewChat(c.id)}>
                        <MessageSquarePlus />
                        New chat
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => p.onEditCharacter(c.id)}>
                        <Pencil />
                        Edit character
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => p.onDeleteCharacter(c.id)}>
                        <Trash2 />
                        Delete character
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <>
            <Separator className="my-3" />
            <SectionLabel
              action={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label="New chat" onClick={() => p.onNewChat(selected.id)}>
                      <Plus />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">New chat with {selected.name}</TooltipContent>
                </Tooltip>
              }
            >
              Chats with {selected.name}
            </SectionLabel>
            <ul className="space-y-0.5">
              {p.chats.map((c) => {
                const active = c.id === p.selectedChatId;
                return (
                  <li key={c.id} className="group/item relative">
                    <button
                      onClick={() => p.onSelectChat(c.id)}
                      aria-current={active || undefined}
                      className={cn(
                        'hover:bg-sidebar-accent focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 pr-9 text-left text-sm outline-none focus-visible:ring-[3px]',
                        active && 'bg-sidebar-accent font-medium',
                      )}
                    >
                      {c.branched_from ? (
                        <GitBranch className="text-muted-foreground size-4 shrink-0" />
                      ) : (
                        <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{formatDate(c.created_at)}</span>
                      <span className="text-muted-foreground text-xs tabular-nums max-md:hidden md:group-hover/item:opacity-0">
                        {c.message_count ?? 0}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete chat"
                      onClick={() => p.onDeleteChat(c.id)}
                      className="hover:text-destructive absolute top-1/2 right-1.5 -translate-y-1/2 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-sidebar-border flex items-center gap-1 border-t p-2">
        <Button variant="ghost" className="flex-1 justify-start" onClick={p.onOpenSettings}>
          <Settings2 />
          Settings
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={p.onOpenLorebooks} aria-label="Lorebooks">
              <BookOpen />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lorebooks</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change theme">
              {themeIcon[theme]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-36">
            {THEMES.map((t) => (
              <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
                {themeIcon[t.value]}
                <span className="flex-1">{t.label}</span>
                {theme === t.value && <Check className="text-primary size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
