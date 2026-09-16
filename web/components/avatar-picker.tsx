import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CharacterAvatar } from '@/components/character-avatar';

interface Props {
  name: string;
  /** Avatar file already stored on the server. */
  file: string | null;
  /** Newly picked image, not uploaded yet. */
  pending: File | null;
  /** True when the saved avatar is staged for removal. */
  cleared: boolean;
  /** A File to stage, or null to clear. */
  onChange: (file: File | null) => void;
  hint?: string;
}

export function AvatarPicker({ name, file, pending, cleared, onChange, hint }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const shown = cleared && !pending ? null : file;
  const hasImage = !!pending || !!shown;

  return (
    <div className="flex items-center gap-4">
      <CharacterAvatar name={name} file={shown} src={preview} className="size-20" fallbackClassName="text-xl" />
      <div className="grid gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <ImagePlus />
            {hasImage ? 'Change image' : 'Upload image'}
          </Button>
          {hasImage && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X />
              Remove
            </Button>
          )}
        </div>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
