// Authored narration inventory. Keep the words here in sync with
// docs/data/story.md; this file gives both the offline generator and the
// browser the same stable clip keys.

// Aoede is a warm Gemini storyteller voice. Runtime lines use this unless
// GEMINI_TTS_VOICE overrides it.
export const NARRATOR_VOICE = "Aoede";

export const NARRATION_CLIPS = Object.freeze([
  {
    key: "opening-1",
    filename: "opening-1.mp3",
    beat: "opening",
    sequence: 1,
    text: "Deep in a green and golden forest lived a lion who loved the sound of his own roar a little too much.",
  },
  {
    key: "opening-2",
    filename: "opening-2.mp3",
    beat: "opening",
    sequence: 2,
    text: "Every day he demanded one animal come to his rock — and every day, the forest grew more afraid.",
  },
  {
    key: "opening-3",
    filename: "opening-3.mp3",
    beat: "opening",
    sequence: 3,
    text: "Then someone tiny raised a small paw. 'Let me go,' said the rabbit. And off he hopped, down the dusty path… straight to the lion.",
  },
  {
    key: "decision-1-pose",
    filename: "decision-1-pose.mp3",
    beat: "decision_1",
    text: "The rabbit stands before the great lion, who narrows his eyes and growls: 'Little one — why should I not eat you right now?' …What should the rabbit do?",
  },
  {
    key: "bridge-clever",
    filename: "bridge-clever.mp3",
    beat: "consequence_1",
    spirit: "clever",
    text: "Ooh, a clever thought! The little rabbit's whiskers twitched with a plan…",
  },
  {
    key: "bridge-reckless",
    filename: "bridge-reckless.mp3",
    beat: "consequence_1",
    spirit: "reckless",
    text: "Oh my, bold indeed! The rabbit puffed up his little chest and…",
  },
  {
    key: "bridge-kind",
    filename: "bridge-kind.mp3",
    beat: "consequence_1",
    spirit: "kind",
    text: "How sweet. The rabbit spoke softly, from the bottom of his brave little heart…",
  },
  {
    key: "bridge-selfish",
    filename: "bridge-selfish.mp3",
    beat: "consequence_1",
    spirit: "selfish",
    text: "Hmm! Thinking of himself first, was he? Well then…",
  },
  {
    key: "bridge-unclear-reprompt",
    filename: "bridge-unclear-reprompt.mp3",
    beat: "consequence_1",
    spirit: "unclear",
    text: "Mmm… the rabbit tilted his ears. He didn't quite catch that. What should he do? Say it again?",
  },
  {
    key: "moral-clever",
    filename: "moral-clever.mp3",
    beat: "moral",
    spirit: "clever",
    text: "And so the proudest lion in the forest ran away from his own reflection — outsmarted by the smallest animal of all. Because a clever mind is stronger than the loudest roar.",
  },
  {
    key: "moral-kind",
    filename: "moral-kind.mp3",
    beat: "moral",
    spirit: "kind",
    text: "The rabbit's kindness gave the lion something no roar ever had — a friend who told him the truth. Because gentleness can tame what strength cannot.",
  },
  {
    key: "moral-reckless",
    filename: "moral-reckless.mp3",
    beat: "moral",
    spirit: "reckless",
    text: "It nearly went very wrong for our brave little rabbit! But luck favors the bold — and next time, a clever plan works even better than a daring dash.",
  },
  {
    key: "moral-selfish",
    filename: "moral-selfish.mp3",
    beat: "moral",
    spirit: "selfish",
    text: "The rabbit learned that tricks used only for yourself have a way of coming back around. Wit shared wisely keeps the whole forest safe.",
  },
]);

export const NARRATION_CLIP_BY_KEY = Object.freeze(
  Object.fromEntries(NARRATION_CLIPS.map((clip) => [clip.key, clip])),
);

export const NARRATION_CLIP_KEYS = Object.freeze(
  NARRATION_CLIPS.map((clip) => clip.key),
);

export const STATIC_NARRATION_COUNT = 13;
