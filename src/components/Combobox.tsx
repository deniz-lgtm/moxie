"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

interface ComboboxProps {
  /** Currently selected value (must match one of `options` or be empty). */
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Text shown in the empty-results row. */
  emptyLabel?: string;
  className?: string;
}

/**
 * Searchable single-select combobox. A text input filters `options` as you
 * type; selection is committed only by picking a listed option (keyboard or
 * click), so `value` always stays within `options`.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder = "Search...",
  disabled = false,
  emptyLabel = "No matches",
  className = "",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // When closed, the input shows the committed value rather than the query.
  const display = open ? query : value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function commit(option: string) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIdx]) commit(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => { if (!disabled) { setOpen(true); setActiveIdx(0); } }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
        onKeyDown={onKeyDown}
        className={`w-full text-sm border border-border rounded-xl px-3.5 py-3 min-h-[48px] bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-40 ${className}`}
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
          ) : (
            filtered.map((option, idx) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                onMouseDown={(e) => { e.preventDefault(); commit(option); }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`px-3.5 py-2 text-sm cursor-pointer ${
                  idx === activeIdx ? "bg-accent/10 text-accent" : "text-foreground"
                } ${option === value ? "font-medium" : ""}`}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
