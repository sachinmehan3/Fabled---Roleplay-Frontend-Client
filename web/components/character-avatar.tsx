import type { CSSProperties } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Twelve hues around the wheel. The tint is applied in index.css at a low chroma,
 * so a name stays recognisable at a glance without the avatar shouting.
 */
export function hueFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 12) * 30 + 15;
}

/** First letter of the first and last word: "Callie Veiger" -> CV, "Lyra" -> L. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** URL for an avatar stored on the server. */
export const avatarUrl = (file?: string | null) => (file ? `/api/avatars/${file}` : null);

export function CharacterAvatar({
  name,
  file,
  src,
  className,
  fallbackClassName,
  onClick,
  label,
}: {
  name: string;
  /** File name in data/avatars. */
  file?: string | null;
  /** Any other image URL (a local preview, say); wins over `file`. */
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
  /** When set the avatar becomes a button — used to open the profile card. */
  onClick?: () => void;
  label?: string;
}) {
  const url = src ?? avatarUrl(file);
  const avatar = (
    <Avatar
      className={cn('rp-avatar size-9', className)}
      style={{ '--avatar-hue': `${hueFor(name)}deg` } as CSSProperties}
    >
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback className={cn('rp-avatar-fallback text-xs', fallbackClassName)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );

  if (!onClick) return avatar;
  // h-fit keeps the button from stretching to the height of the message row it sits in.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? `View ${name}`}
      className="focus-visible:ring-ring/50 h-fit shrink-0 rounded-full outline-none transition hover:opacity-80 focus-visible:ring-[3px]"
    >
      {avatar}
    </button>
  );
}
