"use client";

import { useEffect, useState } from "react";
import type { SavedStory } from "@/lib/types";

function suggestName(story: string): string {
  const words = story.trim().split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return words ? `${words}${story.trim().split(/\s+/).length > 5 ? "…" : ""}` : "My Story";
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// A dropdown popover (anchored under the header button) that holds the entire
// save / open / delete mechanism for a student's story drafts.
export default function SavedStories({
  saved,
  currentStory,
  open,
  onClose,
  onSave,
  onLoad,
  onDelete,
}: {
  saved: SavedStory[];
  currentStory: string;
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  onLoad: (item: SavedStory) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");

  // Let students press Escape to dismiss the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSave = currentStory.trim().length > 0;

  function handleSave() {
    const finalName = name.trim() || suggestName(currentStory);
    onSave(finalName);
    setName("");
  }

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />

      <div className="absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] origin-top-right animate-pop rounded-3xl bg-white p-4 text-left text-gray-800 shadow-2xl ring-2 ring-indigo-100">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-indigo-600">
            📂 My Saved Stories
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-0.5 text-indigo-400 transition hover:bg-indigo-50 hover:text-indigo-600"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
            placeholder={
              canSave ? suggestName(currentStory) : "Write a story to save it"
            }
            disabled={!canSave}
            className="min-w-0 flex-1 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:bg-white disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white shadow transition hover:bg-indigo-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            💾 Save
          </button>
        </div>

        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">
            No saved stories yet. Save one to come back to it anytime!
          </p>
        ) : (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-0.5">
            {saved.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-2xl bg-indigo-50 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-indigo-800">
                    {item.name}
                  </p>
                  <p className="text-xs text-indigo-400">
                    {item.rating === "teens" ? "Teens" : "Younger Kids"} ·{" "}
                    {formatDate(item.savedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoad(item)}
                  className="shrink-0 rounded-lg bg-white px-3 py-1 text-sm font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-100 active:scale-95"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Delete ${item.name}`}
                  className="shrink-0 rounded-lg bg-white px-2 py-1 text-sm text-rose-500 shadow-sm transition hover:bg-rose-50 active:scale-95"
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
