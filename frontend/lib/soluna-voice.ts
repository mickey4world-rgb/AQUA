"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
  start: () => void;
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

  const startListening = useCallback(
    (onResult: (text: string) => void, onError?: (message: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) {
        onError?.("このブラウザは音声入力に未対応です。");
        return;
      }

      stopSpeaking();
      recognitionRef.current?.abort();

      const recognition = new Ctor();
      recognition.lang = "ja-JP";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);
      recognition.onend = () => setListening(false);
      recognition.onerror = () => {
        setListening(false);
        onError?.("音声入力を取得できませんでした。");
      };
      recognition.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript?.trim();
        if (text) onResult(text);
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [stopSpeaking],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
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
