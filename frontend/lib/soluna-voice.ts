"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { splitTtsChunks, stripForTts } from "@/lib/soluna-reply";

type SpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript?: string };
    };
  };
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

/** 無音が続いたら発話完了とみなす（ms） */
const SILENCE_MS = 1400;
/** 連続認識が切れたあと再開するまでの待機（ms） */
const RESTART_DELAY_MS = 280;
/** iOS: TTS 後にマイクを再開するまでの待機（ms） */
const IOS_MIC_RESUME_DELAY_MS = 850;
/** iOS: recognition.start 失敗時のリトライ間隔（ms） */
const IOS_RECOGNITION_RETRY_MS = 420;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function restartDelayMs(): number {
  return isIosSafari() ? IOS_RECOGNITION_RETRY_MS : RESTART_DELAY_MS;
}

function micResumeDelayMs(): number {
  return isIosSafari() ? IOS_MIC_RESUME_DELAY_MS : 160;
}

function waitForSpeechIdle(maxMs = 2400): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (!window.speechSynthesis.speaking || Date.now() - started >= maxMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, 60);
    };
    tick();
  });
}

function mapSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの使用がブロックされています。アドレスバー横のサイト設定（🔒）からマイクを「許可」にしてください。";
    case "no-speech":
      return "音声が聞こえませんでした。マイクに向かってもう一度話してください。";
    case "network":
      return "音声認識にインターネット接続が必要です。ネットワークを確認してください。";
    case "audio-capture":
      return "マイクを使用できません。他のアプリがマイクを占有していないか確認してください。";
    case "language-not-supported":
      return "日本語の音声認識がこのブラウザで利用できません。";
    default:
      return "音声入力を取得できませんでした。ブラウザを Chrome または Edge でお試しください。";
  }
}

async function ensureMicrophoneAccess(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "このブラウザはマイク入力に未対応です。";
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return null;
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        return mapSpeechError("not-allowed");
      }
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        return "マイクが見つかりません。端末のサウンド設定で入力デバイスを確認してください。";
      }
      if (error.name === "NotReadableError") {
        return mapSpeechError("audio-capture");
      }
    }
    return "マイクへのアクセスに失敗しました。";
  }
}

let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve([]);
  }
  if (voicesReadyPromise) return voicesReadyPromise;

  voicesReadyPromise = new Promise((resolve) => {
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return true;
      }
      return false;
    };

    if (pick()) return;

    const onChange = () => {
      if (pick()) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
    window.speechSynthesis.onvoiceschanged = onChange;
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 400);
  });

  return voicesReadyPromise;
}

type CharacterVoiceProfile = {
  prefer: RegExp[];
  avoid: RegExp[];
  rate: number;
  pitch: number;
};

const CHARACTER_VOICE: Record<"sol" | "luna", CharacterVoiceProfile> = {
  sol: {
    prefer: [/otoya/i, /ichiro/i, /keita/i, /hattori/i, /takeru/i, /男/i, /male/i, /boy/i],
    avoid: [/kyoko/i, /haruka/i, /nanami/i, /ayumi/i, /moira/i, /samantha/i, /女/i, /female/i],
    rate: 1.1,
    pitch: 1.08,
  },
  luna: {
    prefer: [/kyoko/i, /haruka/i, /nanami/i, /ayumi/i, /moira/i, /samantha/i, /女/i, /female/i],
    avoid: [/otoya/i, /ichiro/i, /keita/i, /hattori/i, /takeru/i, /男/i, /male/i, /boy/i],
    rate: 0.96,
    pitch: 1.16,
  },
};

function scoreVoice(voice: SpeechSynthesisVoice, character: "sol" | "luna"): number {
  const profile = CHARACTER_VOICE[character];
  const label = `${voice.name} ${voice.voiceURI}`;
  let score = 0;
  if (voice.lang.startsWith("ja")) score += 12;
  if (voice.lang === "ja-JP") score += 6;
  if (voice.localService) score += 2;
  for (const pattern of profile.prefer) {
    if (pattern.test(label)) score += 24;
  }
  for (const pattern of profile.avoid) {
    if (pattern.test(label)) score -= 18;
  }
  return score;
}

function pickCharacterVoice(
  voices: SpeechSynthesisVoice[],
  character: "sol" | "luna",
): SpeechSynthesisVoice | null {
  const jaVoices = voices.filter((voice) => voice.lang.startsWith("ja"));
  const pool = jaVoices.length > 0 ? jaVoices : voices;
  if (pool.length === 0) return null;

  const ranked = [...pool].sort((a, b) => scoreVoice(b, character) - scoreVoice(a, character));
  const best = ranked[0];
  if (!best || scoreVoice(best, character) <= 0) {
    return jaVoices[0] ?? voices[0] ?? null;
  }
  return best;
}

/** iOS Safari: ユーザー操作のタイミングで TTS をアンロック */
function unlockSpeechSynthesis(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0.01;
    utterance.rate = 2;
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

type SpeakLine = {
  label: string;
  text: string;
  character?: "sol" | "luna";
};

type SpeakChunk = {
  label: string;
  text: string;
  character: "sol" | "luna";
};

function pauseAfterChunk(text: string): number {
  if (/[。！？!?]$/.test(text)) return 220;
  if (/[、，]$/.test(text)) return 120;
  return 80;
}

function expandLinesToChunks(lines: SpeakLine[]): SpeakChunk[] {
  const chunks: SpeakChunk[] = [];
  for (const line of lines) {
    const character = line.character ?? (line.label.includes("ルーナ") ? "luna" : "sol");
    for (const text of splitTtsChunks(line.text)) {
      chunks.push({ label: line.label, text, character });
    }
  }
  return chunks;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() != null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSolunaVoiceSupported(): boolean {
  return isSpeechRecognitionSupported() || isSpeechSynthesisSupported();
}

export function useSolunaVoice() {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakingAs, setSpeakingAs] = useState<"sol" | "luna" | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");

  const voiceEnabledRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speakQueueRef = useRef<SpeakChunk[]>([]);
  const speakingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const gotResultRef = useRef(false);
  const errorFiredRef = useRef(false);
  const iosKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const conversationModeRef = useRef(false);
  const pausedForReplyRef = useRef(false);
  const onResultRef = useRef<((text: string) => void) | null>(null);
  const onErrorRef = useRef<((message: string) => void) | null>(null);
  const onSpeakCompleteRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const utteranceSentRef = useRef(false);
  const micGrantedRef = useRef(false);
  const recognitionGenerationRef = useRef(0);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopIosKeepAlive = useCallback(() => {
    if (iosKeepAliveRef.current) {
      clearInterval(iosKeepAliveRef.current);
      iosKeepAliveRef.current = null;
    }
  }, []);

  const startIosKeepAlive = useCallback(() => {
    if (!isIosSafari()) return;
    stopIosKeepAlive();
    iosKeepAliveRef.current = setInterval(() => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 8000);
  }, [stopIosKeepAlive]);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    utteranceSentRef.current = false;
    setInterimTranscript("");
  }, []);

  const clearTranscriptBuffers = useCallback(() => {
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setInterimTranscript("");
  }, []);

  const stopSpeaking = useCallback(() => {
    stopIosKeepAlive();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakQueueRef.current = [];
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingAs(null);
  }, [stopIosKeepAlive]);

  const finishSpeaking = useCallback(() => {
    stopIosKeepAlive();
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingAs(null);
    const onComplete = onSpeakCompleteRef.current;
    onSpeakCompleteRef.current = null;
    if (!onComplete) return;

    void waitForSpeechIdle().then(() => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      window.setTimeout(onComplete, micResumeDelayMs());
    });
  }, [stopIosKeepAlive]);

  const speakNext = useCallback(async () => {
    const next = speakQueueRef.current.shift();
    if (!next || typeof window === "undefined" || !window.speechSynthesis) {
      finishSpeaking();
      return;
    }

    const voices = await loadVoices();
    const character = next.character;
    const profile = CHARACTER_VOICE[character];
    const jaVoice = pickCharacterVoice(voices, character);
    const speechText = next.text;
    if (!speechText) {
      void speakNext();
      return;
    }

    speakingRef.current = true;
    setSpeaking(true);
    setSpeakingAs(character);
    startIosKeepAlive();

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "ja-JP";
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = 1;
    if (jaVoice) utterance.voice = jaVoice;

    utterance.onend = () => {
      const delay = pauseAfterChunk(speechText);
      window.setTimeout(() => {
        void speakNext();
      }, delay);
    };
    utterance.onerror = () => {
      void speakNext();
    };

    window.speechSynthesis.speak(utterance);
  }, [finishSpeaking, startIosKeepAlive]);

  const speakLines = useCallback(
    (lines: SpeakLine[], onComplete?: () => void, options?: { force?: boolean }) => {
      onSpeakCompleteRef.current = onComplete ?? null;
      const shouldSpeak =
        options?.force ||
        voiceEnabledRef.current ||
        conversationModeRef.current;
      if (!shouldSpeak || !isSpeechSynthesisSupported()) {
        finishSpeaking();
        return;
      }

      stopSpeaking();
      void loadVoices().then(() => {
        unlockSpeechSynthesis();
        speakQueueRef.current = expandLinesToChunks(
          lines.filter((line) => stripForTts(line.text)),
        );
        if (speakQueueRef.current.length === 0) {
          finishSpeaking();
          return;
        }
        void speakNext();
      });
    },
    [finishSpeaking, speakNext, stopSpeaking],
  );

  const stopRecognition = useCallback(() => {
    clearSilenceTimer();
    clearRestartTimer();
    if (!recognitionRef.current) {
      setListening(false);
      return;
    }
    intentionalStopRef.current = true;
    recognitionGenerationRef.current += 1;
    try {
      recognitionRef.current.abort();
    } catch {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    setListening(false);
  }, [clearSilenceTimer, clearRestartTimer]);

  const scheduleConversationRestart = useCallback(() => {
    if (!conversationModeRef.current || pausedForReplyRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!conversationModeRef.current || pausedForReplyRef.current) return;
      void beginContinuousRecognitionRef.current?.();
    }, restartDelayMs());
  }, [clearRestartTimer]);

  const finalizeConversationUtterance = useCallback(() => {
    if (utteranceSentRef.current || pausedForReplyRef.current) return;
    const combined = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
    if (!combined) return;

    utteranceSentRef.current = true;
    clearSilenceTimer();
    clearTranscriptBuffers();
    onResultRef.current?.(combined);
  }, [clearSilenceTimer, clearTranscriptBuffers]);

  const scheduleSilenceFinalize = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      finalizeConversationUtterance();
    }, SILENCE_MS);
  }, [clearSilenceTimer, finalizeConversationUtterance]);

  const beginContinuousRecognitionRef = useRef<((attempt?: number) => Promise<void>) | null>(
    null,
  );

  const beginContinuousRecognition = useCallback(async (attempt = 0) => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || !conversationModeRef.current || pausedForReplyRef.current) return;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      onErrorRef.current?.("音声入力は HTTPS 接続でのみ利用できます。");
      return;
    }

    if (recognitionRef.current) return;

    if (speakingRef.current || (typeof window !== "undefined" && window.speechSynthesis?.speaking)) {
      scheduleConversationRestart();
      return;
    }

    if (!micGrantedRef.current) {
      const micError = await ensureMicrophoneAccess();
      if (micError) {
        onErrorRef.current?.(micError);
        conversationModeRef.current = false;
        setConversationMode(false);
        return;
      }
      micGrantedRef.current = true;
    }

    intentionalStopRef.current = false;
    errorFiredRef.current = false;
    if (attempt === 0) {
      resetTranscript();
    }

    const generation = ++recognitionGenerationRef.current;
    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (generation !== recognitionGenerationRef.current) return;
      setListening(true);
    };

    recognition.onend = () => {
      if (generation !== recognitionGenerationRef.current) return;
      setListening(false);
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      if (conversationModeRef.current && !pausedForReplyRef.current && !intentionalStopRef.current) {
        scheduleConversationRestart();
      }
      intentionalStopRef.current = false;
    };

    recognition.onerror = (event) => {
      if (generation !== recognitionGenerationRef.current) return;
      if (intentionalStopRef.current || event.error === "aborted") {
        intentionalStopRef.current = false;
        return;
      }
      if (event.error === "no-speech") {
        scheduleConversationRestart();
        return;
      }
      if (conversationModeRef.current) {
        scheduleConversationRestart();
        if (event.error !== "network") return;
      }
      errorFiredRef.current = true;
      onErrorRef.current?.(mapSpeechError(event.error));
    };

    recognition.onresult = (event) => {
      if (generation !== recognitionGenerationRef.current) return;
      if (pausedForReplyRef.current || utteranceSentRef.current) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const chunk = result?.[0]?.transcript ?? "";
        if (!chunk) continue;
        if (result.isFinal) {
          finalTranscriptRef.current += chunk;
        } else {
          interim += chunk;
        }
      }

      const preview = `${finalTranscriptRef.current}${interim}`.trim();
      interimTranscriptRef.current = interim;
      setInterimTranscript(preview);
      if (preview) {
        gotResultRef.current = true;
        scheduleSilenceFinalize();
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      if (!conversationModeRef.current || pausedForReplyRef.current) return;
      const maxAttempts = isIosSafari() ? 6 : 3;
      if (attempt < maxAttempts) {
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          void beginContinuousRecognitionRef.current?.(attempt + 1);
        }, restartDelayMs() * (attempt + 1));
        return;
      }
      scheduleConversationRestart();
    }
  }, [resetTranscript, scheduleConversationRestart, scheduleSilenceFinalize]);

  beginContinuousRecognitionRef.current = (attempt?: number) =>
    beginContinuousRecognition(attempt ?? 0);

  const startConversation = useCallback(
    async (onResult: (text: string) => void, onError?: (message: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) {
        onError?.("このブラウザは音声入力に未対応です。iPhone では Safari でお試しください。");
        return;
      }

      unlockSpeechSynthesis();
      void loadVoices();
      stopSpeaking();
      stopRecognition();
      conversationModeRef.current = true;
      setConversationMode(true);
      voiceEnabledRef.current = true;
      setVoiceEnabled(true);
      pausedForReplyRef.current = false;
      onResultRef.current = onResult;
      onErrorRef.current = onError ?? null;
      await beginContinuousRecognition();
    },
    [beginContinuousRecognition, stopRecognition, stopSpeaking],
  );

  const stopConversation = useCallback(() => {
    conversationModeRef.current = false;
    setConversationMode(false);
    pausedForReplyRef.current = false;
    micGrantedRef.current = false;
    onResultRef.current = null;
    onErrorRef.current = null;
    resetTranscript();
    stopRecognition();
    stopSpeaking();
  }, [resetTranscript, stopRecognition, stopSpeaking]);

  const pauseForReply = useCallback(() => {
    pausedForReplyRef.current = true;
    clearSilenceTimer();
    clearRestartTimer();
    clearTranscriptBuffers();
    stopRecognition();
  }, [clearRestartTimer, clearSilenceTimer, clearTranscriptBuffers, stopRecognition]);

  const resumeAfterReply = useCallback(() => {
    if (!conversationModeRef.current) return;
    pausedForReplyRef.current = false;
    utteranceSentRef.current = false;
    resetTranscript();
    clearRestartTimer();
    void beginContinuousRecognition(0);
  }, [beginContinuousRecognition, clearRestartTimer, resetTranscript]);

  const startListening = useCallback(
    async (onResult: (text: string) => void, onError?: (message: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) {
        onError?.("このブラウザは音声入力に未対応です。Chrome または Edge をお試しください。");
        return;
      }

      if (typeof window !== "undefined" && !window.isSecureContext) {
        onError?.("音声入力は HTTPS 接続でのみ利用できます。");
        return;
      }

      unlockSpeechSynthesis();
      void loadVoices();
      stopSpeaking();
      stopRecognition();

      const micError = await ensureMicrophoneAccess();
      if (micError) {
        onError?.(micError);
        return;
      }

      intentionalStopRef.current = false;
      gotResultRef.current = false;
      errorFiredRef.current = false;

      const recognition = new Ctor();
      recognition.lang = "ja-JP";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);

      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
        if (!gotResultRef.current && !intentionalStopRef.current && !errorFiredRef.current) {
          onError?.("音声が聞こえませんでした。もう一度話してください。");
        }
        intentionalStopRef.current = false;
        errorFiredRef.current = false;
      };

      recognition.onerror = (event) => {
        setListening(false);
        recognitionRef.current = null;
        if (intentionalStopRef.current || event.error === "aborted") {
          intentionalStopRef.current = false;
          return;
        }
        if (event.error === "no-speech" && gotResultRef.current) return;
        errorFiredRef.current = true;
        onError?.(mapSpeechError(event.error));
        intentionalStopRef.current = false;
      };

      recognition.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript?.trim();
        if (!text) return;
        gotResultRef.current = true;
        onResult(text);
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setListening(false);
        onError?.("音声認識を開始できませんでした。少し待ってから再度お試しください。");
      }
    },
    [stopRecognition, stopSpeaking],
  );

  const stopListening = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  useEffect(() => {
    void loadVoices();
    return () => {
      intentionalStopRef.current = true;
      conversationModeRef.current = false;
      clearSilenceTimer();
      clearRestartTimer();
      stopIosKeepAlive();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      stopSpeaking();
    };
  }, [clearRestartTimer, clearSilenceTimer, stopIosKeepAlive, stopSpeaking]);

  return {
    voiceEnabled,
    setVoiceEnabled,
    conversationMode,
    listening,
    speaking,
    speakingAs,
    interimTranscript,
    startListening,
    stopListening,
    startConversation,
    stopConversation,
    pauseForReply,
    resumeAfterReply,
    speakLines,
    stopSpeaking,
    sttSupported: isSpeechRecognitionSupported(),
    ttsSupported: isSpeechSynthesisSupported(),
    supported: isSolunaVoiceSupported(),
  };
}
