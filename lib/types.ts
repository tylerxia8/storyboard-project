/**
 * Audience rating. "kids" = strict G/PG for ages ~7-11. "teens" = PG-13 for
 * middle / early high school: allows mild language and moderate cartoon action
 * (e.g. bugs getting smashed) but still blocks sexual content, gore, etc.
 */
export type Rating = "kids" | "teens";

export const RATINGS: { id: Rating; label: string; blurb: string }[] = [
  {
    id: "kids",
    label: "Younger Kids",
    blurb: "G / PG · ages 7-11",
  },
  {
    id: "teens",
    label: "Teens",
    blurb: "PG-13 · middle & early high school",
  },
];

/** One of the writing traits we coach on, with a 1-3 star rating and a tip. */
export type WritingTrait = {
  name: string;
  /** 1-3 stars, so feedback feels like growth, never failure. */
  stars: number;
  tip: string;
};

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
  /** Preview image URL, or null in Practice Mode / when hidden. */
  imageUrl: string | null;
  /** True when the generated image failed the image safety check. */
  imageBlocked?: boolean;
  /** A friendly color theme used to render placeholder panels. */
  palette: string;
  /** True when this panel is an offline placeholder rather than a real image. */
  mock: boolean;
};

/** A character's fixed visual description, reused in every scene. */
export type StyleCharacter = {
  name: string;
  /** Locked-in look: species/age, hair, clothing colors, features. */
  look: string;
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
