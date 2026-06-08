"use client";

import { useRef, useState } from "react";
import type { ScriptLine, StoryboardScene, StyleCharacter } from "@/lib/types";
import { curiousQuestion } from "@/lib/curiosity";
import SpeakButton from "./SpeakButton";
import ScriptEditor from "./ScriptEditor";
import { voiceOverrideFor } from "@/lib/tts";

export default function StoryboardCard({
  scene,
  index,
  redrawing,
  characters,
  voiceOverrides,
  onChange,
  onRedraw,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDropHere,
}: {
  scene: StoryboardScene;
  index: number;
  redrawing: boolean;
  /** Characters from the story bible, suggested as script speakers. */
  characters: StyleCharacter[];
  /** name (lowercased) -> chosen voice id, passed to the script preview. */
  voiceOverrides?: Record<string, string>;
  onChange: (patch: Partial<StoryboardScene>) => void;
  onRedraw: () => void;
  /** When provided, shows a control to delete this scene from the storyboard. */
  onRemove?: () => void;
  /** Reorder up/down; undefined hides the control (e.g. at the ends). */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Drag-to-reorder: fired when this card starts being dragged. */
  onDragStart?: () => void;
  /** Drag-to-reorder: fired when another card is dropped onto this one. */
  onDropHere?: () => void;
}) {
  const descRef = useRef<HTMLTextAreaElement>(null);
  // Only allow dragging when started from the grip handle, so selecting text in
  // the inputs doesn't accidentally start a drag.
  const [dragReady, setDragReady] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const canDrag = Boolean(onDragStart && onDropHere);
  // Prefer the AI's scene-specific question; fall back to a rich heuristic one.
  const question = scene.question?.trim() || curiousQuestion(scene.description);

  function focusDescription() {
    const el = descRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  return (
    <div
      draggable={dragReady}
      onDragStart={(e) => {
        if (!dragReady) {
          e.preventDefault();
          return;
        }
        setIsDragging(true);
        onDragStart?.();
      }}
      onDragEnd={() => {
        setDragReady(false);
        setIsDragging(false);
      }}
      onDragOver={(e) => {
        if (canDrag) e.preventDefault();
      }}
      onDragEnter={() => {
        if (canDrag) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        setIsOver(false);
        onDropHere?.();
      }}
      className={`animate-pop rounded-3xl bg-white p-3 shadow-lg transition ${
        isOver
          ? "ring-4 ring-purple-400"
          : "ring-2 ring-purple-100"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="mb-2 flex items-center gap-1.5 px-1">
        {canDrag && (
          <button
            type="button"
            aria-label={`Drag to reorder scene ${index + 1}`}
            title="Drag to reorder"
            onPointerDown={() => setDragReady(true)}
            onPointerUp={() => setDragReady(false)}
            className="shrink-0 cursor-grab select-none px-0.5 text-lg leading-none text-purple-300 transition hover:text-purple-500 active:cursor-grabbing"
          >
            ⠿
          </button>
        )}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
          {index + 1}
        </span>
        <input
          value={scene.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded-lg bg-transparent px-1 text-lg font-semibold text-purple-700 outline-none focus:bg-purple-50"
          aria-label={`Scene ${index + 1} title`}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={redrawing}
              aria-label={`Move scene ${index + 1} earlier`}
              title="Move earlier"
              className="flex h-7 w-7 items-center justify-center rounded-full text-purple-400 transition hover:bg-purple-100 hover:text-purple-700 active:scale-95 disabled:opacity-40"
            >
              ⬆️
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={redrawing}
              aria-label={`Move scene ${index + 1} later`}
              title="Move later"
              className="flex h-7 w-7 items-center justify-center rounded-full text-purple-400 transition hover:bg-purple-100 hover:text-purple-700 active:scale-95 disabled:opacity-40"
            >
              ⬇️
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={redrawing}
              aria-label={`Remove scene ${index + 1}`}
              title="Remove this scene"
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-rose-100 hover:text-rose-600 active:scale-95 disabled:opacity-40"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Image preview */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl">
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.imageUrl}
            alt={scene.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${scene.palette} p-4 text-center`}
          >
            {scene.imageBlocked ? (
              <div className="flex flex-col items-center gap-1 text-white">
                <span className="text-3xl">🛡️</span>
                <p className="text-sm font-semibold drop-shadow">
                  We hid this picture. Try changing the description.
                </p>
              </div>
            ) : (
              <p className="animate-bob text-base font-semibold leading-snug text-white drop-shadow-md">
                {scene.description.trim() ||
                  "Describe this picture, then tap Redraw ✏️"}
              </p>
            )}
          </div>
        )}

        {redrawing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex items-center gap-1.5 text-white">
              <span className="h-3 w-3 animate-twinkle rounded-full bg-white" />
              <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.2s]" />
              <span className="h-3 w-3 animate-twinkle rounded-full bg-white [animation-delay:0.4s]" />
              <span className="ml-1 text-sm font-medium drop-shadow">
                Drawing...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Curious-audience question that invites the student to add detail */}
      <button
        type="button"
        onClick={focusDescription}
        className="mt-2 flex w-full items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-left text-sm text-sky-700 ring-1 ring-sky-100 transition hover:bg-sky-100 active:scale-[0.99]"
      >
        <span className="text-base">💭</span>
        <span>
          {question}{" "}
          <span className="font-semibold text-sky-500">Add it →</span>
        </span>
      </button>

      {/* Editable description */}
      <textarea
        ref={descRef}
        value={scene.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={3}
        placeholder="Describe what happens in this scene..."
        className="mt-2 w-full resize-none rounded-xl border-2 border-purple-100 bg-purple-50/40 p-2 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-purple-300 focus:bg-white"
      />

      <ScriptEditor
        script={scene.script ?? []}
        characters={characters}
        voiceOverrides={voiceOverrides}
        onChange={(script: ScriptLine[]) =>
          onChange({ script: script.length > 0 ? script : undefined })
        }
      />

      <div className="mt-2 flex gap-2">
        <button
          onClick={onRedraw}
          disabled={redrawing || !scene.description.trim()}
          className="flex-1 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 shadow transition hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {redrawing ? "Drawing..." : "🔄 Redraw this scene"}
        </button>
        <SpeakButton text={scene.description} label="" speaker="Narrator" voice={voiceOverrideFor("Narrator", voiceOverrides)} className="shrink-0 rounded-xl bg-purple-100 px-3 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-200 active:scale-95" />
      </div>
    </div>
  );
}
