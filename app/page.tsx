"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnimationStyleId,
  FeedbackResponse,
  MovieResponse,
  Rating,
  SavedStory,
  Scene,
  StatusResponse,
  StoryboardResponse,
  StoryboardScene,
  StoryboardVersion,
  StyleGuide,
} from "@/lib/types";
import { ANIMATION_STYLES, RATINGS } from "@/lib/types";
import SceneCard from "./components/SceneCard";
import MoviePlayer from "./components/MoviePlayer";
import StoryboardCard from "./components/StoryboardCard";
import SpeakButton from "./components/SpeakButton";
import VoicePicker from "./components/VoicePicker";
import WritingChecklist from "./components/WritingChecklist";
import WordBoosters from "./components/WordBoosters";
import DictateButton from "./components/DictateButton";
import SavedStories from "./components/SavedStories";
import GlowUpMeter from "./components/GlowUpMeter";
import { scoreStory } from "@/lib/storyScore";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Renders the story with any flagged words wrapped in a highlight, so a child
// can see exactly which parts to change.
function highlightStory(text: string, terms: string[]) {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return text;
  const re = new RegExp(`(${cleaned.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded bg-rose-200 px-0.5 font-semibold text-rose-900 ring-1 ring-rose-300"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// Friendly placeholder gradients for student-added storyboard panels.
const EXTRA_PALETTES = [
  "from-sky-400 via-indigo-400 to-purple-500",
  "from-amber-300 via-orange-400 to-rose-500",
  "from-emerald-300 via-teal-400 to-cyan-500",
  "from-fuchsia-400 via-pink-400 to-rose-400",
  "from-lime-300 via-green-400 to-emerald-500",
  "from-violet-400 via-purple-400 to-indigo-500",
];

export default function Home() {
  const [story, setStory] = useState("");
  const [rating, setRating] = useState<Rating>("kids");
  const [styleId, setStyleId] = useState<AnimationStyleId>("pixar3d");
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResponse | null>(null);
  const [movie, setMovie] = useState<MovieResponse | null>(null);

  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingStoryboard, setLoadingStoryboard] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [redrawing, setRedrawing] = useState<Record<string, boolean>>({});

  const [error, setError] = useState<string | null>(null);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [safetyTerms, setSafetyTerms] = useState<string[]>([]);
  const [adjustNotice, setAdjustNotice] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{
    title: string;
    subtitle?: string;
    showCompare?: boolean;
  } | null>(null);

  const [versions, setVersions] = useState<StoryboardVersion[]>([]);
  const [comparing, setComparing] = useState(false);

  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ratingRef = useRef<Rating>(rating);
  const skipDraftSave = useRef(true);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lastScoreRef = useRef<number | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordCount = story.trim() ? story.trim().split(/\s+/).length : 0;

  function focusEditor() {
    const el = editorRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  function celebrate(c: {
    title: string;
    subtitle?: string;
    showCompare?: boolean;
  }) {
    setCelebration(c);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebration(null), 6000);
  }

  // Restore rating, the in-progress draft, and saved stories on first load.
  useEffect(() => {
    const savedRating = localStorage.getItem("storyStudioRating");
    if (savedRating === "teens" || savedRating === "kids") setRating(savedRating);
    const savedStyle = localStorage.getItem("storyStudioStyle");
    if (savedStyle && ANIMATION_STYLES.some((s) => s.id === savedStyle)) {
      setStyleId(savedStyle as AnimationStyleId);
    }
    const draft = localStorage.getItem("storyStudioDraft");
    if (draft) setStory(draft);
    try {
      const raw = localStorage.getItem("storyStudioSaved");
      if (raw) setSavedStories(JSON.parse(raw) as SavedStory[]);
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    ratingRef.current = rating;
    localStorage.setItem("storyStudioRating", rating);
  }, [rating]);

  useEffect(() => {
    localStorage.setItem("storyStudioStyle", styleId);
  }, [styleId]);

  // Auto-save the current draft so work survives a refresh or closed tab.
  useEffect(() => {
    if (skipDraftSave.current) {
      skipDraftSave.current = false;
      return;
    }
    try {
      localStorage.setItem("storyStudioDraft", story);
    } catch {
      // ignore quota errors
    }
  }, [story]);

  function persistSaved(next: SavedStory[]) {
    setSavedStories(next);
    try {
      localStorage.setItem("storyStudioSaved", JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }

  function saveStory(name: string) {
    if (!story.trim()) return;
    const entry: SavedStory = {
      id: `s-${Date.now()}`,
      name,
      story,
      rating,
      savedAt: Date.now(),
    };
    persistSaved([entry, ...savedStories]);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  }

  function loadStory(item: SavedStory) {
    clearBanners();
    stopPolling();
    setStory(item.story);
    setRating(item.rating);
    setStoryboard(null);
    setMovie(null);
    setVersions([]);
    setComparing(false);
    setSavedOpen(false);
  }

  function deleteStory(id: string) {
    persistSaved(savedStories.filter((s) => s.id !== id));
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  function clearBanners() {
    setError(null);
    setSafetyMessage(null);
    setSafetyTerms([]);
    setAdjustNotice(null);
  }

  async function getFeedback() {
    clearBanners();
    setLoadingFeedback(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not get tips.");
      if (data.blocked) return setSafetyMessage(data.message as string);
      setFeedback(data as FeedbackResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoadingFeedback(false);
    }
  }

  async function makeStoryboard() {
    clearBanners();
    setComparing(false);
    const hadPrevious = Boolean(storyboard);
    const newScore = scoreStory(story).score;
    const prevScore = lastScoreRef.current;
    // Save the current storyboard as a previous draft before replacing it.
    if (storyboard) {
      setVersions((prev) => [
        ...prev,
        {
          id: `v-${Date.now()}`,
          createdAt: Date.now(),
          label: `Draft ${prev.length + 1}`,
          story,
          rating,
          title: storyboard.title,
          scenes: storyboard.scenes,
        },
      ]);
    }
    setLoadingStoryboard(true);
    setStoryboard(null);
    setMovie(null);
    stopPolling();
    try {
      const res = await fetch("/api/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, rating, styleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not make storyboard.");
      if (data.blocked) {
        setSafetyTerms((data.terms as string[]) ?? []);
        setSafetyMessage(data.message as string);
        return;
      }
      const board = data as StoryboardResponse;
      setStoryboard(board);
      if (board.adjusted) {
        setAdjustNotice(
          board.adjustmentNote ||
            "We gently adjusted a few parts of your story to keep it right for the chosen audience."
        );
      }
      // Reward a revision: celebrate when a re-made storyboard improved.
      if (hadPrevious && prevScore !== null && newScore > prevScore) {
        celebrate({
          title: `You made your story better! +${newScore - prevScore} points ✨`,
          subtitle: "Your revising is paying off — keep it up!",
          showCompare: true,
        });
      }
      lastScoreRef.current = newScore;
      // Stream preview images in one scene at a time (kept responsive).
      void generateInitialImages(board.scenes, board.styleGuide);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoadingStoryboard(false);
    }
  }

  async function fetchSceneImage(
    scene: StoryboardScene,
    styleGuide?: StyleGuide
  ) {
    const res = await fetch("/api/scene-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: scene.description, rating, styleGuide }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not draw scene.");
    return data as {
      imageUrl?: string | null;
      imageBlocked?: boolean;
      mock?: boolean;
      blocked?: boolean;
    };
  }

  async function generateInitialImages(
    scenes: StoryboardScene[],
    styleGuide?: StyleGuide
  ) {
    for (const scene of scenes) {
      if (scene.mock || scene.imageUrl) continue;
      setRedrawing((r) => ({ ...r, [scene.id]: true }));
      try {
        const data = await fetchSceneImage(scene, styleGuide);
        if (data.blocked) updateScene(scene.id, { imageBlocked: true });
        else
          updateScene(scene.id, {
            imageUrl: data.imageUrl ?? null,
            imageBlocked: data.imageBlocked,
            mock: data.mock,
          });
      } catch {
        // Leave the animated placeholder; the student can redraw manually.
      } finally {
        setRedrawing((r) => ({ ...r, [scene.id]: false }));
      }
    }
  }

  function updateScene(id: string, patch: Partial<StoryboardScene>) {
    setStoryboard((prev) =>
      prev
        ? {
            ...prev,
            scenes: prev.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          }
        : prev
    );
  }

  function addScene() {
    clearBanners();
    setStoryboard((prev) => {
      if (!prev) return prev;
      const n = prev.scenes.length;
      const newScene: StoryboardScene = {
        id: `panel-extra-${Date.now()}`,
        title: `Scene ${n + 1}`,
        description: "",
        imageUrl: null,
        palette: EXTRA_PALETTES[n % EXTRA_PALETTES.length],
        mock: prev.mock,
      };
      return { ...prev, scenes: [...prev.scenes, newScene] };
    });
  }

  function removeScene(id: string) {
    setStoryboard((prev) =>
      prev ? { ...prev, scenes: prev.scenes.filter((s) => s.id !== id) } : prev
    );
    setRedrawing((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }

  async function redrawScene(scene: StoryboardScene) {
    clearBanners();
    setRedrawing((r) => ({ ...r, [scene.id]: true }));
    try {
      const data = await fetchSceneImage(scene, storyboard?.styleGuide);
      if (data.blocked)
        return setSafetyMessage(
          (data as { message?: string }).message || "Let's keep it appropriate."
        );
      updateScene(scene.id, {
        imageUrl: data.imageUrl ?? null,
        imageBlocked: data.imageBlocked,
        mock: data.mock,
      });
      if (!data.mock && data.imageUrl) {
        celebrate({ title: "Nice edit! Your scene got a glow-up ✨" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRedrawing((r) => ({ ...r, [scene.id]: false }));
    }
  }

  async function createVideo() {
    if (!storyboard) return;
    clearBanners();
    setLoadingVideo(true);
    setMovie(null);
    stopPolling();
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          styleGuide: storyboard.styleGuide,
          scenes: storyboard.scenes.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            palette: s.palette,
            imageUrl: s.imageUrl,
            script: s.script,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not make video.");
      if (data.blocked) {
        setSafetyTerms((data.terms as string[]) ?? []);
        setSafetyMessage(data.message as string);
        return;
      }
      const movieData = { ...(data as MovieResponse), title: storyboard.title };
      setMovie(movieData);
      startPolling(movieData.scenes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoadingVideo(false);
    }
  }

  function startPolling(scenes: Scene[]) {
    const pending = scenes.filter(
      (s) => s.predictionId && s.status !== "succeeded" && s.status !== "failed"
    );
    if (pending.length === 0) return;

    pollRef.current = setInterval(async () => {
      let allDone = true;
      const updates = await Promise.all(
        scenes.map(async (s) => {
          if (!s.predictionId || s.status === "succeeded" || s.status === "failed") {
            return s;
          }
          try {
            const res = await fetch(
              `/api/status?id=${s.predictionId}&rating=${ratingRef.current}`
            );
            const data = (await res.json()) as StatusResponse;
            if (data.status !== "succeeded" && data.status !== "failed") {
              allDone = false;
            }
            return {
              ...s,
              status: data.status,
              videoUrl: data.videoUrl,
              safetyBlocked: data.safetyBlocked,
            };
          } catch {
            allDone = false;
            return s;
          }
        })
      );
      scenes = updates;
      setMovie((prev) => (prev ? { ...prev, scenes: updates } : prev));
      if (allDone) stopPolling();
    }, 3000);
  }

  const anyRedrawing = Object.values(redrawing).some(Boolean);
  const imagesReady = storyboard
    ? storyboard.scenes.filter((s) => s.imageUrl || s.imageBlocked).length
    : 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-6 py-5 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="animate-bob text-4xl">🎬</span>
          <div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              Story Studio
            </h1>
            <p className="text-sm text-white/90">
              Write a story, design your storyboard, then make a movie!
            </p>
          </div>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setSavedOpen((o) => !o)}
              aria-expanded={savedOpen}
              className="flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold backdrop-blur transition hover:bg-white/30 active:scale-95"
            >
              📂 My Saved Stories
              {savedStories.length > 0 && (
                <span className="rounded-full bg-white/30 px-2 py-0.5 text-xs font-bold">
                  {savedStories.length}
                </span>
              )}
            </button>
            <SavedStories
              saved={savedStories}
              currentStory={story}
              open={savedOpen}
              onClose={() => setSavedOpen(false)}
              onSave={saveStory}
              onLoad={loadStory}
              onDelete={deleteStory}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-2">
        {/* Writing panel */}
        <section className="flex flex-col gap-4">
          <div className="rounded-3xl bg-white p-5 shadow-lg ring-2 ring-purple-100">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-purple-700">✏️ My Story</h2>
              <div className="flex items-center gap-2">
                <DictateButton
                  onText={(t) =>
                    setStory((s) => (s.trim() ? `${s.trim()} ${t}` : t))
                  }
                />
                {story.trim() && (
                  <>
                    <VoicePicker />
                    <SpeakButton text={story} label="Read aloud" />
                  </>
                )}
                <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
                  {wordCount} words
                </span>
              </div>
            </div>

            <div className="mb-3">
              <p className="mb-1.5 text-sm font-medium text-gray-500">
                Who is this movie for?
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-purple-50 p-1">
                {RATINGS.map((r) => {
                  const active = rating === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRating(r.id)}
                      aria-pressed={active}
                      className={`rounded-xl px-3 py-2 text-left transition ${
                        active
                          ? "bg-white shadow ring-2 ring-purple-300"
                          : "hover:bg-white/60"
                      }`}
                    >
                      <span className="block text-sm font-bold text-purple-700">
                        {r.label}
                      </span>
                      <span className="block text-xs text-gray-500">{r.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <p className="mb-1.5 text-sm font-medium text-gray-500">
                Pick your animation style
              </p>
              <div className="flex flex-wrap gap-2">
                {ANIMATION_STYLES.map((s) => {
                  const active = styleId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyleId(s.id)}
                      aria-pressed={active}
                      title={s.prompt}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
                        active
                          ? "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow"
                          : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                      }`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              ref={editorRef}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Once upon a time..."
              className="h-56 w-full resize-none rounded-2xl border-2 border-purple-200 bg-purple-50/40 p-4 text-lg leading-relaxed text-gray-800 outline-none transition focus:border-purple-400 focus:bg-white"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={getFeedback}
                disabled={loadingFeedback || !story.trim()}
                className="flex-1 rounded-2xl bg-amber-400 px-5 py-3 text-lg font-bold text-amber-950 shadow transition hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingFeedback ? "Thinking..." : "💡 Helper Tips"}
              </button>
              <button
                onClick={makeStoryboard}
                disabled={loadingStoryboard || !story.trim()}
                className="flex-[2] rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 py-3 text-lg font-bold text-white shadow transition hover:from-fuchsia-400 hover:to-purple-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingStoryboard ? "Sketching..." : "🎨 Make Storyboard"}
              </button>
            </div>
          </div>

          {story.trim() && <GlowUpMeter story={story} />}

          <WritingChecklist story={story} />

          <WordBoosters story={story} onApply={setStory} />

          {savedToast && (
            <div className="animate-pop rounded-2xl bg-indigo-100 px-4 py-3 text-center font-semibold text-indigo-700 ring-2 ring-indigo-200">
              💾 Saved! You can open it again anytime.
            </div>
          )}

          {safetyMessage && (
            <div className="animate-pop flex items-start gap-3 rounded-3xl bg-sky-50 p-5 text-sky-800 shadow ring-2 ring-sky-200">
              <span className="text-2xl">🛟</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sky-700">
                  {rating === "teens"
                    ? "Let's keep it within PG!"
                    : "Let's keep it kid-friendly!"}
                </p>
                <p className="mt-1">{safetyMessage}</p>

                {safetyTerms.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-sky-700">
                      Parts to change:
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {safetyTerms.map((t, i) => (
                        <span
                          key={`${t}-${i}`}
                          className="rounded-full bg-rose-100 px-2.5 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-200"
                        >
                          “{t}”
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {safetyTerms.some((t) =>
                  story.toLowerCase().includes(t.toLowerCase())
                ) && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-sky-700">
                      Here it is in your story:
                    </p>
                    <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm leading-relaxed text-gray-700 ring-1 ring-sky-100">
                      {highlightStory(story, safetyTerms)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {adjustNotice && (
            <div className="animate-pop flex items-start gap-3 rounded-3xl bg-amber-50 p-5 text-amber-900 shadow ring-2 ring-amber-200">
              <span className="text-2xl">✏️</span>
              <div>
                <p className="font-semibold text-amber-700">
                  We tweaked your story a little
                </p>
                <p className="mt-1">{adjustNotice}</p>
                <p className="mt-1 text-sm text-amber-600">
                  This keeps your movie right for{" "}
                  {rating === "teens" ? "teens (PG)" : "younger kids (G)"}.
                  Your own writing above is unchanged.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-100 px-4 py-3 text-rose-700 ring-2 ring-rose-200">
              {error}
            </div>
          )}

          {feedback && (
            <div className="animate-pop rounded-3xl bg-white p-5 shadow-lg ring-2 ring-amber-100">
              <h2 className="mb-3 text-xl font-semibold text-amber-600">
                💡 Helper Tips
              </h2>
              <p className="mb-3 rounded-2xl bg-green-50 p-3 text-green-800 ring-1 ring-green-100">
                🌟 {feedback.praise}
              </p>

              {feedback.traits.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium text-gray-500">
                    Your writing powers:
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {feedback.traits.map((t) => (
                      <div
                        key={t.name}
                        className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-amber-800">
                            {t.name}
                          </span>
                          <span
                            className="text-sm"
                            aria-label={`${t.stars} out of 3 stars`}
                          >
                            {"⭐".repeat(t.stars)}
                            <span className="opacity-30">
                              {"☆".repeat(3 - t.stars)}
                            </span>
                          </span>
                        </div>
                        {t.tip && (
                          <p className="mt-1 text-xs text-amber-700">{t.tip}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ul className="space-y-2">
                {feedback.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-2xl bg-purple-50 p-3 text-gray-700"
                  >
                    <span>✨</span>
                    <span className="flex-1">{s}</span>
                    <button
                      type="button"
                      onClick={focusEditor}
                      className="shrink-0 rounded-full bg-purple-500 px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-purple-400 active:scale-95"
                    >
                      Try it ✏️
                    </button>
                  </li>
                ))}
              </ul>
              {feedback.sparkleWords.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-gray-500">
                    Try sprinkling in these magic words:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feedback.sparkleWords.map((w, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-3 py-1 text-sm font-semibold text-white"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Storyboard / Movie panel */}
        <section className="flex flex-col gap-4">
          <div className="flex min-h-full flex-col rounded-3xl bg-white/60 p-5 shadow-inner ring-2 ring-purple-100">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-purple-700">
                {movie
                  ? "🍿 My Movie"
                  : comparing
                    ? "📚 Compare Drafts"
                    : "🎨 My Storyboard"}
              </h2>
              {movie ? (
                <button
                  onClick={() => {
                    stopPolling();
                    setMovie(null);
                    setShowPlayer(false);
                  }}
                  className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700 transition hover:bg-purple-200"
                >
                  ← Back to storyboard
                </button>
              ) : (
                storyboard &&
                versions.length > 0 && (
                  <button
                    onClick={() => setComparing((c) => !c)}
                    className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700 transition hover:bg-purple-200"
                  >
                    {comparing ? "← Back to editing" : "📚 Compare drafts"}
                  </button>
                )
              )}
            </div>

            {/* Empty state */}
            {!storyboard && !movie && !loadingStoryboard && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-gray-400">
                <span className="animate-bob text-6xl">🎞️</span>
                <p className="max-w-xs text-lg">
                  Write your story and press{" "}
                  <span className="font-semibold text-purple-500">
                    Make Storyboard
                  </span>{" "}
                  to sketch out your scenes.
                </p>
              </div>
            )}

            {/* Loading storyboard */}
            {loadingStoryboard && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-gray-500">
                <span className="animate-bob text-6xl">🎨</span>
                <p className="text-lg">Sketching your scenes...</p>
              </div>
            )}

            {/* Loading video */}
            {loadingVideo && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-gray-500">
                <span className="animate-bob text-6xl">🎬</span>
                <p className="text-lg">Rolling camera on your movie...</p>
              </div>
            )}

            {/* Movie phase */}
            {movie && !loadingVideo && (
              <div className="flex flex-col gap-4">
                {movie.title && (
                  <div className="rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100 p-3 text-center">
                    <p className="text-xs uppercase tracking-wide text-purple-400">
                      Now Playing
                    </p>
                    <p className="text-xl font-bold text-purple-700">
                      {movie.title}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setShowPlayer(true)}
                  className="rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 py-3 text-lg font-bold text-white shadow transition hover:from-fuchsia-400 hover:to-purple-500 active:scale-95"
                >
                  ▶️ Play whole movie
                </button>
                {movie.scenes.map((scene, i) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    characters={storyboard?.styleGuide?.characters ?? []}
                  />
                ))}
                <p className="rounded-2xl bg-purple-50 p-3 text-center text-sm text-purple-600">
                  ✏️ Want changes? Go{" "}
                  <span className="font-semibold">back to storyboard</span>, edit
                  your scenes, and make the video again.
                </p>
              </div>
            )}

            {/* Compare drafts (before / after) */}
            {comparing && storyboard && !movie && versions.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="rounded-2xl bg-purple-50 p-3 text-center text-sm text-purple-600">
                  See how your storyboard changed after you revised your story!
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[versions[versions.length - 1], {
                    label: "Now",
                    title: storyboard.title,
                    scenes: storyboard.scenes,
                  }].map((col, ci) => (
                    <div key={ci} className="flex flex-col gap-2">
                      <div className="rounded-xl bg-gradient-to-r from-purple-100 to-pink-100 p-2 text-center">
                        <p className="text-xs uppercase tracking-wide text-purple-400">
                          {col.label}
                        </p>
                        <p className="text-sm font-bold text-purple-700">
                          {col.title}
                        </p>
                      </div>
                      {col.scenes.map((s, i) => (
                        <div
                          key={s.id}
                          className="rounded-xl bg-white p-2 shadow ring-1 ring-purple-100"
                        >
                          <p className="mb-1 truncate text-xs font-semibold text-purple-700">
                            {i + 1}. {s.title}
                          </p>
                          <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                            {s.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.imageUrl}
                                alt={s.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div
                                className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${s.palette} p-2 text-center`}
                              >
                                <p className="text-[11px] font-semibold leading-tight text-white drop-shadow">
                                  {s.description}
                                </p>
                              </div>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-3 text-[11px] text-gray-600">
                            {s.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Storyboard phase (editable) */}
            {storyboard && !movie && !loadingVideo && !comparing && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100 p-3 text-center">
                  <p className="text-xs uppercase tracking-wide text-purple-400">
                    Storyboard for
                  </p>
                  <p className="text-xl font-bold text-purple-700">
                    {storyboard.title}
                  </p>
                  {anyRedrawing ? (
                    <p className="mt-1 text-xs font-semibold text-purple-500">
                      🎨 Drawing pictures... {imagesReady} of{" "}
                      {storyboard.scenes.length}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-purple-500">
                      Edit each scene and redraw until you love it, then make the
                      video.
                    </p>
                  )}
                </div>

                {storyboard.scenes.map((scene, i) => (
                  <StoryboardCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    redrawing={Boolean(redrawing[scene.id])}
                    characters={storyboard.styleGuide?.characters ?? []}
                    onChange={(patch) => updateScene(scene.id, patch)}
                    onRedraw={() => redrawScene(scene)}
                    onRemove={
                      storyboard.scenes.length > 1
                        ? () => removeScene(scene.id)
                        : undefined
                    }
                  />
                ))}

                <button
                  onClick={addScene}
                  className="rounded-2xl border-2 border-dashed border-purple-300 bg-white/60 px-5 py-3 text-base font-bold text-purple-600 transition hover:border-purple-400 hover:bg-purple-50 active:scale-95"
                >
                  ➕ Add another picture
                </button>

                <button
                  onClick={createVideo}
                  disabled={loadingVideo || anyRedrawing}
                  className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-lg font-bold text-white shadow transition hover:from-emerald-400 hover:to-teal-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  🎬 I&apos;m happy — Make the Video!
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {showPlayer && movie && (
        <MoviePlayer
          title={movie.title}
          scenes={movie.scenes}
          characters={storyboard?.styleGuide?.characters ?? []}
          onClose={() => setShowPlayer(false)}
        />
      )}

      {(storyboard?.mock || movie?.mock) && (
        <footer className="bg-amber-100 px-6 py-2 text-center text-sm text-amber-800">
          🎨 Practice Mode: scenes are colorful placeholders. Add AI keys to
          generate real images and videos.
        </footer>
      )}

      {celebration && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="animate-pop pointer-events-auto flex max-w-md items-center gap-3 rounded-3xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 px-5 py-4 text-white shadow-2xl ring-4 ring-white/40">
            <span className="text-3xl">🎉</span>
            <div className="flex-1">
              <p className="font-bold leading-tight">{celebration.title}</p>
              {celebration.subtitle && (
                <p className="text-sm text-white/90">{celebration.subtitle}</p>
              )}
            </div>
            {celebration.showCompare && versions.length > 0 && (
              <button
                onClick={() => {
                  setComparing(true);
                  setCelebration(null);
                }}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-purple-700 shadow transition hover:bg-white/90 active:scale-95"
              >
                See what changed →
              </button>
            )}
            <button
              onClick={() => setCelebration(null)}
              aria-label="Dismiss"
              className="shrink-0 text-white/80 transition hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
