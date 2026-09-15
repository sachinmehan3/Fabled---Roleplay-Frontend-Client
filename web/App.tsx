import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/api';
import type { Character, Chat, Settings } from '@/types';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';
import { AppSidebar } from '@/components/app-sidebar';
import { ChatView } from '@/components/chat-view';
import { CharacterDialog } from '@/components/character-dialog';
import { CharacterGallery } from '@/components/character-gallery';
import { EmptyState } from '@/components/empty-state';
import { SettingsDialog, type SettingsTab } from '@/components/settings-dialog';

export function App() {
  const confirm = useConfirm();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connection');
  const [editorOpen, setEditorOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null); // null = creating a new card
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile slide-over
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem('rp-sidebar') !== 'closed'; // desktop column
    } catch {
      return true;
    }
  });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('rp-sidebar', railOpen ? 'open' : 'closed');
    } catch {
      /* storage unavailable */
    }
  }, [railOpen]);

  // One control reopens it at any width: the two states never apply at the same breakpoint.
  const openSidebar = () => {
    setRailOpen(true);
    setSidebarOpen(true);
  };

  const character = characters.find((c) => c.id === characterId) ?? null;

  // Run an async action and surface failures as a toast.
  const run = useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
      (...args: A) => {
        fn(...args).catch((e: Error) => toast.error(e.message));
      },
    [],
  );

  useEffect(() => {
    run(async () => {
      const [s, cs] = await Promise.all([api.getSettings(), api.listCharacters()]);
      setSettings(s);
      setCharacters(cs);
      if (!s.model) setSettingsOpen(true);
    })();
  }, [run]);

  const refreshChats = useCallback(async (charId: number) => {
    const list = await api.listChats(charId);
    setChats(list);
    return list;
  }, []);

  const openCharacter = async (id: number) => {
    setCharacterId(id);
    setSidebarOpen(false);
    const list = await refreshChats(id);
    if (list.length) {
      setChatId(list[0].id);
    } else {
      const chat = await api.createChat(id); // first visit: start a chat automatically
      await refreshChats(id);
      setChatId(chat.id);
    }
  };

  const importCharacter = async (file: File) => {
    const c = await api.importCharacter(file);
    setCharacters(await api.listCharacters());
    toast.success(`Imported ${c.name}`);
    await openCharacter(c.id);
  };

  const openEditor = (target: Character | null) => {
    setEditing(target);
    setEditorOpen(true);
    setSidebarOpen(false);
  };

  // A new card opens its first chat; an edited one just refreshes in place.
  const characterSaved = async (saved: Character, isNew: boolean) => {
    setCharacters(await api.listCharacters());
    if (isNew) await openCharacter(saved.id);
  };

  const openSettings = (tab: SettingsTab = 'connection') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
    setSidebarOpen(false);
  };

  const deleteCharacter = async (id: number) => {
    const c = characters.find((x) => x.id === id);
    const ok = await confirm({
      title: `Delete ${c?.name ?? 'character'}?`,
      description: 'This permanently removes the character and all of its chats.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteCharacter(id);
    setCharacters((cs) => cs.filter((x) => x.id !== id));
    if (characterId === id) {
      setCharacterId(null);
      setChats([]);
      setChatId(null);
    }
    toast.success(`Deleted ${c?.name ?? 'character'}`);
  };

  const newChat = async (charId: number) => {
    const chat = await api.createChat(charId);
    setCharacterId(charId);
    await refreshChats(charId);
    setChatId(chat.id);
    setSidebarOpen(false);
  };

  const deleteChat = async (id: number) => {
    if (!characterId) return;
    const ok = await confirm({
      title: 'Delete this chat?',
      description: 'All messages in this chat will be permanently removed.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteChat(id);
    const list = await refreshChats(characterId);
    if (chatId === id) setChatId(list[0]?.id ?? null);
  };

  const sidebarProps = {
    characters,
    selectedCharacterId: characterId,
    chats,
    selectedChatId: chatId,
    onSelectCharacter: run(openCharacter),
    onImport: () => fileInput.current?.click(),
    onCreateCharacter: () => openEditor(null),
    onBrowseCharacters: () => {
      setGalleryOpen(true);
      setSidebarOpen(false);
    },
    onEditCharacter: (id: number) => openEditor(characters.find((c) => c.id === id) ?? null),
    onDeleteCharacter: run(deleteCharacter),
    onNewChat: run(newChat),
    onSelectChat: (id: number) => {
      setChatId(id);
      setSidebarOpen(false);
    },
    onDeleteChat: run(deleteChat),
    onOpenSettings: () => openSettings('connection'),
  };

  return (
    <div className="bg-background flex h-dvh overflow-hidden">
      <input
        ref={fileInput}
        type="file"
        accept=".png,.json,image/png,application/json"
        hidden
        data-testid="import-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(importCharacter)(f);
          e.target.value = '';
        }}
      />

      {/* Desktop sidebar */}
      <AppSidebar {...sidebarProps} onClose={() => setRailOpen(false)} className={cn(railOpen ? 'hidden md:flex' : 'hidden')} />

      {/* Mobile sidebar (slide-over) */}
      <div
        className={cn('fixed inset-0 z-40 md:hidden', !sidebarOpen && 'pointer-events-none')}
        inert={!sidebarOpen}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={cn('absolute inset-0 bg-black/50 transition-opacity', sidebarOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setSidebarOpen(false)}
        />
        <AppSidebar
          {...sidebarProps}
          className={cn(
            'absolute inset-y-0 left-0 shadow-xl transition-transform duration-200',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        />
      </div>

      <main className="min-w-0 flex-1">
        {character && chatId && settings ? (
          <ChatView
            key={chatId}
            chatId={chatId}
            character={character}
            settings={settings}
            onMessagesChanged={() => refreshChats(character.id).catch(() => {})}
            onNewChat={run(() => newChat(character.id))}
            onOpenSidebar={openSidebar}
            sidebarCollapsed={!railOpen}
            onEditCharacter={() => openEditor(character)}
            onEditUser={() => openSettings('user')}
          />
        ) : (
          <EmptyState
            hasModel={!!settings?.model}
            hasCharacters={characters.length > 0}
            onImport={() => fileInput.current?.click()}
            onCreate={() => openEditor(null)}
            onOpenSettings={() => openSettings('connection')}
            onOpenSidebar={openSidebar}
            sidebarCollapsed={!railOpen}
          />
        )}
      </main>

      <CharacterGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        characters={characters}
        selectedId={characterId}
        onSelect={(id) => {
          setGalleryOpen(false);
          run(openCharacter)(id);
        }}
        onCreate={() => {
          setGalleryOpen(false);
          openEditor(null);
        }}
        onImport={() => {
          setGalleryOpen(false);
          fileInput.current?.click();
        }}
      />

      <CharacterDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        character={editing}
        onSaved={run(characterSaved)}
      />

      {settings && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onSaved={setSettings}
          tab={settingsTab}
        />
      )}
    </div>
  );
}
