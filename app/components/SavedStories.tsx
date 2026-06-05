"use client";

import { useState } from "react";
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

export default function SavedStories({
  saved,
  currentStory,
  onSave,
  onLoad,
  onDelete,
}: {
  saved: SavedStory[];
  currentStory: string;
  onSave: (name: string) => void;
  onLoad: (item: SavedStory) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const canSave = currentStory.trim().length > 0;

  function handleSave() {
    const finalName = name.trim() || suggestName(currentStory);
    onSave(finalName);
    setName("");
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg ring-2 ring-indigo-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
        aria-expanded={open}
      >
        <h2 className="text-xl font-semibold text-indigo-600">
          📂 My Saved Stories
        </h2>
        <span className="flex items-center gap-2 text-indigo-500">
          {saved.length > 0 && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-medium">
              {saved.length}
            </span>
          )}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            <ul className="mt-3 space-y-2">
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
      )}
    </div>
  );
}
