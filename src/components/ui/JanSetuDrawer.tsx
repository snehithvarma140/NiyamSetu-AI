import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ExternalLink,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { VoiceTranscribeButton } from '../voice/VoiceTranscribeButton';
import { SpeakButton } from '../voice/SpeakButton';
import type { VoiceLanguageCode } from '../../types/niyamsetu';

interface DrawerMessage {
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
}

export const JanSetuDrawer: React.FC = () => {
  const {
    janSetuDrawerOpen,
    setJanSetuDrawerOpen,
    lang,
    token,
    user,
    setPage,
  } = useApp();

  const [drawerLang, setDrawerLang] = useState<VoiceLanguageCode>(lang);
  const [messages, setMessages] = useState<DrawerMessage[]>([]);
  const [input, setInput] = useState('');
  const [modelTier, setModelTier] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    'gemini-4-hydrogen'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDrawerLang(lang);
  }, [lang]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, janSetuDrawerOpen]);

  const sendMessage = async (customText?: string) => {
    const q = (customText ?? input).trim();
    if (!q || busy) return;
    setError(null);
    if (!customText) setInput('');
    const priorMessages = messages;
    const nextHistory = [...priorMessages, { role: 'user' as const, text: q }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const res = await apiRequest<{
        reply: string;
        modelUsed: string;
      }>('/jansetu/chat', {
        method: 'POST',
        token,
        body: {
          message: q,
          lang: drawerLang,
          modelTier,
          thinkingLevel: modelTier === 'gemini-4-hydrogen' ? 'MEDIUM' : 'LOW',
          history: priorMessages.slice(-10).map((m) => ({ role: m.role, text: m.text })),
        },
      });
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: res.reply, modelUsed: res.modelUsed },
      ]);
    } catch (err) {
      setMessages(priorMessages);
      if (!customText) setInput(q);
      setError(err instanceof Error ? err.message : 'Unable to reach JanSetu AI.');
    } finally {
      setBusy(false);
    }
  };

  if (!janSetuDrawerOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
      role="dialog"
      aria-label="JanSetu AI Persistent Assistant"
    >
      <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {lang === 'te' ? 'జనసేతు AI సహాయకుడు' : 'JanSetu AI Assistant'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {user ? `Personalized for ${user.name}` : 'Rules + Document + Application Guide'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setJanSetuDrawerOpen(false);
              setPage('jansetu');
            }}
            className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Full View</span>
          </button>
          <button
            type="button"
            onClick={() => setJanSetuDrawerOpen(false)}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
            aria-label="Close JanSetu Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transparency Legend + Compact Model Mode */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-teal-50/60 dark:bg-cyan-950/20 text-[11px] text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3 h-3 text-teal-800 dark:text-cyan-300" />
            <span>Verified Rules</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>AI Guidance</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Unconfirmed flagged</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
            {(
              [
                ['en', 'EN'],
                ['hi', 'हिं'],
                ['te', 'తె'],
              ] as Array<[VoiceLanguageCode, string]>
            ).map(([code, lbl]) => (
              <button
                key={code}
                type="button"
                onClick={() => setDrawerLang(code)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                  drawerLang === code
                    ? 'bg-teal-800 dark:bg-cyan-500 text-white dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <select
            value={modelTier}
            onChange={(e) =>
              setModelTier(
                e.target.value === 'gemini-3.1-flash-lite'
                  ? 'gemini-3.1-flash-lite'
                  : 'gemini-4-hydrogen'
              )
            }
            aria-label="Drawer model mode"
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold"
          >
            <option value="gemini-4-hydrogen">Hydrogen</option>
            <option value="gemini-3.1-flash-lite">Flash Lite</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="py-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'te'
                ? 'పథకాల అర్హత, కొత్త నియమాల మార్పులు, అవసరమైన పత్రాలు లేదా దరఖాస్తు విధానంపై ఏదైనా అడగండి.'
                : 'Type or speak any question below about scheme eligibility rules, old vs new notification changes, required documents, or portal submission steps.'}
            </p>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-8 bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950 font-medium'
                : 'mr-4 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <div>{m.text}</div>
            {(m.modelUsed || m.role === 'model') && (
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-mono opacity-85">
                <span>{m.modelUsed || 'JanSetu AI'} · Never share OTPs</span>
                {m.role === 'model' && (
                  <SpeakButton text={m.text} langOverride={drawerLang} compact />
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="mr-8 rounded-lg p-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Checking verified rules & generating response...
          </div>
        )}
        {error && (
          <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-200">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 bg-white dark:bg-slate-900"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            lang === 'te' ? 'మీ ప్రశ్నను ఇక్కడ టైప్ చేయండి...' : 'Ask JanSetu AI anything...'
          }
          className="flex-1 min-w-0 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
        />
        <VoiceTranscribeButton
          onTranscript={(txt) => setInput((prev) => (prev ? `${prev} ${txt}` : txt))}
          disabled={busy}
          langOverride={drawerLang}
          label=""
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="px-3 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
};
