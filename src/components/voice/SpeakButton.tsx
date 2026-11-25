import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type { VoiceLanguageCode } from '../../types/niyamsetu';

interface SpeakButtonProps {
  text: string;
  label?: string;
  compact?: boolean;
  className?: string;
  langOverride?: VoiceLanguageCode;
  darkSurface?: boolean;
}

export const SpeakButton: React.FC<SpeakButtonProps> = ({
  text,
  label = 'Listen',
  compact = false,
  className = '',
  langOverride,
  darkSurface = false,
}) => {
  const { lang, token } = useApp();
  const effectiveLang: VoiceLanguageCode = langOverride || lang;
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakWithBrowserFallback = (cleanText: string): boolean => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang =
        effectiveLang === 'hi' ? 'hi-IN' : effectiveLang === 'te' ? 'te-IN' : 'en-IN';
      utterance.rate = 0.95;
      utterance.onend = () => setPlaying(false);
      utterance.onerror = () => setPlaying(false);
      window.speechSynthesis.speak(utterance);
      setPlaying(true);
      return true;
    } catch {
      return false;
    }
  };

  const handleToggleSpeak = async () => {
    if (playing) {
      stopAudio();
      return;
    }
    const clean = text.trim();
    if (!clean || loading) return;

    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{
        audioBase64: string | null;
        mimeType: string;
        modelUsed: string;
        fallbackMode?: string;
      }>('/audio/tts', {
        method: 'POST',
        token,
        body: { text: clean.slice(0, 2200), lang: effectiveLang },
      });

      if (!res.audioBase64 || res.fallbackMode === 'browser_speech') {
        if (!speakWithBrowserFallback(clean.slice(0, 1400))) {
          setError('Browser speech unavailable');
        }
        return;
      }

      const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        setPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        audioRef.current = null;
        if (!speakWithBrowserFallback(clean.slice(0, 1400))) {
          setPlaying(false);
          setError('Playback error');
        }
      };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      if (!speakWithBrowserFallback(clean.slice(0, 1400))) {
        setError(err instanceof Error ? err.message : 'TTS failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const idleClasses = darkSurface
    ? 'border-cyan-500/35 bg-slate-900/90 text-slate-100 hover:border-cyan-400'
    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => void handleToggleSpeak()}
        disabled={loading || !text.trim()}
        title={playing ? 'Stop audio readout' : 'Listen via Gemini 3.8 TTS'}
        className={`inline-flex items-center gap-1 rounded border font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'
        } ${playing ? 'border-rose-500 bg-rose-600 text-white' : idleClasses}`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : playing ? (
          <Square className="w-3 h-3 shrink-0" />
        ) : (
          <Volume2
            className={`w-3 h-3 shrink-0 ${
              darkSurface ? 'text-cyan-300' : 'text-teal-800 dark:text-cyan-300'
            }`}
          />
        )}
        <span>{loading ? 'Generating...' : playing ? 'Stop' : label}</span>
      </button>
      {error && <span className="text-[10px] text-rose-500">{error}</span>}
    </span>
  );
};
