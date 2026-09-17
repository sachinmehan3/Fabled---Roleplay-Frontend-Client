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
  Settings2,
  SquarePen,
  Sun,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { Character, Chat } from '@/types';
import { cn, publicUrl } from '@/lib/utils';
import { THEMES, useTheme } from '@/hooks/use-theme';
import { SETTINGS_TABS, type SettingsTab } from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onRenameChat: (id: number, title: string) => void;
  onDeleteChat: (id: number) => void;
  onOpenSettings: (tab: SettingsTab) => void;
  onOpenLorebooks: () => void;
  /** Collapse the sidebar. Desktop only - on a phone it closes by tapping away. */
  onClose?: () => void;
}

const EM_DASH = '—';

function formatDate(ts: number) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-3 flex h-7 items-center justify-between gap-2 px-2">
      <span className="text-muted-foreground truncate text-xs font-medium">{children}</span>
      {action}
    </div>
  );
}

/** A quiet, full-width row: the way the top of the sidebar reads in most chat apps. */
function NavItem({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-sidebar-accent focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm outline-none focus-visible:ring-[3px]"
    >
      <Icon className="text-muted-foreground size-4 shrink-0" />
      {children}
    </button>
  );
}

export function AppSidebar(p: Props) {
  const { theme, setTheme } = useTheme();
  const themeIcon = {
    default: <img src={publicUrl('fabled-icon-transparent.svg')} alt="" className="size-4 shrink-0" />,
    dark: <MoonStar />,
    light: <Sun />,
  };
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const selected = p.characters.find((c) => c.id === p.selectedCharacterId);

  return (
    <aside className={cn('bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-72 flex-col border-r', p.className)}>
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 px-4">
        <img src={publicUrl('fabled-icon-transparent.svg')} alt="" className="size-5 shrink-0" />
        <span className="flex-1 text-[15px] font-semibold tracking-tight">Fabled</span>
        {p.onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground -mr-1.5 hidden md:inline-flex"
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

      <nav className="space-y-0.5 px-2 pb-2">
        <NavItem icon={SquarePen} onClick={p.onCreateCharacter}>
          New character
        </NavItem>
        <NavItem icon={Upload} onClick={p.onImport}>
          Import character
        </NavItem>
        <NavItem icon={LayoutGrid} onClick={p.onBrowseCharacters}>
          All characters
        </NavItem>
      </nav>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <SectionLabel>Characters</SectionLabel>
        {p.characters.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">No characters yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {p.characters.map((c) => {
              const active = c.id === p.selectedCharacterId;
              return (
                <li key={c.id} className="group/item relative">
                  <button
                    onClick={() => p.onSelectCharacter(c.id)}
                    aria-current={active || undefined}
                    className={cn(
                      'hover:bg-sidebar-accent focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2.5 rounded-lg px-2 pr-9 text-left text-sm outline-none focus-visible:ring-[3px]',
                      active && 'bg-sidebar-accent font-medium',
                    )}
                  >
                    <CharacterAvatar
                      name={c.name}
                      file={c.avatar}
                      className="size-6 rounded-md"
                      fallbackClassName="text-[10px]"
                    />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Options for ${c.name}`}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 hover-capable:opacity-0 hover-capable:group-hover/item:opacity-100 hover-capable:focus-visible:opacity-100 hover-capable:data-[state=open]:opacity-100"
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
                // Chats made before naming existed carry a generated title; it
                // is not a name anybody chose, so fall back to the date for it.
                const named = c.title.trim() && !c.title.startsWith(`${selected.name} ${EM_DASH}`) ? c.title : '';
                // A chat is called by its date until you call it something else,
                // so renaming starts from the date rather than from nothing.
                const byDate = formatDate(c.created_at);
                const startRename = () => {
                  setRenaming(c.id);
                  setDraft(named || byDate);
                };
                const commit = () => {
                  if (renaming !== c.id) return;
                  setRenaming(null);
                  const next = draft.trim() === byDate ? '' : draft.trim();
                  if (next !== named) p.onRenameChat(c.id, next);
                };

                return (
                  <li key={c.id} className="group/item relative">
                    {renaming === c.id ? (
                      <Input
                        autoFocus
                        value={draft}
                        aria-label="Chat name"
                        placeholder={byDate}
                        className="bg-background h-9 text-sm"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commit();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <>
                        <button
                          // Clicking the chat you are already in renames it, the
                          // way a file does. Clicking another one opens it.
                          onClick={() => (active ? startRename() : p.onSelectChat(c.id))}
                          aria-current={active || undefined}
                          title={active ? 'Click again to rename' : undefined}
                          className={cn(
                            'hover:bg-sidebar-accent focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2.5 rounded-lg px-2 pr-16 text-left text-sm outline-none focus-visible:ring-[3px]',
                            active && 'bg-sidebar-accent font-medium',
                          )}
                        >
                          {c.branched_from ? (
                            <GitBranch className="text-muted-foreground size-4 shrink-0" />
                          ) : (
                            <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{named || byDate}</span>
                          <span className="text-muted-foreground text-xs tabular-nums max-md:hidden hover-capable:group-hover/item:opacity-0">
                            {c.message_count ?? 0}
                          </span>
                        </button>
                        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center hover-capable:opacity-0 hover-capable:group-hover/item:opacity-100 hover-capable:focus-within:opacity-100">
                          <Button variant="ghost" size="icon-xs" aria-label="Rename chat" onClick={startRename}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete chat"
                            onClick={() => p.onDeleteChat(c.id)}
                            className="hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-sidebar-border flex items-center gap-1 border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex-1 justify-start">
              <Settings2 />
              Settings
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-48">
            {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem key={value} onSelect={() => p.onOpenSettings(value)}>
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
