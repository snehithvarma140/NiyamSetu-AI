import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, PhoneOff, Send, Sparkles, Volume2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest, getWebSocketUrl } from '../../services/api';
import type { VoiceLanguageCode } from '../../types/niyamsetu';
import { SpeakButton } from './SpeakButton';

interface TranscriptEntry {
  speaker: 'You' | 'JanSetu Voice';
  text: string;
}

export interface LiveVoiceAdvisorProps {
  variant?: 'portal' | 'landing';
  initialLang?: VoiceLanguageCode;
  onLangChange?: (lang: VoiceLanguageCode) => void;
  contextPrompt?: string;
}

const VOICE_LANG_OPTIONS: Array<{ code: VoiceLanguageCode; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

const LOCALIZED_COPY: Record<
  VoiceLanguageCode,
  {
    title: string;
    subtitleLanding: string;
    subtitlePortal: string;
    startBtn: string;
    connectingBtn: string;
    endBtn: string;
    idleHint: string;
    liveHint: string;
    inputPlaceholder: string;
    starters: string[];
  }
> = {
  en: {
    title: 'Live Voice Advisor',
    subtitleLanding:
      'Speak naturally in English, Hindi, or Telugu. Ask any question about schemes, documents, certificates, pensions, or today’s news.',
    subtitlePortal:
      'Speak naturally with JanSetu Voice using real-time bidirectional audio streaming. Ask any question aloud.',
    startBtn: 'Start Speaking (Mic)',
    connectingBtn: 'Connecting...',
    endBtn: 'End Voice Session',
    idleHint: 'Tap "Start Speaking (Mic)" or pick a quick topic below to hear spoken guidance.',
    liveHint: 'Listening now — speak your question aloud clearly.',
    inputPlaceholder: 'Or type any question for spoken reply...',
    starters: [
      'What government schemes & scholarships are available for my family?',
      'Which documents are needed for income, caste, or scholarship forms?',
      'Explain today’s latest government updates and deadlines.',
    ],
  },
  hi: {
    title: 'लाइव वॉइस सलाहकार (Hindi)',
    subtitleLanding:
      'हिन्दी में बोलकर कोई भी सवाल पूछें — सरकारी योजनाएं, छात्रवृत्ति, राशन/पेंशन, आधार-बैंक या आज की ताज़ा खबरें।',
    subtitlePortal:
      'रियल-टाइम वॉइस के माध्यम से जनसेतु एआई से सीधे हिन्दी में बात करें और कोई भी प्रश्न पूछें।',
    startBtn: 'बोलना शुरू करें (Mic)',
    connectingBtn: 'जुड़ रहा है...',
    endBtn: 'बातचीत बंद करें',
    idleHint: 'माइक शुरू करने के लिए ऊपर बटन दबाएं या नीचे दिए गए आसान सवाल चुनें।',
    liveHint: 'सुन रहा हूँ — कृपया अपना सवाल हिन्दी में बोलें।',
    inputPlaceholder: 'या यहाँ लिखकर पूछें (आवाज़ में जवाब सुनें)...',
    starters: [
      'सरकारी योजनाओं और छात्रवृत्ति की जानकारी आसान भाषा में बताएं।',
      'आय, जाति प्रमाण पत्र और आधार बैंक लिंक के लिए कौन से कागज चाहिए?',
      'आज की मुख्य सरकारी सूचनाएं और अंतिम तिथियां बताएं।',
    ],
  },
  te: {
    title: 'లైవ్ వాయిస్ సలహాదారు (Telugu)',
    subtitleLanding:
      'తెలుగులో మాట్లాడి ఏ ప్రశ్న అయినా అడగండి — ప్రభుత్వ పథకాలు, స్కాలర్‌షిప్‌లు, సర్టిఫికెట్లు, ఆధార్-బ్యాంక్ లేదా ఈరోజు వార్తలు.',
    subtitlePortal:
      'రియల్-టైమ్ వాయిస్ ద్వారా జనసేతు AIతో తెలుగులో నేరుగా మాట్లాడి ఏ సందేహమైనా అడగండి.',
    startBtn: 'మాట్లాడటం ప్రారంభించండి (Mic)',
    connectingBtn: 'కనెక్ట్ అవుతోంది...',
    endBtn: 'వాయిస్ సెషన్ ఆపండి',
    idleHint: 'మాట్లాడటానికి పై బటన్‌ను నొక్కండి లేదా క్రింది ప్రశ్నల్లో ఒకదాన్ని ఎంచుకోండి.',
    liveHint: 'వింటున్నాను — దయచేసి మీ ప్రశ్నను తెలుగులో చెప్పండి.',
    inputPlaceholder: 'లేదా మీ ప్రశ్నను ఇక్కడ టైప్ చేసి వినండి...',
    starters: [
      'మా కుటుంబానికి ఏ ప్రభుత్వ పథకాలు మరియు స్కాలర్‌షిప్‌లు అందుబాటులో ఉన్నాయి?',
      'ఆదాయ, కుల ధృవీకరణ పత్రాలు మరియు బ్యాంక్ సీడింగ్ కోసం ఏ పత్రాలు కావాలి?',
      'ఈరోజు ముఖ్య ప్రభుత్వ ప్రకటనలు మరియు చివరి తేదీలు చెప్పండి.',
    ],
  },
};

function downsampleFloat32(input: Float32Array, inputRate: number, targetRate = 16000): Float32Array {
  if (!inputRate || inputRate === targetRate || inputRate < targetRate) {
    return input;
  }
  const ratio = inputRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const low = Math.floor(srcIdx);
    const high = Math.min(input.length - 1, low + 1);
    const frac = srcIdx - low;
    result[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return result;
}

function pcmFloat32ToBase64Int16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const LiveVoiceAdvisor: React.FC<LiveVoiceAdvisorProps> = ({
  variant = 'portal',
  initialLang,
  onLangChange,
  contextPrompt,
}) => {
  const { lang, token } = useApp();
  const [voiceLang, setVoiceLang] = useState<VoiceLanguageCode>(initialLang || lang);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [quickBusy, setQuickBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [liveTextInput, setLiveTextInput] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const pendingPromptRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialLang) {
      setVoiceLang(initialLang);
    }
  }, [initialLang]);

  const stopAudioQueue = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore stopped source
      }
    });
    activeSourcesRef.current = [];
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
  };

  const stopSession = () => {
    stopAudioQueue();
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void inputCtxRef.current?.close();
    inputCtxRef.current = null;
    void outputCtxRef.current?.close();
    outputCtxRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    nextStartTimeRef.current = 0;
    setStatus('idle');
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const playPcm24kChunk = (base64Pcm: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const binary = atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  };

  const startSession = async (targetLang: VoiceLanguageCode = voiceLang, initialTextPrompt?: string) => {
    if (statusRef.current !== 'idle') {
      stopSession();
    }
    setError(null);
    setStatus('connecting');
    pendingPromptRef.current = initialTextPrompt || null;

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof AudioContext === 'undefined' ||
        typeof WebSocket === 'undefined'
      ) {
        throw new Error(
          'Live microphone streaming requires an HTTPS browser context with audio support'
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext();
      const outputCtx = new AudioContext();
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const ws = new WebSocket(getWebSocketUrl(`/live?lang=${targetLang}&mode=${variant}`));
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          ready?: boolean;
          audio?: string;
          interrupted?: boolean;
          inputTranscript?: string;
          outputTranscript?: string;
          error?: string;
        };

        if (msg.error) {
          setError(msg.error);
          stopSession();
          return;
        }
        if (msg.ready) {
          setStatus('live');
          if (contextPrompt && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ context: contextPrompt }));
          }
          if (pendingPromptRef.current && ws.readyState === WebSocket.OPEN) {
            const p = pendingPromptRef.current;
            pendingPromptRef.current = null;
            ws.send(JSON.stringify({ text: p }));
            setTranscripts((prev) => [...prev.slice(-19), { speaker: 'You', text: p }]);
          }
        }
        if (msg.audio) {
          playPcm24kChunk(msg.audio);
        }
        if (msg.interrupted) {
          activeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {
              // ignore
            }
          });
          activeSourcesRef.current = [];
          if (outputCtxRef.current) {
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
        }
        if (msg.inputTranscript) {
          setTranscripts((prev) => {
            const text = msg.inputTranscript!.trim();
            if (!text) return prev;
            const last = prev[prev.length - 1];
            if (last && last.speaker === 'You') {
              return [...prev.slice(0, -1), { speaker: 'You', text: `${last.text} ${text}`.trim() }];
            }
            return [...prev.slice(-19), { speaker: 'You', text }];
          });
        }
        if (msg.outputTranscript) {
          setTranscripts((prev) => {
            const text = msg.outputTranscript!.trim();
            if (!text) return prev;
            const last = prev[prev.length - 1];
            if (last && last.speaker === 'JanSetu Voice') {
              return [
                ...prev.slice(0, -1),
                { speaker: 'JanSetu Voice', text: `${last.text} ${text}`.trim() },
              ];
            }
            return [...prev.slice(-19), { speaker: 'JanSetu Voice', text }];
          });
        }
      };

      ws.onerror = () => {
        setError('Live microphone stream could not connect. You can still ask questions below to hear spoken answers.');
        stopSession();
      };

      ws.onclose = () => {
        if (statusRef.current !== 'idle') {
          stopSession();
        }
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        const currentWs = wsRef.current;
        if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
        const raw = e.inputBuffer.getChannelData(0);
        const resampled = downsampleFloat32(raw, inputCtx.sampleRate, 16000);
        const base64 = pcmFloat32ToBase64Int16(resampled);
        currentWs.send(JSON.stringify({ audio: base64 }));
      };
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. You can still type or tap a quick question below for spoken answers.`
          : 'Microphone unavailable. Tap a starter question or type below for spoken answers.'
      );
      stopSession();
    }
  };

  // Speak-first text question fallback / instant spoken reply without requiring mic permissions
  const askAndSpeakPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || quickBusy) return;

    if (status === 'live' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text: trimmed }));
      setTranscripts((prev) => [...prev.slice(-19), { speaker: 'You', text: trimmed }]);
      setLiveTextInput('');
      return;
    }

    setError(null);
    setQuickBusy(true);
    setTranscripts((prev) => [...prev.slice(-19), { speaker: 'You', text: trimmed }]);
    setLiveTextInput('');
    try {
      const qaRes = await apiRequest<{ answer: string }>('/jansetu/ask', {
        method: 'POST',
        token,
        body: { question: trimmed, lang: voiceLang },
      });
      const reply = qaRes.answer;
      setTranscripts((prev) => [...prev.slice(-19), { speaker: 'JanSetu Voice', text: reply }]);

      // Auto-speak answer via Gemini TTS or browser SpeechSynthesis fallback
      try {
        const ttsRes = await apiRequest<{
          audioBase64: string | null;
          mimeType: string;
          fallbackMode?: string;
        }>('/audio/tts', {
          method: 'POST',
          token,
          body: { text: reply, lang: voiceLang },
        });
        stopAudioQueue();
        if (ttsRes.audioBase64 && ttsRes.fallbackMode !== 'browser_speech') {
          const audio = new Audio(`data:${ttsRes.mimeType || 'audio/wav'};base64,${ttsRes.audioBase64}`);
          ttsAudioRef.current = audio;
          await audio.play();
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(reply.slice(0, 900));
          u.lang = voiceLang === 'hi' ? 'hi-IN' : voiceLang === 'te' ? 'te-IN' : 'en-IN';
          window.speechSynthesis.speak(u);
        }
      } catch {
        // Silent fallback to Web Speech if needed
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(reply.slice(0, 900));
          u.lang = voiceLang === 'hi' ? 'hi-IN' : voiceLang === 'te' ? 'te-IN' : 'en-IN';
          window.speechSynthesis.speak(u);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to answer right now.');
    } finally {
      setQuickBusy(false);
    }
  };

  const handleLanguageSelect = (nextLang: VoiceLanguageCode) => {
    setVoiceLang(nextLang);
    onLangChange?.(nextLang);
    if (status === 'live') {
      void startSession(nextLang);
    }
  };

  const copy = LOCALIZED_COPY[voiceLang];
  const isLanding = variant === 'landing';

  const containerCls = isLanding
    ? 'rounded-2xl border border-cyan-500/25 bg-slate-900/80 backdrop-blur-md p-5 sm:p-6 space-y-4 shadow-xl text-slate-100 h-full flex flex-col justify-between'
    : 'rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4';

  const boxCls = isLanding
    ? 'rounded-xl border border-slate-800 bg-slate-950/85 p-4 min-h-[168px] max-h-[250px] overflow-y-auto space-y-2.5'
    : 'rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 min-h-[168px] max-h-[280px] overflow-y-auto space-y-2.5';

  return (
    <section className={containerCls} aria-label="Live Voice Advisor">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mic
                className={`w-4 h-4 shrink-0 ${
                  isLanding ? 'text-cyan-400' : 'text-teal-800 dark:text-cyan-300'
                }`}
                aria-hidden="true"
              />
              <h2
                className={`text-base sm:text-lg font-bold ${
                  isLanding ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {copy.title}
              </h2>
              {status === 'live' && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Live Mic Active
                </span>
              )}
            </div>
            <p
              className={`text-xs leading-relaxed ${
                isLanding ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {isLanding ? copy.subtitleLanding : copy.subtitlePortal}
            </p>
          </div>

          {status === 'idle' ? (
            <button
              type="button"
              onClick={() => void startSession(voiceLang)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                isLanding
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                  : 'bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{copy.startBtn}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopSession}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              <PhoneOff className="w-4 h-4" />
              <span>{status === 'connecting' ? copy.connectingBtn : copy.endBtn}</span>
            </button>
          )}
        </div>

        {/* Language Switcher: English / Hindi / Telugu */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[11px] font-semibold ${
              isLanding ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Spoken Language:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {VOICE_LANG_OPTIONS.map((opt) => {
              const active = voiceLang === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleLanguageSelect(opt.code)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold border cursor-pointer transition-colors whitespace-nowrap ${
                    active
                      ? isLanding
                        ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                        : 'bg-teal-800 dark:bg-cyan-500 border-teal-800 dark:border-cyan-400 text-white dark:text-slate-950'
                      : isLanding
                        ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-400/50'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-teal-700'
                  }`}
                >
                  {opt.native}
                  {opt.code !== 'en' ? ` (${opt.label})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick one-tap spoken prompts (landing desk only — JanSetu portal uses open questions) */}
        {isLanding && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium flex items-center gap-1.5 text-cyan-300/90">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>Tap a question to hear an instant answer aloud:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {copy.starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  disabled={quickBusy}
                  onClick={() => void askAndSpeakPrompt(starter)}
                  className="text-left px-2.5 py-1.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-50 border-slate-800 bg-slate-950/90 text-slate-200 hover:border-cyan-400/60 hover:text-cyan-200"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div
            className={`rounded-md border p-3 text-xs ${
              isLanding
                ? 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
            }`}
          >
            {error}
          </div>
        )}

        {/* Live Transcript Panel */}
        <div className={boxCls}>
          {transcripts.length === 0 ? (
            <div
              className={`flex items-center gap-2 text-xs ${
                isLanding ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Volume2 className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>{status === 'live' ? copy.liveHint : copy.idleHint}</span>
            </div>
          ) : (
            transcripts.map((t, i) => (
              <div key={i} className="text-xs leading-relaxed flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`font-semibold ${
                      t.speaker === 'You'
                        ? isLanding
                          ? 'text-white'
                          : 'text-slate-900 dark:text-slate-100'
                        : isLanding
                          ? 'text-cyan-300'
                          : 'text-teal-800 dark:text-cyan-300'
                    }`}
                  >
                    {t.speaker}:{' '}
                  </span>
                  <span className={isLanding ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                    {t.text}
                  </span>
                </div>
                {t.speaker === 'JanSetu Voice' && (
                  <SpeakButton
                    text={t.text}
                    label="Replay"
                    compact
                    langOverride={voiceLang}
                    darkSurface={isLanding}
                  />
                )}
              </div>
            ))
          )}
          {quickBusy && (
            <div className="flex items-center gap-1.5 text-xs text-cyan-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Preparing spoken guidance...</span>
            </div>
          )}
        </div>
      </div>

      {/* Text + Speak Bar (Always active so users can either talk via mic or type and hear audio back) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void askAndSpeakPrompt(liveTextInput);
        }}
        className="flex items-center gap-2 pt-1"
      >
        <input
          type="text"
          value={liveTextInput}
          onChange={(e) => setLiveTextInput(e.target.value)}
          placeholder={copy.inputPlaceholder}
          className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-xs ${
            isLanding
              ? 'border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100'
          }`}
        />
        <button
          type="submit"
          disabled={quickBusy || !liveTextInput.trim()}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 ${
            isLanding
              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              : 'bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>{status === 'live' ? 'Send' : 'Ask & Listen'}</span>
        </button>
      </form>
    </section>
  );
};
