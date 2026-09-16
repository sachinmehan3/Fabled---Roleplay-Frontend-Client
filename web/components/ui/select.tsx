import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * A select built from the app's own menu, because a native <select> renders its
 * open list in the browser's chrome, which no theme of ours can reach.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  label?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={label} className={cn('h-9 w-full justify-between font-normal', className)}>
          <span className="truncate">{current?.label ?? ''}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        {options.map((o) => (
          <DropdownMenuItem key={String(o.value)} onSelect={() => onChange(o.value)}>
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === value && <Check className="text-primary size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A checkbox drawn from theme tokens rather than the browser's own. */
export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-visible:ring-ring/50 flex items-center gap-2 rounded-md text-left text-xs outline-none focus-visible:ring-[3px]',
        className,
      )}
    >
      <span
        className={cn(
          'border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          checked && 'bg-primary border-primary text-primary-foreground',
        )}
      >
        {checked && <Check className="size-3" />}
      </span>
      {label}
    </button>
  );
}
