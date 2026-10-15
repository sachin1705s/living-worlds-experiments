"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface KidDecisionInputProps {
  thinking: boolean;
  needsReprompt?: boolean;
  narrationPlaying?: boolean;
  turnReady?: boolean;
  onSilence?: () => void;
  /** Called on the first real tap/click in this component (mic or send). A
   * backup unlock point for the persistent narration audio element, in
   * addition to the "Start story" tap. */
  onFirstGesture?: () => void;
  onSubmit: (text: string) => void;
}

const SILENCE_REPROMPT_MS = 20_000;
const SPEECH_SILENCE_SUBMIT_MS = 1_500;
const MIN_SUBSTANTIVE_WORDS = 3;

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function KidDecisionInput({
  thinking,
  needsReprompt = false,
  narrationPlaying = false,
  turnReady = true,
  onSilence,
  onFirstGesture,
  onSubmit,
}: KidDecisionInputProps) {
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionActiveRef = useRef(false);
  const recognitionStartPendingRef = useRef(false);
  const listeningRequestedRef = useRef(false);
  const restartAfterEndRef = useRef(false);
  const micHardErrorRef = useRef(false);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const finalResultHandledRef = useRef(false);
  const confirmationRef = useRef("");
  const confirmationTouchedRef = useRef(false);
  const speechHeardRef = useRef(false);
  const spacePressedRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const startRecognitionRef = useRef<() => void>(() => undefined);
  const scheduleAutoSubmitRef = useRef<(heard: string) => void>(() => undefined);
  const confirmingRef = useRef(false);
  const turnAvailable = turnReady && !narrationPlaying && !thinking;
  const turnAvailableRef = useRef(turnAvailable);
  turnAvailableRef.current = turnAvailable;

  const recognitionConstructor =
    typeof window === "undefined"
      ? undefined
      : (window as SpeechWindow).webkitSpeechRecognition ||
        (window as SpeechWindow).SpeechRecognition;
  const micSupported = !!recognitionConstructor;
  const waitingForStory = !turnAvailable;
  const confirming = !!finalTranscript;
  confirmingRef.current = confirming;

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (error) {
      console.warn("[kahani] mic: recognition.stop failed", error);
    }
  }, []);

  const clearAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  }, []);

  const submitText = useCallback(
    (candidate: string) => {
      const text = candidate.trim();
      if (!text || !turnAvailableRef.current) {
        if (!text && turnAvailableRef.current) {
          setMicMessage("The rabbit is listening… tell him what to do.");
        }
        return;
      }

      clearAutoSubmit();
      listeningRequestedRef.current = false;
      restartAfterEndRef.current = false;
      stopRecognition();
      setListening(false);
      setFinalTranscript("");
      setDraft("");
      transcriptRef.current = "";
      finalTranscriptRef.current = "";
      finalResultHandledRef.current = false;
      confirmationRef.current = "";
      confirmationTouchedRef.current = false;
      setMicMessage("");
      onSubmit(text);
    },
    [clearAutoSubmit, onSubmit, stopRecognition],
  );

  const scheduleAutoSubmit = useCallback(
    (heard: string) => {
      clearAutoSubmit();
      if (wordCount(heard) < MIN_SUBSTANTIVE_WORDS) {
        setFinalTranscript("");
        setMicMessage("Keep going… the rabbit is listening for a little more.");
        return;
      }
      confirmationRef.current = heard;
      confirmationTouchedRef.current = false;
      setFinalTranscript(heard);
      setMicMessage("The story is listening to your idea…");
      autoSubmitTimerRef.current = window.setTimeout(() => {
        autoSubmitTimerRef.current = null;
        if (
          confirmationRef.current === heard &&
          !confirmationTouchedRef.current &&
          turnAvailableRef.current
        ) {
          submitText(heard);
        }
      }, SPEECH_SILENCE_SUBMIT_MS);
    },
    [clearAutoSubmit, submitText],
  );

  scheduleAutoSubmitRef.current = scheduleAutoSubmit;

  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (
      !recognition ||
      !listeningRequestedRef.current ||
      !turnAvailableRef.current ||
      confirmingRef.current
    ) {
      return;
    }
    if (recognitionActiveRef.current || recognitionStartPendingRef.current) {
      restartAfterEndRef.current = true;
      return;
    }

    recognitionStartPendingRef.current = true;
    micHardErrorRef.current = false;
    try {
      recognition.start();
      recognitionActiveRef.current = true;
      recognitionStartPendingRef.current = false;
      setListening(true);
      setMicMessage("The rabbit is listening…");
    } catch (error) {
      recognitionStartPendingRef.current = false;
      restartAfterEndRef.current = true;
      console.error("[kahani] mic: recognition.start failed", error);
      setListening(false);
      setMicMessage("The rabbit’s ears are waking up. Try once more.");
      // InvalidStateError means the browser still owns this same instance.
      // Stop it and let onend perform the only safe restart point.
      stopRecognition();
    }
  }, [stopRecognition]);

  startRecognitionRef.current = startRecognition;

  // Keep one browser recognition object alive for this component. Recreating
  // it on every turn races the browser's asynchronous onend event and makes
  // the mic look active while the new instance silently fails.
  useEffect(() => {
    if (!recognitionConstructor) return;

    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      recognitionActiveRef.current = true;
      recognitionStartPendingRef.current = false;
      setListening(true);
      setMicMessage("The rabbit is listening…");
    };
    recognition.onresult = (event) => {
      // Results can arrive just after narration starts stopping the browser
      // session. Never let those late words leak into a bridge/consequence.
      if (!turnAvailableRef.current) return;
      let interim = "";
      let finalText = finalTranscriptRef.current;
      let receivedFinal = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const part = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          finalText = `${finalText} ${part}`.trim();
          receivedFinal = true;
        } else {
          interim = `${interim} ${part}`.trim();
        }
      }
      finalTranscriptRef.current = finalText;
      transcriptRef.current = `${finalText} ${interim}`.trim();
      setDraft(transcriptRef.current);
      if (transcriptRef.current) speechHeardRef.current = true;
      if (interim) {
        clearAutoSubmit();
        setFinalTranscript("");
      }
      setMicMessage("The rabbit is listening…");
      if (receivedFinal && finalText && turnAvailableRef.current) {
        finalResultHandledRef.current = true;
        scheduleAutoSubmitRef.current(finalText);
      }
    };
    recognition.onerror = (event) => {
      const code = event?.error ?? "unknown";
      const hardError = [
        "audio-capture",
        "network",
        "not-allowed",
        "service-not-allowed",
      ].includes(code);
      micHardErrorRef.current = hardError;
      console.error("[kahani] mic: recognition error", {
        error: code,
        message: event?.message,
      });
      setListening(false);
      if (hardError) listeningRequestedRef.current = false;
      if (code === "no-speech") {
        // Chrome emits this for ordinary pauses. Keep the turn open and let
        // onend quietly restart the same persistent recognition instance.
        setMicMessage("");
      } else {
        setMicMessage(
          hardError
            ? "The rabbit missed that little whisper. Try again or type below."
            : "The rabbit is listening for your voice. Try again if he needs to.",
        );
      }
    };
    recognition.onend = () => {
      recognitionActiveRef.current = false;
      recognitionStartPendingRef.current = false;
      setListening(false);
      if (finalResultHandledRef.current && autoSubmitTimerRef.current !== null) {
        return;
      }
      const heard = finalTranscriptRef.current.trim();
      if (heard && turnAvailableRef.current && wordCount(heard) >= MIN_SUBSTANTIVE_WORDS) {
        setDraft(heard);
        scheduleAutoSubmitRef.current(heard);
      } else if (heard && turnAvailableRef.current) {
        setDraft(heard);
        setFinalTranscript("");
        setMicMessage("Keep going… the rabbit is listening for a little more.");
      }

      // A browser recognition session can end by itself while a child is
      // still in a YOUR_TURN. Reuse this instance, but only restart after
      // onend and never after a permission/capture failure.
      const shouldRestart =
        restartAfterEndRef.current || listeningRequestedRef.current;
      if (
        shouldRestart &&
        listeningRequestedRef.current &&
        turnAvailableRef.current &&
        !micHardErrorRef.current
      ) {
        restartAfterEndRef.current = false;
        window.setTimeout(() => {
          startRecognitionRef.current();
        }, 40);
      }
    };
    recognitionRef.current = recognition;

    return () => {
      listeningRequestedRef.current = false;
      restartAfterEndRef.current = false;
      recognitionActiveRef.current = false;
      recognitionStartPendingRef.current = false;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // The browser may already have ended this instance during unmount.
      }
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
  }, [recognitionConstructor, stopRecognition]);

  const startListening = useCallback(() => {
    if (!turnAvailable || confirming) return;
    if (listening || listeningRequestedRef.current) return;
    if (!recognitionConstructor) {
      setMicMessage("The rabbit’s ears are ready. You can type your idea below.");
      return;
    }

    listeningRequestedRef.current = true;
    transcriptRef.current = "";
    finalTranscriptRef.current = "";
    finalResultHandledRef.current = false;
    confirmationRef.current = "";
    confirmationTouchedRef.current = false;
    speechHeardRef.current = false;
    clearAutoSubmit();
    setDraft("");
    setFinalTranscript("");
    startRecognitionRef.current();
  }, [
    clearAutoSubmit,
    confirming,
    listening,
    recognitionConstructor,
    turnAvailable,
  ]);

  const stopListening = useCallback(() => {
    listeningRequestedRef.current = false;
    restartAfterEndRef.current = false;
    stopRecognition();
  }, [stopRecognition]);

  const sayAgain = useCallback(() => {
    confirmationTouchedRef.current = true;
    clearAutoSubmit();
    setFinalTranscript("");
    setDraft("");
    transcriptRef.current = "";
    finalTranscriptRef.current = "";
    finalResultHandledRef.current = false;
    confirmationRef.current = "";
    speechHeardRef.current = false;
    setMicMessage("The rabbit is listening…");
    listeningRequestedRef.current = false;
    startListening();
  }, [clearAutoSubmit, startListening]);

  useEffect(() => {
    if (!turnAvailable || confirming) {
      listeningRequestedRef.current = false;
      restartAfterEndRef.current = false;
      stopRecognition();
      return;
    }
    if (!micSupported || listeningRequestedRef.current) return;

    transcriptRef.current = "";
    finalTranscriptRef.current = "";
    finalResultHandledRef.current = false;
    speechHeardRef.current = false;
    clearAutoSubmit();
    setDraft("");
    listeningRequestedRef.current = true;
    startRecognitionRef.current();
  }, [
    clearAutoSubmit,
    confirming,
    micSupported,
    stopRecognition,
    turnAvailable,
  ]);

  useEffect(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (!turnAvailable || confirming || !onSilence) return;

    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      if (!turnAvailableRef.current) return;
      listeningRequestedRef.current = false;
      restartAfterEndRef.current = false;
      stopRecognition();
      onSilence();
    }, SILENCE_REPROMPT_MS);

    return () => {
      if (silenceTimerRef.current !== null) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [confirming, draft, onSilence, stopRecognition, turnAvailable]);

  useEffect(
    () => () => {
      clearAutoSubmit();
      if (silenceTimerRef.current !== null) {
        window.clearTimeout(silenceTimerRef.current);
      }
    },
    [clearAutoSubmit],
  );

  return (
    <section
      className={`kid-input-card ${
        waitingForStory ? "is-waiting-for-story" : "is-your-turn"
      } ${confirming ? "is-confirming" : ""}`}
      aria-label="Tell the rabbit what to do"
    >
      <div className="kid-turn-callout" role="status" aria-live="polite">
        <span
          className={`kid-turn-ears ${listening ? "is-listening" : ""}`}
          aria-hidden="true"
        >
          {waitingForStory ? "🐇👂" : "✨🐇"}
        </span>
        <span>
          <strong>
            {confirming
              ? "I heard you!"
              : waitingForStory
              ? "The rabbit is telling the story…"
              : "The story is listening…"}
          </strong>
          <small>
            {confirming
              ? "The story is listening to your idea…"
              : waitingForStory
              ? "Listen closely for the moment he asks you."
              : "Speak the next page into being."}
          </small>
        </span>
      </div>

      <div className="kid-question-row">
        <div>
          <p className="kid-eyebrow">{waitingForStory ? "Story time" : "Your turn"}</p>
          <h2 className="kid-question">
            {confirming
              ? "The rabbit heard your idea!"
              : waitingForStory
              ? "The rabbit has something to say…"
            : "What should the rabbit try?"}
          </h2>
        </div>
        <span className="kid-rabbit-badge" aria-hidden="true">
          🐇
        </span>
      </div>

      <div className="kid-voice-row">
        <button
          type="button"
          className={`kid-mic ${
            listening ? "is-listening" : ""
          } ${waitingForStory ? "is-waiting" : "is-your-turn"} ${
            !waitingForStory && !listening && !confirming ? "is-turn-cue" : ""
          }`}
          aria-label={
            waitingForStory
              ? "Listen for the rabbit to finish the story"
              : listening
                ? "Pause listening"
                : "Start listening"
          }
          aria-pressed={listening}
          disabled={waitingForStory || confirming}
          onClick={() => {
            onFirstGesture?.();
            if (listening || listeningRequestedRef.current) {
              stopListening();
            } else {
              startListening();
            }
          }}
          onKeyDown={(event) => {
            if (event.repeat) return;
            if (event.key === " ") {
              event.preventDefault();
              onFirstGesture?.();
              spacePressedRef.current = true;
              if (!listening) startListening();
            } else if (event.key === "Enter") {
              event.preventDefault();
              onFirstGesture?.();
              if (listening || listeningRequestedRef.current) {
                stopListening();
              } else {
                startListening();
              }
            }
          }}
          onKeyUp={(event) => {
            if (event.key === " ") {
              event.preventDefault();
              if (spacePressedRef.current) {
                spacePressedRef.current = false;
                stopListening();
              }
            }
          }}
        >
          <span className="kid-mic-icon" aria-hidden="true">
            {waitingForStory ? "…" : "✦"}
          </span>
          <span className="kid-mic-label">
            {waitingForStory ? "Listen" : listening ? "I’m listening" : "Speak your idea"}
          </span>
          {listening && (
            <span className="kid-mic-waves" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </button>

        <div className={`kid-hears-bubble ${confirming ? "is-confirming" : ""}`} aria-live="polite">
          <span className="kid-bubble-tail" aria-hidden="true" />
          <span className="kid-bubble-label">
            {confirming ? "The rabbit hears you say" : "The rabbit hears"}
          </span>
          <span className={`kid-bubble-text ${draft ? "has-words" : ""}`}>
            {confirming
              ? `“${finalTranscript}”`
              : draft || (micSupported ? "your idea…" : "type your idea below…")}
          </span>
          {confirming && (
            <span className="kid-confirmation-note">The story is listening…</span>
          )}
        </div>
      </div>

      {needsReprompt && turnAvailable && !confirming && (
        <button type="button" className="kid-repeat-button" onClick={sayAgain}>
          Say it again <span aria-hidden="true">↻</span>
        </button>
      )}

      {!confirming && (
        <div className="kid-type-row">
          <input
            value={draft}
            disabled={!turnAvailable}
            onChange={(event) => {
              setDraft(event.target.value);
              setMicMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onFirstGesture?.();
                submitText(draft);
              }
            }}
            placeholder="Or type your idea here"
            aria-label="Type what the rabbit should do"
          />
          <button
            type="button"
            className="kid-send-button"
            onClick={() => {
              onFirstGesture?.();
              submitText(draft);
            }}
            disabled={!turnAvailable || !draft.trim()}
          >
            Send <span aria-hidden="true">➜</span>
          </button>
        </div>
      )}
      <p className="kid-input-hint" aria-live="polite">
        {micMessage ||
          (confirming
            ? "The rabbit heard you. The story is listening…"
            : waitingForStory
              ? "Listen for your turn…"
              : needsReprompt
                ? "The rabbit tilted his ears. Try one more time."
                : listening
                  ? "Keep talking — the rabbit is listening."
                  : "The rabbit is listening automatically — tap the mic to pause.")}
      </p>
    </section>
  );
}
