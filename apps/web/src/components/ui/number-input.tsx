import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  className,
}: NumberInputProps) {
  function decrement() {
    if (value === undefined || value === null) return;
    const next = value - 1;
    if (min !== undefined && next < min) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  }

  function increment() {
    const next = (value ?? 0) + 1;
    if (max !== undefined && next > max) return;
    onChange(next);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      onChange(undefined);
      return;
    }
    let v = parseInt(raw, 10);
    if (max !== undefined && v > max) v = max;
    if (min !== undefined && v < min) {
      onChange(undefined);
      return;
    }
    onChange(v);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded border border-border bg-[rgba(0,0,0,0.25)]",
        className
      )}
    >
      <button
        type="button"
        onClick={decrement}
        className="flex h-full items-center px-1.5 text-text-muted transition-colors hover:text-neon-pink"
      >
        <Minus className="h-2.5 w-2.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-8 bg-transparent py-0.5 text-center text-[11px] text-cream placeholder:text-text-muted focus:outline-none"
      />
      <button
        type="button"
        onClick={increment}
        className="flex h-full items-center px-1.5 text-text-muted transition-colors hover:text-neon-pink"
      >
        <Plus className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
