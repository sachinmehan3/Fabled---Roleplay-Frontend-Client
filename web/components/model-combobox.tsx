import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface Props {
  id: string;
  value: string;
  models: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}

/**
 * A model picker that can also be typed into freely. A native <datalist> would
 * be less code, but it renders in the browser's own chrome and ignores the theme.
 */
export function ModelCombobox({ id, value, models, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const query = value.trim().toLowerCase();
  // Once the field holds a whole model name, show everything again so the list
  // stays browsable instead of filtering down to the one already chosen.
  const exact = models.some((m) => m.toLowerCase() === query);
  const matches = !query || exact ? models : models.filter((m) => m.toLowerCase().includes(query));

  useEffect(() => {
    if (open) setActive(Math.max(0, matches.findIndex((m) => m.toLowerCase() === query)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (model: string) => {
    onChange(model);
    setOpen(false);
  };

  const move = (delta: number) =>
    setActive((i) => (matches.length ? (i + delta + matches.length) % matches.length : 0));

  return (
    <div
      ref={wrapper}
      className="relative flex-1"
      onBlur={(e) => {
        if (!wrapper.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        className="pr-9"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => models.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            open ? move(1) : setOpen(true);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === 'Escape' && open) {
            // Close the list without closing the Settings dialog behind it.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />

      {models.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Hide models' : 'Show models'}
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5"
        >
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      )}

      {open && models.length > 0 && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border p-1 shadow-md"
        >
          {matches.length === 0 ? (
            <li className="text-muted-foreground px-2 py-2 text-sm">
              No model matches. Press Enter to use what you typed.
            </li>
          ) : (
            matches.map((model, i) => {
              const selected = model.toLowerCase() === query;
              return (
                <li key={model}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    // Keep focus in the input so the list does not close first.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(model)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
                      i === active && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{model}</span>
                    {selected && <Check className="text-primary size-4 shrink-0" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
