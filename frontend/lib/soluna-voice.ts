"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

type SpeechRecognitionResultEvent = {
  results: { [index: number]: { [index: number]: { transcript?: string } } };
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
        return "マイクが見つかりません。Windows のサウンド設定で入力デバイスを確認してください。";
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
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakingAs, setSpeakingAs] = useState<"sol" | "luna" | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speakQueueRef = useRef<SpeakLine[]>([]);
  const speakingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const gotResultRef = useRef(false);
  const errorFiredRef = useRef(false);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speakQueueRef.current = [];
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingAs(null);
  }, []);

  const speakNext = useCallback(() => {
    const next = speakQueueRef.current.shift();
    if (!next || typeof window === "undefined" || !window.speechSynthesis) {
      speakingRef.current = false;
      setSpeaking(false);
      setSpeakingAs(null);
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
  }, []);

  const speakLines = useCallback(
    (lines: SpeakLine[]) => {
      if (!voiceEnabled || !isSpeechSynthesisSupported()) return;
      stopSpeaking();
      speakQueueRef.current = lines.filter((line) => line.text.trim());
      speakNext();
    },
    [voiceEnabled, speakNext, stopSpeaking],
  );

  const stopRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
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
  }, []);

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
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      stopSpeaking();
    };
  }, [stopSpeaking]);

  return {
    voiceEnabled,
    setVoiceEnabled,
    listening,
    speaking,
    speakingAs,
    startListening,
    stopListening,
    speakLines,
    stopSpeaking,
    sttSupported: isSpeechRecognitionSupported(),
    ttsSupported: isSpeechSynthesisSupported(),
    supported: isSolunaVoiceSupported(),
  };
}
