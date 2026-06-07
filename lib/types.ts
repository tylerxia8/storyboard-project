/**
 * Audience rating. "kids" = strict G, suitable for all ages. "teens" = PG:
 * parental-guidance level that allows mild language and mild, stylized cartoon
 * action while still blocking sexual content, strong language, gore, etc.
 */
export type Rating = "kids" | "teens";

export const RATINGS: { id: Rating; label: string; blurb: string }[] = [
  {
    id: "kids",
    label: "Younger Kids",
    blurb: "G · for everyone",
  },
  {
    id: "teens",
    label: "Teens",
    blurb: "PG · parental guidance",
  },
];

/** One spoken line in a scene's script: who says it, and what they say. */
export type ScriptLine = {
  /** The character speaking (e.g. "Luna"), or "Narrator". */
  speaker: string;
  /** The words they say aloud. */
  line: string;
};

/** One of the writing traits we coach on, with a 1-3 star rating and a tip. */
export type WritingTrait = {
  name: string;
  /** 1-3 stars, so feedback feels like growth, never failure. */
  stars: number;
  tip: string;
};

/** Animation styles a student can pick to lock the look of the whole movie. */
export type AnimationStyleId =
  | "pixar3d"
  | "cartoon2d"
  | "storybook"
  | "anime"
  | "claymation"
  | "comic"
  | "pixel";

export const ANIMATION_STYLES: {
  id: AnimationStyleId;
  label: string;
  emoji: string;
  /** The canonical art-style sentence injected into every scene prompt. */
  prompt: string;
}[] = [
  {
    id: "pixar3d",
    label: "3D Movie",
    emoji: "🎬",
    prompt:
      "bright, colorful 3D animated movie style like a modern animated feature film, soft rounded shapes, smooth shading, warm cinematic lighting",
  },
  {
    id: "cartoon2d",
    label: "2D Cartoon",
    emoji: "📺",
    prompt:
      "flat 2D cartoon animation, bold clean outlines, bright saturated colors, simple playful shapes, Saturday-morning cartoon style",
  },
  {
    id: "storybook",
    label: "Storybook",
    emoji: "📖",
    prompt:
      "soft watercolor storybook illustration, gentle textured brush strokes, warm pastel colors, hand-painted children's picture-book style",
  },
  {
    id: "anime",
    label: "Anime",
    emoji: "🌸",
    prompt:
      "Japanese anime style, expressive characters, cel shading, dynamic composition, vibrant colors, detailed backgrounds",
  },
  {
    id: "claymation",
    label: "Clay",
    emoji: "🧱",
    prompt:
      "claymation stop-motion style, sculpted modeling-clay characters, tactile handmade textures, soft studio lighting",
  },
  {
    id: "comic",
    label: "Comic Book",
    emoji: "💥",
    prompt:
      "comic book illustration style, bold ink outlines, halftone shading, dynamic panels, vivid pop-art colors",
  },
  {
    id: "pixel",
    label: "Pixel Art",
    emoji: "👾",
    prompt:
      "retro pixel-art style, 16-bit video game look, crisp pixels, bright limited color palette",
  },
];

export type FeedbackResponse = {
  /** A short, warm sentence celebrating what the child did well. */
  praise: string;
  /** Friendly, concrete suggestions to make the writing more descriptive/clear. */
  suggestions: string[];
  /** A couple of "magic words" the child could sprinkle in. */
  sparkleWords: string[];
  /** Per-trait ratings (Ideas, Word Choice, etc.) to make feedback teachable. */
  traits: WritingTrait[];
  wordCount: number;
  /** True when produced by the offline mock instead of a real AI call. */
  mock: boolean;
};

/** Returned when content fails the PG safety check. */
export type BlockedResponse = {
  blocked: true;
  /** A gentle, kid-friendly explanation. */
  message: string;
};

/**
 * An editable storyboard panel: a preview image plus the student's description.
 * Students revise these before committing to (slower, costlier) video.
 */
export type StoryboardScene = {
  id: string;
  /** Short title for the scene (editable). */
  title: string;
  /** The student-editable description that drives the image and the video. */
  description: string;
  /** A scene-specific "curious audience" question nudging richer detail. */
  question?: string;
  /** The lines characters speak in this scene (voiced in the movie). */
  script?: ScriptLine[];
  /** Preview image URL, or null in Practice Mode / when hidden. */
  imageUrl: string | null;
  /** True when the generated image failed the image safety check. */
  imageBlocked?: boolean;
  /** A friendly color theme used to render placeholder panels. */
  palette: string;
  /** True when this panel is an offline placeholder rather than a real image. */
  mock: boolean;
};

/** A voice gender used to pick a matching narrator voice for a character. */
export type VoiceGender = "male" | "female" | "neutral";

/** A character's fixed visual description, reused in every scene. */
export type StyleCharacter = {
  name: string;
  /** Locked-in look: species/age, hair, clothing colors, features. */
  look: string;
  /** Voice gender for read-aloud: male, female, or neutral. */
  voice?: VoiceGender;
};

/**
 * The "story bible" that keeps characters and art style consistent across the
 * whole storyboard and movie. Generated once per storyboard and injected into
 * every image and video prompt.
 */
export type StyleGuide = {
  /** One canonical art-style sentence used for every scene. */
  artStyle: string;
  characters: StyleCharacter[];
  /**
   * A canonical "character reference sheet" image showing the cast in the
   * chosen art style. Every scene image is generated conditioned on this anchor
   * (via a reference-capable model) so characters stay consistent between
   * frames. Null/undefined falls back to text-only consistency.
   */
  referenceImage?: string | null;
};

export type StoryboardResponse = {
  title: string;
  scenes: StoryboardScene[];
  styleGuide: StyleGuide;
  /** True when the AI softened part of the story to meet the rating. */
  adjusted: boolean;
  /** A short, kid-friendly note about what was made more appropriate. */
  adjustmentNote?: string;
  mock: boolean;
};

/** A story draft saved to the browser so students can return to it later. */
export type SavedStory = {
  id: string;
  name: string;
  story: string;
  rating: Rating;
  savedAt: number;
};

/** A saved snapshot of a storyboard draft, for before/after comparison. */
export type StoryboardVersion = {
  id: string;
  createdAt: number;
  label: string;
  story: string;
  rating: Rating;
  title: string;
  scenes: StoryboardScene[];
};

export type SceneImageResponse = {
  imageUrl: string | null;
  imageBlocked?: boolean;
  mock: boolean;
};

export type Scene = {
  id: string;
  /** Short, kid-friendly title for the scene. */
  title: string;
  /** One or two sentences describing what happens, in the child's voice. */
  narration: string;
  /** The lines characters speak in this scene, voiced during playback. */
  script?: ScriptLine[];
  /** The detailed prompt sent to the video model. */
  prompt: string;
  /** The approved storyboard image, shown as a poster while the video renders. */
  imageUrl?: string | null;
  /** Replicate prediction id, or null in mock mode. */
  predictionId: string | null;
  status: "starting" | "processing" | "succeeded" | "failed";
  videoUrl: string | null;
  /** True when this scene is a local placeholder rather than a real video. */
  mock: boolean;
  /** A friendly color theme used to render placeholder scenes. */
  palette: string;
  /** True when a finished frame failed the PG image check and was hidden. */
  safetyBlocked?: boolean;
};

export type MovieResponse = {
  title: string;
  scenes: Scene[];
  mock: boolean;
};

export type StatusResponse = {
  status: Scene["status"];
  videoUrl: string | null;
  /** True when a finished frame failed the PG image check and was hidden. */
  safetyBlocked?: boolean;
};
