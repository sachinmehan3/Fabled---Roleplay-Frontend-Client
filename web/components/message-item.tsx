import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronRight as Caret,
  Copy,
  GitBranch,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { Message } from '@/types';
import { renderMarkdown } from '@/markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CharacterAvatar } from '@/components/character-avatar';

interface Props {
  message?: Message; // undefined for the not-yet-saved streaming reply
  name: string;
  avatar: string | null;
  text: string;
  streaming?: boolean;
  isLast: boolean;
  busy: boolean;
  onSwipe?: (dir: -1 | 1) => void;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onOpenProfile?: () => void;
  onOpenDetails?: () => void;
  onBranch?: () => void;
  onImpersonate?: () => void;
  /** Draw a panel behind the message. Off leaves plain text on the page. */
  bubble?: boolean;
  /** Delete mode: the row becomes a target rather than a conversation. */
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Thinking as it streams in, for the reply being written right now. */
  reasoning?: string;
  /** Size of the saved thinking, so the toggle can appear without fetching it. */
  reasoningChars?: number;
  /** Fetches the saved thinking when the reader opens the panel. */
  onLoadReasoning?: () => Promise<string>;
}

/** What the model worked through before answering, folded away until asked for. */
function Thinking({
  live,
  chars,
  onLoad,
}: {
  live?: string;
  chars?: number;
  onLoad?: () => Promise<string>;
}) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Follows along while it streams, then folds itself away once the reply lands.
  const open = toggled ?? !!live;
  const text = live || loaded;

  const toggle = async () => {
    const next = !open;
    setToggled(next);
    if (!next || live || loaded || !onLoad) return;
    setLoading(true);
    try {
      setLoaded(await onLoad());
    } catch {
      setLoaded('This reply’s thinking could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const size = live ? live.length : (chars ?? 0);

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs outline-none focus-visible:ring-[3px]"
      >
        {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
        {live ? 'Thinking' : 'Thought'} {size ? `· ${size.toLocaleString()} characters` : ''}
        <Caret className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="border-border/60 text-muted-foreground mt-1 max-h-64 overflow-y-auto border-l-2 pl-3 text-xs whitespace-pre-wrap">
          {text || (loading ? '' : 'Nothing was recorded for this reply.')}
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className={cn('text-muted-foreground', className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const MessageItem = memo(function MessageItem(p: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => renderMarkdown(p.text), [p.text]);

  const m = p.message;
  const isUser = m?.role === 'user';
  // Every reply can be asked for another version, so every reply shows the count.
  const canSwipe = !!m && m.role === 'assistant';
  const atLastSwipe = !!m && m.swipe_index >= m.swipes.length - 1;
  const total = m?.swipes.length ?? 0;
  const current = m ? m.swipe_index + 1 : 0;
  const time = m ? new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

  const copy = async () => {
    await navigator.clipboard?.writeText(p.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // User messages mirror the assistant layout: avatar on the right, actions on the left.
  return (
    <article
      data-role={m?.role ?? 'assistant'}
      onClick={p.selecting ? p.onSelect : undefined}
      className={cn(
        'group/msg flex gap-4 py-4',
        isUser && 'flex-row-reverse',
        p.selecting && 'cursor-pointer rounded-xl px-2 transition-colors',
        p.selecting && (p.selected ? 'bg-destructive/10' : 'hover:bg-accent/40'),
      )}
    >
      {p.selecting && (
        <span
          aria-hidden
          className={cn(
            'mt-3 flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
            p.selected && 'bg-destructive border-destructive text-white',
          )}
        >
          {p.selected && <Check className="size-3.5" />}
        </span>
      )}
      <CharacterAvatar
        name={p.name}
        file={p.avatar}
        className="mt-0.5 size-12"
        onClick={p.onOpenProfile}
        label={`View ${p.name}'s card`}
      />

      <div className="min-w-0 flex-1">
        {/* Your side is only as wide as what you wrote. Keeping the controls and
            the bubble in one column that shrinks to fit lines them up with each
            other rather than with the page. */}
        <div className={cn(isUser && 'ml-auto flex max-w-[92%] flex-col', isUser && (editing ? 'w-full' : 'w-fit'))}>
          <div className={cn('flex h-7 items-center gap-2', isUser && 'flex-row-reverse')}>
          <button
            type="button"
            onClick={p.onOpenProfile}
            disabled={!p.onOpenProfile}
            className={cn(
              'text-sm font-semibold outline-none enabled:hover:underline disabled:cursor-default',
              !isUser && 'text-primary',
            )}
          >
            {p.name}
          </button>
          {time && <span className="text-muted-foreground text-xs">{time}</span>}

          {m && !editing && !p.busy && !p.selecting && (
            <div
              className={cn(
                'flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100',
                isUser ? 'mr-auto' : 'ml-auto',
              )}
            >
              <IconAction label={copied ? 'Copied' : 'Copy'} onClick={copy}>
                {copied ? <Check /> : <Copy />}
              </IconAction>
              <IconAction
                label="Edit"
                onClick={() => {
                  setDraft(m.swipes[m.swipe_index] ?? '');
                  setEditing(true);
                }}
              >
                <Pencil />
              </IconAction>
              {m.role === 'assistant' && (
                <IconAction label="Generation details" onClick={p.onOpenDetails}>
                  <Activity />
                </IconAction>
              )}
              {m.role === 'assistant' && (
                <IconAction label="Regenerate" onClick={p.onRegenerate}>
                  <RefreshCw />
                </IconAction>
              )}
              {isUser && p.onImpersonate && (
                <IconAction label="Write this message for me" onClick={p.onImpersonate}>
                  <Wand2 />
                </IconAction>
              )}
              {m.role === 'assistant' && p.onBranch && (
                <IconAction label="Branch a new chat from here" onClick={p.onBranch}>
                  <GitBranch />
                </IconAction>
              )}
              <IconAction label="Delete" onClick={p.onDelete} className="hover:text-destructive">
                <Trash2 />
              </IconAction>
            </div>
          )}
        </div>

        {!isUser && (p.reasoning || p.reasoningChars) && !editing && (
          <Thinking live={p.reasoning} chars={p.reasoningChars} onLoad={p.onLoadReasoning} />
        )}

        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              aria-label="Edit message"
              className="bg-background max-h-[60vh] font-serif text-[15px]"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  p.onEdit?.(draft);
                  setEditing(false);
                }
              }}
            />
            <div className={cn('flex gap-2', isUser && 'justify-end')}>
              <Button
                size="sm"
                onClick={() => {
                  p.onEdit?.(draft);
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1">
            <div className={cn(p.bubble && 'bg-muted/60 rounded-xl px-4 py-3')}>
              {p.streaming && !p.text ? (
                <span className="rp-typing text-muted-foreground inline-flex gap-1 py-2" aria-label="Generating">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <div className="rp-prose" dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          </div>
        )}

        {canSwipe && !editing && !p.selecting && !p.streaming && (
          <div className="text-muted-foreground mt-1.5 -ml-2 flex items-center gap-0.5 text-xs">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Previous version"
              disabled={p.busy || m.swipe_index === 0}
              onClick={() => p.onSwipe?.(-1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-9 text-center tabular-nums">
              {current} / {total}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={atLastSwipe ? 'Generate another version' : 'Next version'}
                  disabled={p.busy}
                  onClick={() => p.onSwipe?.(1)}
                >
                  <ChevronRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{atLastSwipe ? 'Generate another version' : 'Next version'}</TooltipContent>
            </Tooltip>
          </div>
          )}
        </div>
      </div>
    </article>
  );
});
