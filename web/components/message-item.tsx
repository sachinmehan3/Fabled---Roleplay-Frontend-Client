import { memo, useMemo, useState, type ReactNode } from 'react';
import { Activity, Check, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react';
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
  const canSwipe = !!m && m.role === 'assistant' && (m.swipes.length > 1 || p.isLast);
  const atLastSwipe = !!m && m.swipe_index >= m.swipes.length - 1;
  const total = m ? (p.streaming ? m.swipes.length + 1 : m.swipes.length) : 0;
  const current = m ? (p.streaming ? total : m.swipe_index + 1) : 0;
  const time = m ? new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

  const copy = async () => {
    await navigator.clipboard?.writeText(p.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // User messages mirror the assistant layout: avatar on the right, actions on the left.
  return (
    <article data-role={m?.role ?? 'assistant'} className={cn('group/msg flex gap-4 py-4', isUser && 'flex-row-reverse')}>
      <CharacterAvatar
        name={p.name}
        file={p.avatar}
        className="mt-0.5"
        onClick={p.onOpenProfile}
        label={`View ${p.name}'s card`}
      />

      <div className="min-w-0 flex-1">
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

          {m && !editing && !p.busy && (
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
              {p.isLast && m.role === 'assistant' && (
                <IconAction label="Regenerate" onClick={p.onRegenerate}>
                  <RefreshCw />
                </IconAction>
              )}
              <IconAction label="Delete" onClick={p.onDelete} className="hover:text-destructive">
                <Trash2 />
              </IconAction>
            </div>
          )}
        </div>

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
          <div className={cn(isUser && 'mt-1 flex justify-end')}>
            <div className={cn(isUser && 'bg-muted/60 max-w-[92%] rounded-xl px-4 py-3')}>
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

        {canSwipe && !editing && (
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
                  disabled={p.busy || (atLastSwipe && !p.isLast)}
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
    </article>
  );
});
