import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("components/kid/KidStoryShell.tsx", "utf8");
const input = readFileSync("components/kid/KidDecisionInput.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

assert.doesNotMatch(shell, /StoryCatalog|coming-soon|fables to grow with|shouting at the screen/, "the story opens directly, without the shelf");
assert.match(shell, /openedLaunch\.current === launchId/, "opening the card starts the story once");
assert.match(shell, /Opening the story/, "entry shows the story opening, not a catalog");
assert.match(shell, /All experiments/, "an embedded story can return to the experiment list");

assert.match(shell, /const cinema = live && !isTurnPhase\(storyPhase\)/, "cinema must remain off during child turns");
assert.match(shell, /data-stage-mode=\{cinema \? "cinematic" : "child-turn"\}/, "stage must expose its active visual mode");
assert.match(shell, /kid-stage-storybar/, "story progress and captions must live below the canvas");
assert.doesNotMatch(shell, /kid-stage-topline/, "story progress must not float over the canvas");
assert.doesNotMatch(shell, /kid-live-pill|kid-stage-chapter/, "stage must not show generic progress tags");
assert.match(shell, /encryptedWorldId: savedWorldId/, "a saved world is attached instead of rebuilt");
assert.doesNotMatch(shell, /next open creates a fresh world/, "leaving must keep the built world");
assert.match(shell, /<RecoveryStory[\s\S]*onRetry=\{session\.retry\}[\s\S]*onLeave=\{exitStory\}/,
  "recovery leave must use the same browse reset path");
assert.doesNotMatch(shell, /kid-breathing-dots/, "loading must not use generic dot animation");
assert.match(shell, /resolveCaptionState\(/, "flow must keep one caption source");
assert.match(shell, /const hasDecisionPanel = showStoryInput && isTurnPhase\(storyPhase\)/,
  "the decision surface must be explicitly tied to child turns");
assert.match(shell, /kid-live-layout/, "the live canvas and decision surface need one layout spread");
assert.match(shell, /videoNotice=\{live && !storyClosing \? videoNotice : null\}/,
  "stream-health copy must not appear over the moral/end frame");
assert.match(shell, /setVideoNotice\(null\)/, "stream-health copy must clear when the live stream ends");
assert.match(input, /The story is listening…/, "child turn must read as a listening story, not a generic form");
assert.match(styles, /\.kid-stage\.is-cinema video(?:,|\s*\{)/,
  "cinema must target descendant media, not one DOM depth");
assert.match(styles, /\.kid-stage-storybar/, "canvas metadata needs a storybook rail below the art");
assert.match(styles, /\.kid-app\.kid-shell-traveling/, "the story room needs a dark surrounding shell");
assert.match(styles, /filter: none;/, "cinematic mode must not filter the story media");
assert.match(styles, /family=Karma|font-family: "Karma"/, "UI needs an Indic-leaning type voice");
assert.match(styles, /font-family: "Bree Serif", Georgia, serif !important;/,
  "the spoken caption font should remain unchanged");
assert.match(styles, /font-family: "Bree Serif", Georgia, serif;/,
  "child-facing headings must use the storybook serif fallback");
assert.match(styles, /\.kid-live-layout\.has-decision-panel/, "desktop turns need a dedicated side decision panel");
assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 390px\)/,
  "the decision panel must sit beside the story canvas on wide screens");
assert.match(styles, /@media \(max-width: 900px\)/, "the side panel needs a narrow-screen fallback");

console.log("PASS UI regressions: live/closed catalog, storybook framing, listening state, cinematic media, and caption wiring");
