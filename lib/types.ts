export type FeedbackResponse = {
  /** A short, warm sentence celebrating what the child did well. */
  praise: string;
  /** Friendly, concrete suggestions to make the writing more descriptive/clear. */
  suggestions: string[];
  /** A couple of "magic words" the child could sprinkle in. */
  sparkleWords: string[];
  wordCount: number;
  /** True when produced by the offline mock instead of a real AI call. */
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
  /** Replicate prediction id, or null in mock mode. */
  predictionId: string | null;
  status: "starting" | "processing" | "succeeded" | "failed";
  videoUrl: string | null;
  /** True when this scene is a local placeholder rather than a real video. */
  mock: boolean;
  /** A friendly color theme used to render placeholder scenes. */
  palette: string;
};

export type MovieResponse = {
  title: string;
  scenes: Scene[];
  mock: boolean;
};

export type StatusResponse = {
  status: Scene["status"];
  videoUrl: string | null;
};
