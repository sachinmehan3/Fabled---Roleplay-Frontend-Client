import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquarePlus, PanelLeft, Square } from 'lucide-react';
import { toast } from 'sonner';
import { api, generate } from '@/api';
import type { Character, GenerationMeta, Message, Settings } from '@/types';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { avatarUrl, CharacterAvatar } from '@/components/character-avatar';
import { MessageItem } from '@/components/message-item';
import { ProfileDialog } from '@/components/profile-dialog';
import { GenerationDialog } from '@/components/generation-dialog';

interface Props {
  chatId: number;
  character: Character;
  settings: Settings;
  onMessagesChanged: () => void;
  onNewChat: () => void;
  onOpenSidebar: () => void;
  /** When the sidebar is collapsed the button that reopens it is shown at every width. */
  sidebarCollapsed: boolean;
  onEditCharacter: () => void;
  onEditUser: () => void;
}

type Streaming = { mode: 'new' | 'swipe'; text: string } | null;
type Details = { messageId: number; swipeIndex: number; swipeCount: number; meta: GenerationMeta | null };

const applyMacros = (text: string, char: string, user: string) =>
  text.replace(/\{\{char\}\}|<BOT>/gi, char).replace(/\{\{user\}\}|<USER>/gi, user);

const errorToast = (e: unknown) => toast.error((e as Error).message);

export function ChatView({
  chatId,
  character,
  settings,
  onMessagesChanged,
  onNewChat,
  onOpenSidebar,
  sidebarCollapsed,
  onEditCharacter,
  onEditUser,
}: Props) {
  const confirm = useConfirm();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState<Streaming>(null);
  const [input, setInput] = useState('');
  const [profile, setProfile] = useState<'character' | 'user' | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  const reload = useCallback(async () => {
    setMessages(await api.listMessages(chatId));
  }, [chatId]);

  useEffect(() => {
    reload().catch(errorToast);
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, [reload]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const runGeneration = async (mode: 'new' | 'swipe') => {
    const controller = new AbortController();
    abortRef.current = controller;
    stickToBottom.current = true;
    setStreaming({ mode, text: '' });
    try {
      await generate(chatId, mode, {
        signal: controller.signal,
        onDelta: (d) => setStreaming((s) => (s ? { ...s, text: s.text + d } : s)),
      });
    } catch (e) {
      if (!controller.signal.aborted) errorToast(e);
    } finally {
      abortRef.current = null;
      // Small delay after Stop so the server can save the partial reply.
      if (controller.signal.aborted) await new Promise((r) => setTimeout(r, 150));
      await reload().catch(() => {});
      setStreaming(null);
      onMessagesChanged();
    }
  };

  const send = async () => {
    if (streaming) return;
    const text = input.trim();
    try {
      if (text) {
        const msg = await api.sendMessage(chatId, text);
        setInput('');
        setMessages((m) => [...m, msg]);
      } else if (messages.at(-1)?.role !== 'user') {
        return; // nothing to reply to
      }
      await runGeneration('new');
    } catch (e) {
      errorToast(e);
    }
  };

  const swipe = async (msg: Message, dir: -1 | 1) => {
    const next = msg.swipe_index + dir;
    if (next < 0) return;
    if (next >= msg.swipes.length) {
      // Past the last swipe on the latest reply → generate a new alternative.
      if (msg.id === messages.at(-1)?.id && msg.role === 'assistant') await runGeneration('swipe');
      return;
    }
    const updated = await api.updateMessage(msg.id, { swipe_index: next });
    setMessages((ms) => ms.map((m) => (m.id === msg.id ? updated : m)));
  };

  const edit = async (msg: Message, content: string) => {
    const updated = await api.updateMessage(msg.id, { content });
    setMessages((ms) => ms.map((m) => (m.id === msg.id ? updated : m)));
  };

  const remove = async (msg: Message) => {
    const ok = await confirm({
      title: 'Delete this message?',
      description: msg.swipes.length > 1 ? `All ${msg.swipes.length} versions of this message will be removed.` : undefined,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteMessage(msg.id);
    setMessages((ms) => ms.filter((m) => m.id !== msg.id));
    onMessagesChanged();
  };

  const safe =
    <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
    (...a: A) => {
      fn(...a).catch(errorToast);
    };

  const last = messages.at(-1);
  const canRegenerate = !streaming && last?.role === 'assistant';

  // Ctrl/Cmd + Enter regenerates the last reply. The composer handles its own
  // keydown; this covers the rest of the page without stealing the shortcut
  // from a message being edited, or from anything open in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      if (!canRegenerate) return;
      e.preventDefault();
      safe(() => runGeneration('swipe'))();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const macros = (t: string) => applyMacros(t, character.name, settings.userName);
  const { card } = character;
  const userAvatar = settings.userAvatar || null;
  const background = avatarUrl(settings.chatBackground);
  const canSend = !!input.trim() || last?.role === 'user';

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {background && (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <img src={background} alt="" className="size-full object-cover" />
          <div className="bg-background absolute inset-0" style={{ opacity: settings.chatBackgroundDim / 100 }} />
        </div>
      )}
      {/* Header */}
      <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(!sidebarCollapsed && 'md:hidden')}
          onClick={onOpenSidebar}
          aria-label="Open sidebar"
        >
          <PanelLeft />
        </Button>
        <CharacterAvatar
          name={character.name}
          file={character.avatar}
          className="size-8"
          onClick={() => setProfile('character')}
          label={`View ${character.name}'s card`}
        />
        <button
          type="button"
          onClick={() => setProfile('character')}
          className="min-w-0 flex-1 text-left outline-none"
          aria-label={`View ${character.name}'s card`}
        >
          <div className="truncate text-sm font-semibold hover:underline">{character.name}</div>
          {card.creator && <div className="text-muted-foreground truncate text-xs">by {card.creator}</div>}
        </button>
        <div className="hidden items-center gap-1.5 lg:flex">
          {card.tags.slice(0, 4).map((t) => (
            <Badge key={t} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onNewChat} disabled={!!streaming}>
              <MessageSquarePlus />
              <span className="hidden sm:inline">New chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Start a fresh chat with {character.name}</TooltipContent>
        </Tooltip>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {card.scenario && (
            <div className="bg-muted/40 text-muted-foreground mb-4 rounded-xl border border-dashed px-4 py-3 text-sm">
              <span className="text-foreground mr-1.5 font-medium">Scenario</span>
              {macros(card.scenario)}
            </div>
          )}
          <div className="divide-border/60 divide-y">
            {messages.map((m) => {
              const isStreamTarget = streaming?.mode === 'swipe' && m.id === last?.id;
              const isUser = m.role === 'user';
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  name={isUser ? settings.userName : character.name}
                  avatar={isUser ? userAvatar : character.avatar}
                  text={isStreamTarget ? streaming.text : macros(m.swipes[m.swipe_index] ?? '')}
                  streaming={isStreamTarget}
                  isLast={m.id === last?.id}
                  busy={streaming !== null}
                  onSwipe={safe((dir: -1 | 1) => swipe(m, dir))}
                  onRegenerate={safe(() => runGeneration('swipe'))}
                  onEdit={safe((content: string) => edit(m, content))}
                  onDelete={safe(() => remove(m))}
                  onOpenProfile={() => setProfile(isUser ? 'user' : 'character')}
                  onOpenDetails={() =>
                    setDetails({
                      messageId: m.id,
                      swipeIndex: m.swipe_index,
                      swipeCount: m.swipes.length,
                      meta: m.meta?.[m.swipe_index] ?? null,
                    })
                  }
                />
              );
            })}
            {streaming?.mode === 'new' && (
              <MessageItem
                name={character.name}
                avatar={character.avatar}
                text={streaming.text}
                streaming
                isLast
                busy
                onOpenProfile={() => setProfile('character')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-4">
        <form
          className="bg-card focus-within:border-ring focus-within:ring-ring/30 relative rounded-2xl border shadow-sm transition-[box-shadow,border-color] focus-within:ring-[3px]"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            placeholder={`Message ${character.name}…`}
            aria-label="Message"
            rows={1}
            className="max-h-60 min-h-14 resize-none border-0 bg-transparent px-4 pt-3.5 pb-0 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              if (e.ctrlKey || e.metaKey) {
                // Regenerate without losing whatever is half-typed in the box.
                if (!canRegenerate) return;
                e.preventDefault();
                safe(() => runGeneration('swipe'))();
              } else if (!e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-2.5">
            <span className="text-muted-foreground hidden pl-1 text-xs sm:block">
              <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift + Enter</kbd> for a new
              line · <kbd className="font-sans">Ctrl + Enter</kbd> to regenerate
            </span>
            {streaming ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="ml-auto rounded-full"
                aria-label="Stop"
                onClick={() => abortRef.current?.abort()}
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" className="ml-auto rounded-full" aria-label="Send" disabled={!canSend}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>
      </div>

      <ProfileDialog
        open={profile === 'character'}
        onOpenChange={(o) => setProfile(o ? 'character' : null)}
        name={character.name}
        avatar={character.avatar}
        subtitle={card.creator ? `Character card by ${card.creator}` : 'Character card'}
        tags={card.tags}
        fields={[
          { label: 'Description', text: macros(card.description) },
          { label: 'Personality', text: macros(card.personality) },
          { label: 'Scenario', text: macros(card.scenario) },
          { label: 'First message', text: macros(card.first_mes) },
          { label: 'Creator notes', text: card.creator_notes },
        ]}
        editLabel="Edit character"
        onEdit={() => {
          setProfile(null);
          onEditCharacter();
        }}
      />

      {details && (
        <GenerationDialog open onOpenChange={(o) => !o && setDetails(null)} {...details} />
      )}

      <ProfileDialog
        open={profile === 'user'}
        onOpenChange={(o) => setProfile(o ? 'user' : null)}
        name={settings.userName}
        avatar={userAvatar}
        subtitle="Your user card"
        fields={[{ label: 'About you', text: settings.userDescription }]}
        editLabel="Edit user card"
        onEdit={() => {
          setProfile(null);
          onEditUser();
        }}
      />
    </div>
  );
}
