"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FeedbackResponse,
  MovieResponse,
  Rating,
  Scene,
  StatusResponse,
  StoryboardResponse,
  StoryboardScene,
} from "@/lib/types";
import { RATINGS } from "@/lib/types";
import SceneCard from "./components/SceneCard";
import StoryboardCard from "./components/StoryboardCard";

export default function Home() {
  const [story, setStory] = useState("");
  const [rating, setRating] = useState<Rating>("kids");
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResponse | null>(null);
  const [movie, setMovie] = useState<MovieResponse | null>(null);

  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingStoryboard, setLoadingStoryboard] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [redrawing, setRedrawing] = useState<Record<string, boolean>>({});

  const [error, setError] = useState<string | null>(null);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ratingRef = useRef<Rating>(rating);
  const wordCount = story.trim() ? story.trim().split(/\s+/).length : 0;

  useEffect(() => {
    const saved = localStorage.getItem("storyStudioRating");
    if (saved === "teens" || saved === "kids") setRating(saved);
  }, []);
  useEffect(() => {
    ratingRef.current = rating;
    localStorage.setItem("storyStudioRating", rating);
  }, [rating]);

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
    setLoadingStoryboard(true);
    setStoryboard(null);
    setMovie(null);
    stopPolling();
    try {
      const res = await fetch("/api/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not make storyboard.");
      if (data.blocked) return setSafetyMessage(data.message as string);
      setStoryboard(data as StoryboardResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoadingStoryboard(false);
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

  async function redrawScene(scene: StoryboardScene) {
    clearBanners();
    setRedrawing((r) => ({ ...r, [scene.id]: true }));
    try {
      const res = await fetch("/api/scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: scene.description, rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not redraw scene.");
      if (data.blocked) return setSafetyMessage(data.message as string);
      updateScene(scene.id, {
        imageUrl: data.imageUrl,
        imageBlocked: data.imageBlocked,
        mock: data.mock,
      });
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
          scenes: storyboard.scenes.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            palette: s.palette,
            imageUrl: s.imageUrl,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not make video.");
      if (data.blocked) return setSafetyMessage(data.message as string);
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
          <span className="ml-auto hidden items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold backdrop-blur sm:flex">
            🛡️ {rating === "teens" ? "PG-13 checked" : "Kid-safe · PG checked"}
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-2">
        {/* Writing panel */}
        <section className="flex flex-col gap-4">
          <div className="rounded-3xl bg-white p-5 shadow-lg ring-2 ring-purple-100">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-purple-700">✏️ My Story</h2>
              <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
                {wordCount} words
              </span>
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

            <textarea
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

          {safetyMessage && (
            <div className="animate-pop flex items-start gap-3 rounded-3xl bg-sky-50 p-5 text-sky-800 shadow ring-2 ring-sky-200">
              <span className="text-2xl">🛟</span>
              <div>
                <p className="font-semibold text-sky-700">
                  {rating === "teens"
                    ? "Let's keep it within PG-13!"
                    : "Let's keep it kid-friendly!"}
                </p>
                <p className="mt-1">{safetyMessage}</p>
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
              <ul className="space-y-2">
                {feedback.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-2 rounded-2xl bg-purple-50 p-3 text-gray-700"
                  >
                    <span>✨</span>
                    <span>{s}</span>
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-purple-700">
                {movie ? "🍿 My Movie" : "🎨 My Storyboard"}
              </h2>
              {movie && (
                <button
                  onClick={() => {
                    stopPolling();
                    setMovie(null);
                  }}
                  className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700 transition hover:bg-purple-200"
                >
                  ← Back to storyboard
                </button>
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
                {movie.scenes.map((scene, i) => (
                  <SceneCard key={scene.id} scene={scene} index={i} />
                ))}
                <p className="rounded-2xl bg-purple-50 p-3 text-center text-sm text-purple-600">
                  ✏️ Want changes? Go{" "}
                  <span className="font-semibold">back to storyboard</span>, edit
                  your scenes, and make the video again.
                </p>
              </div>
            )}

            {/* Storyboard phase (editable) */}
            {storyboard && !movie && !loadingVideo && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100 p-3 text-center">
                  <p className="text-xs uppercase tracking-wide text-purple-400">
                    Storyboard for
                  </p>
                  <p className="text-xl font-bold text-purple-700">
                    {storyboard.title}
                  </p>
                  <p className="mt-1 text-xs text-purple-500">
                    Edit each scene and redraw until you love it, then make the
                    video.
                  </p>
                </div>

                {storyboard.scenes.map((scene, i) => (
                  <StoryboardCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    redrawing={Boolean(redrawing[scene.id])}
                    onChange={(patch) => updateScene(scene.id, patch)}
                    onRedraw={() => redrawScene(scene)}
                  />
                ))}

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

      {(storyboard?.mock || movie?.mock) && (
        <footer className="bg-amber-100 px-6 py-2 text-center text-sm text-amber-800">
          🎨 Practice Mode: scenes are colorful placeholders. Add AI keys to
          generate real images and videos.
        </footer>
      )}
    </div>
  );
}
