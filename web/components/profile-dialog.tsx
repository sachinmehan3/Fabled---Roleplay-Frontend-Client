import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { avatarUrl, CharacterAvatar } from '@/components/character-avatar';

export interface ProfileField {
  label: string;
  text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  avatar: string | null;
  subtitle?: string;
  tags?: string[];
  fields: ProfileField[];
  editLabel?: string;
  onEdit?: () => void;
}

/** The expanded card behind an avatar: full picture, name, and the card's text fields. */
export function ProfileDialog({ open, onOpenChange, name, avatar, subtitle, tags, fields, editLabel, onEdit }: Props) {
  const url = avatarUrl(avatar);
  const filled = fields.filter((f) => f.text.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5">
          {url ? (
            <img src={url} alt={name} className="max-h-72 w-auto max-w-full rounded-xl border object-contain shadow-sm" />
          ) : (
            <CharacterAvatar name={name} className="size-24" fallbackClassName="text-2xl" />
          )}
          <DialogHeader className="items-center gap-1 text-center">
            <DialogTitle className="text-xl">{name}</DialogTitle>
            <DialogDescription>{subtitle || 'No description yet.'}</DialogDescription>
          </DialogHeader>
          {!!tags?.length && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-[45vh] space-y-4 overflow-y-auto border-t px-6 py-5">
          {filled.length === 0 ? (
            <p className="text-muted-foreground text-sm">This card has no details filled in yet.</p>
          ) : (
            filled.map((f) => (
              <div key={f.label} className="grid gap-1">
                <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{f.label}</div>
                <p className="text-sm whitespace-pre-wrap">{f.text}</p>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button onClick={onEdit}>
              <Pencil />
              {editLabel ?? 'Edit card'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
