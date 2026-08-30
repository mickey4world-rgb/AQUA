"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() != null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSolunaVoiceSupported(): boolean {
  return isSpeechRecognitionSupported() && isSpeechSynthesisSupported();
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

type SpeakLine = {
  label: string;
  text: string;
  character?: "sol" | "luna";
};

export function useSolunaVoice() {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakingAs, setSpeakingAs] = useState<"sol" | "luna" | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speakQueueRef = useRef<SpeakLine[]>([]);
  const speakingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const gotResultRef = useRef(false);
  const errorFiredRef = useRef(false);

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

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    utteranceSentRef.current = false;
    setInterimTranscript("");
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakQueueRef.current = [];
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingAs(null);
  }, []);

  const finishSpeaking = useCallback(() => {
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingAs(null);
    const onComplete = onSpeakCompleteRef.current;
    onSpeakCompleteRef.current = null;
    onComplete?.();
  }, []);

  const speakNext = useCallback(() => {
    const next = speakQueueRef.current.shift();
    if (!next || typeof window === "undefined" || !window.speechSynthesis) {
      finishSpeaking();
      return;
    }

    speakingRef.current = true;
    setSpeaking(true);
    setSpeakingAs(
      next.character ?? (next.label.includes("ルーナ") ? "luna" : "sol"),
    );

    const utterance = new SpeechSynthesisUtterance(`${next.label}。${next.text}`);
    utterance.lang = "ja-JP";
    utterance.rate = 1.02;
    utterance.pitch = next.label.includes("ルーナ") ? 1.08 : 0.95;
    utterance.onend = () => speakNext();
    utterance.onerror = () => speakNext();
    window.speechSynthesis.speak(utterance);
  }, [finishSpeaking]);

  const speakLines = useCallback(
    (lines: SpeakLine[], onComplete?: () => void) => {
      onSpeakCompleteRef.current = onComplete ?? null;
      if (!voiceEnabled || !isSpeechSynthesisSupported()) {
        finishSpeaking();
        return;
      }
      stopSpeaking();
      speakQueueRef.current = lines.filter((line) => line.text.trim());
      if (speakQueueRef.current.length === 0) {
        finishSpeaking();
        return;
      }
      speakNext();
    },
    [voiceEnabled, speakNext, stopSpeaking, finishSpeaking],
  );

  const stopRecognition = useCallback(() => {
    clearSilenceTimer();
    clearRestartTimer();
    if (!recognitionRef.current) {
      setListening(false);
      return;
    }
    intentionalStopRef.current = true;
    try {
      recognitionRef.current.stop();
    } catch {
      try {
        recognitionRef.current.abort();
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
    }, RESTART_DELAY_MS);
  }, [clearRestartTimer]);

  const finalizeConversationUtterance = useCallback(() => {
    if (utteranceSentRef.current || pausedForReplyRef.current) return;
    const combined = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
    if (!combined) return;

    utteranceSentRef.current = true;
    clearSilenceTimer();
    resetTranscript();
    onResultRef.current?.(combined);
  }, [clearSilenceTimer, resetTranscript]);

  const scheduleSilenceFinalize = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      finalizeConversationUtterance();
    }, SILENCE_MS);
  }, [clearSilenceTimer, finalizeConversationUtterance]);

  const beginContinuousRecognitionRef = useRef<(() => Promise<void>) | null>(null);

  const beginContinuousRecognition = useCallback(async () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || !conversationModeRef.current || pausedForReplyRef.current) return;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      onErrorRef.current?.("音声入力は HTTPS 接続でのみ利用できます。");
      return;
    }

    if (recognitionRef.current) return;

    const micError = await ensureMicrophoneAccess();
    if (micError) {
      onErrorRef.current?.(micError);
      conversationModeRef.current = false;
      setConversationMode(false);
      return;
    }

    intentionalStopRef.current = false;
    errorFiredRef.current = false;
    resetTranscript();

    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (conversationModeRef.current && !pausedForReplyRef.current && !intentionalStopRef.current) {
        scheduleConversationRestart();
      }
      intentionalStopRef.current = false;
    };

    recognition.onerror = (event) => {
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
      scheduleConversationRestart();
    }
  }, [resetTranscript, scheduleConversationRestart, scheduleSilenceFinalize]);

  beginContinuousRecognitionRef.current = beginContinuousRecognition;

  const startConversation = useCallback(
    async (onResult: (text: string) => void, onError?: (message: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) {
        onError?.("このブラウザは音声入力に未対応です。スマホでは Chrome をお試しください。");
        return;
      }

      stopSpeaking();
      stopRecognition();
      conversationModeRef.current = true;
      setConversationMode(true);
      pausedForReplyRef.current = false;
      onResultRef.current = onResult;
      onErrorRef.current = onError ?? null;
      setVoiceEnabled(true);
      await beginContinuousRecognition();
    },
    [beginContinuousRecognition, stopRecognition, stopSpeaking],
  );

  const stopConversation = useCallback(() => {
    conversationModeRef.current = false;
    setConversationMode(false);
    pausedForReplyRef.current = false;
    onResultRef.current = null;
    onErrorRef.current = null;
    resetTranscript();
    stopRecognition();
  }, [resetTranscript, stopRecognition]);

  const pauseForReply = useCallback(() => {
    pausedForReplyRef.current = true;
    clearSilenceTimer();
    resetTranscript();
    stopRecognition();
  }, [clearSilenceTimer, resetTranscript, stopRecognition]);

  const resumeAfterReply = useCallback(() => {
    if (!conversationModeRef.current) return;
    pausedForReplyRef.current = false;
    utteranceSentRef.current = false;
    resetTranscript();
    void beginContinuousRecognition();
  }, [beginContinuousRecognition, resetTranscript]);

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
    return () => {
      intentionalStopRef.current = true;
      conversationModeRef.current = false;
      clearSilenceTimer();
      clearRestartTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      stopSpeaking();
    };
  }, [clearRestartTimer, clearSilenceTimer, stopSpeaking]);

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
