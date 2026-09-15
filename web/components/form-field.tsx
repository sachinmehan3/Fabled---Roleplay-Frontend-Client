import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** Label + control + hint, the layout every settings and card field uses. */
export function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
