import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useImageUrl } from '@/hooks/use-image-url';
import { Button } from '@/components/ui/button';

interface Props {
  /** Id of the picture already saved in this browser. */
  file: string | null;
  /** Newly picked image, not uploaded yet. */
  pending: File | null;
  /** True when the saved background is staged for removal. */
  cleared: boolean;
  /** 0-100, how far the picture is faded into the page colour. */
  dim: number;
  onChange: (file: File | null) => void;
}

export function BackgroundPicker({ file, pending, cleared, dim, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const stored = useImageUrl(file);
  const shown = preview ?? (cleared ? null : stored);

  return (
    <div className="grid gap-3">
      <div className="bg-muted relative aspect-[16/9] overflow-hidden rounded-xl border">
        {shown ? (
          <>
            <img src={shown} alt="" className="size-full object-cover" />
            {/* The same overlay the chat uses, so this preview is the real thing. */}
            <div className="bg-background absolute inset-0" style={{ opacity: dim / 100 }} />
          </>
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
            No background — chats use the page colour
          </div>
        )}
        <div className="text-foreground/70 absolute bottom-2 left-3 text-xs">Preview</div>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <ImagePlus />
          {shown ? 'Change image' : 'Upload image'}
        </Button>
        {shown && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X />
            Remove
          </Button>
        )}
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
