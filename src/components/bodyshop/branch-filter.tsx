"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown } from "lucide-react";

type Branch = { id: string; name: string };

/**
 * Menu is portaled to <body> rather than positioned via CSS `absolute` —
 * Safari sometimes lets a `panel-surface` (backdrop-filter) sibling paint
 * over an absolutely-positioned dropdown despite a higher z-index. Position
 * is computed from the button's real on-screen rect instead.
 */
export function BranchFilter({
  branches,
  value,
  onChange,
}: {
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    };
    updatePos();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  if (branches.length <= 1) return null;

  const selectedLabel =
    value === "All" ? "All Branches" : branches.find((b) => b.id === value)?.name ?? "All Branches";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="focus-ring inline-flex min-h-10 items-center gap-2 pl-3.5 pr-3 py-2.5 bg-slate-50/90 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-white hover:border-slate-300 transition-colors"
      >
        <Building2 className="w-4 h-4 text-slate-400" />
        <span className="whitespace-nowrap">{selectedLabel}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-52 py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-900/10 overflow-hidden"
          >
            {[{ id: "All", name: "All Branches" }, ...branches].map((b) => {
              const selected = value === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition-colors ${
                    selected ? "bg-sky-50 text-sky-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {b.name}
                  {selected && <Check className="w-4 h-4 text-sky-600" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
