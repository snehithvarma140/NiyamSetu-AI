import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Globe,
  MessageCircle,
  MessageSquareText,
  Mic,
  Scale,
  Send,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import { SourceCitationButton } from '../../components/ui/SourceCitationButton';
import { StatusText } from '../../components/ui/StatusText';
import { VoiceTranscribeButton } from '../../components/voice/VoiceTranscribeButton';
import { LiveVoiceAdvisor } from '../../components/voice/LiveVoiceAdvisor';
import { SpeakButton } from '../../components/voice/SpeakButton';
import { GrievanceRtiPage } from './GrievanceRtiPage';
import type { VoiceLanguageCode } from '../../types/niyamsetu';

interface CitationItem {
  rule_id: string;
  document_id: string;
  page_number: number;
  clause_reference: string;
  label: string;
  condition_text: string;
}

interface AskResponse {
  question: string;
  lang: VoiceLanguageCode;
  answer: string;
  abstained: boolean;
  grounding_mode?: 'verified_rules' | 'gemini_ai_guidance';
  citations: CitationItem[];
  disclaimer: string;
}

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  meta?: string;
}

interface WebSource {
  title: string;
  uri: string;
}

interface SearchGroundedResponse {
  answer: string;
  webSources: WebSource[];
  groundingMode?: 'google_search' | 'verified_portal_fallback';
}

type JanSetuTab = 'qa' | 'chat' | 'search' | 'voice' | 'grievance';

export const JanSetuPage: React.FC<{ initialTab?: JanSetuTab }> = ({ initialTab = 'qa' }) => {
  const { lang, setLang, token, refreshOverview } = useApp();
  const [activeTab, setActiveTab] = useState<JanSetuTab>(initialTab);
  const [aiLang, setAiLang] = useState<VoiceLanguageCode>(lang);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setAiLang(lang);
  }, [lang]);

  const handleSelectAiLang = (nextLang: VoiceLanguageCode) => {
    setAiLang(nextLang);
    if (nextLang === 'en' || nextLang === 'te') {
      setLang(nextLang);
    }
  };

  // Tab 1: Grounded Rule Q&A
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AskResponse[]>([]);

  // Tab 2: Multi-Turn AI Chat
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [modelTier, setModelTier] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    'gemini-4-hydrogen'
  );
  const [thinkingLevel, setThinkingLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH'>('LOW');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Tab 3: Google Search Grounding
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchGroundedResponse | null>(null);

  const askQuestion = async (qText: string, targetLang: VoiceLanguageCode = aiLang) => {
    const trimmed = qText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<AskResponse>('/jansetu/ask', {
        method: 'POST',
        token,
        body: { question: trimmed, lang: targetLang },
      });
      setHistory((prev) => [res, ...prev]);
      setQuestion('');
      await refreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to answer question.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const pending = sessionStorage.getItem('niyamsetu_pending_q');
    if (pending) {
      sessionStorage.removeItem('niyamsetu_pending_q');
      setQuestion(pending);
      void askQuestion(pending, aiLang);
    }
  }, []);

  const submitChatMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || chatLoading) return;
    const nextUserTurn: ChatTurn = { role: 'user', text: trimmed };
    const priorHistory = chatHistory.map((h) => ({ role: h.role, text: h.text }));
    setChatHistory((prev) => [...prev, nextUserTurn]);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await apiRequest<{ reply: string; modelUsed: string; thinkingLevel: string }>(
        '/jansetu/chat',
        {
          method: 'POST',
          token,
          body: {
            message: trimmed,
            history: priorHistory,
            modelTier,
            thinkingLevel,
            lang: aiLang,
          },
        }
      );
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'model',
          text: res.reply,
          meta: `${res.modelUsed} · Thinking: ${res.thinkingLevel}`,
        },
      ]);
      await refreshOverview();
    } catch (err) {
      setChatHistory(priorHistory);
      setChatInput(trimmed);
      setChatError(err instanceof Error ? err.message : 'Unable to complete chat turn.');
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatTurn = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitChatMessage(chatInput);
  };

  const executeSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed || searchLoading) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await apiRequest<SearchGroundedResponse>('/jansetu/search-grounded', {
        method: 'POST',
        token,
        body: { query: trimmed, lang: aiLang },
      });
      setSearchResult(res);
      await refreshOverview();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Google Search grounding failed.');
    } finally {
      setSearchLoading(false);
    }
  };

  const runSearchGrounding = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSearch(searchQuery);
  };

  const continueInChatbot = (item: AskResponse) => {
    setChatHistory((prev) => [
      ...prev,
      { role: 'user', text: item.question },
      {
        role: 'model',
        text: item.answer,
        meta:
          item.citations.length > 0 || item.grounding_mode === 'verified_rules'
            ? 'Verified Active Circular Rules'
            : 'Gemini AI General Guidance',
      },
    ]);
    setActiveTab('chat');
  };

  const tabs: Array<{ id: JanSetuTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'qa', label: 'Gemini AI Q&A', icon: MessageSquareText },
    { id: 'chat', label: 'Gemini AI Chatbot', icon: MessageCircle },
    { id: 'search', label: 'Web Search Grounding', icon: Globe },
    { id: 'voice', label: 'Live Voice Advisor', icon: Mic },
    { id: 'grievance', label: 'Grievance & RTI Drafts', icon: Scale },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            JanSetu Gemini AI &amp; Citizen Assistance Hub
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ask any scholarship, portal, document, or general citizen question — Gemini AI answers
            every question, grounded first in verified circular rules and backed by full AI guidance.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start">
          {(
            [
              ['en', 'English'],
              ['hi', 'हिन्दी (Hindi)'],
              ['te', 'తెలుగు (Telugu)'],
            ] as Array<[VoiceLanguageCode, string]>
          ).map(([code, lbl]) => (
            <button
              key={code}
              type="button"
              onClick={() => handleSelectAiLang(code)}
              className={`px-3 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors whitespace-nowrap ${
                aiLang === code
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                active
                  ? 'border-teal-800 dark:border-cyan-400 bg-teal-800/10 dark:bg-cyan-400/15 text-teal-900 dark:text-cyan-200'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Grounded Rules Q&A */}
      {activeTab === 'qa' && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askQuestion(question);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  aiLang === 'hi'
                    ? 'सरकारी योजना, दस्तावेज़, पात्रता या कोई भी प्रश्न पूछें...'
                    : aiLang === 'te'
                      ? 'పథకాలు, పత్రాలు, లేదా ఏదైనా ప్రజా సేవ గురించి మీ ప్రశ్న అడగండి...'
                      : 'Ask any question — schemes, certificates, deadlines, Aadhaar, ration card, or general help...'
                }
                className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100"
                aria-label="Question for JanSetu AI"
              />
              <VoiceTranscribeButton
                onTranscript={(txt) => setQuestion((prev) => (prev ? `${prev} ${txt}` : txt))}
                disabled={loading}
                langOverride={aiLang}
                label="Speak"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>{loading ? 'Checking rules...' : 'Ask JanSetu'}</span>
              </button>
            </form>

            {error && (
              <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3.5 flex items-start gap-2.5 text-sm text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            {history.length === 0 && !loading && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
                <Sparkles
                  className="w-6 h-6 mx-auto text-teal-800 dark:text-cyan-300"
                  aria-hidden="true"
                />
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Ask or dictate any question above — scheme rules, portals, certificates, or next steps
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                  When a question matches active NiyamSetu circulars, clickable clause citations
                  appear automatically. Broader portal, hostel, or documentation questions are
                  answered directly with Gemini AI General Guidance.
                </p>
              </div>
            )}

            {history.map((item, idx) => {
              const hasVerifiedRules =
                item.citations.length > 0 || item.grounding_mode === 'verified_rules';
              return (
                <article
                  key={idx}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Question (
                      {item.lang === 'te'
                        ? 'తెలుగు'
                        : item.lang === 'hi'
                          ? 'हिन्दी'
                          : 'English'}
                      ):{' '}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.question}
                      </span>
                    </div>
                    <StatusText
                      status="verified"
                      labelOverride={
                        hasVerifiedRules
                          ? 'Verified Active Circular Rules'
                          : 'Gemini AI General Guidance'
                      }
                    />
                  </div>

                  <p className="text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-line">
                    {item.answer}
                  </p>

                  {item.citations.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Source evidence (click to inspect document page):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.citations.map((c) => (
                          <SourceCitationButton
                            key={c.rule_id}
                            documentId={c.document_id}
                            pageNumber={c.page_number}
                            clauseRef={c.clause_reference}
                            label={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.disclaimer}</p>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <SpeakButton
                        text={item.answer}
                        langOverride={item.lang || aiLang}
                        label="Listen"
                        compact
                      />
                      <button
                        type="button"
                        onClick={() => continueInChatbot(item)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer shrink-0"
                      >
                        <span>Continue in Gemini AI Chatbot</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}

      {/* TAB 2: Gemini AI Chatbot */}
      {activeTab === 'chat' && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Gemini AI Chatbot — Answers Every Question
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Context-aware across all 16 schemes, your Profile &amp; Memorized Vault documents,
                and general portal, OTR, Aadhaar seeding, or grievance guidance.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={modelTier}
                onChange={(e) =>
                  setModelTier(
                    e.target.value === 'gemini-3.1-flash-lite'
                      ? 'gemini-3.1-flash-lite'
                      : 'gemini-4-hydrogen'
                  )
                }
                aria-label="Gemini model tier"
                className="rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium"
              >
                <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Balanced)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Fast)</option>
              </select>
              <select
                value={thinkingLevel}
                disabled={modelTier === 'gemini-3.1-flash-lite'}
                onChange={(e) =>
                  setThinkingLevel(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH')
                }
                aria-label="Thinking depth"
                className="rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <option value="LOW">Thinking: Low</option>
                <option value="MEDIUM">Thinking: Medium</option>
                <option value="HIGH">Thinking: High</option>
                <option value="XHIGH">Thinking: Extra High (Deep)</option>
              </select>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 min-h-[260px] max-h-[420px] overflow-y-auto space-y-3">
            {chatHistory.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" />
                <span>
                  Type or dictate any question below — Gemini AI will guide you across verified
                  circulars, missing documents, portals, and application steps.
                </span>
              </div>
            ) : (
              chatHistory.map((turn, idx) => (
                <div
                  key={idx}
                  className={`rounded-md p-3 text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ml-6'
                      : 'bg-teal-50/70 dark:bg-cyan-950/30 border border-teal-200/70 dark:border-cyan-900/60 mr-6'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span>{turn.role === 'user' ? 'You' : 'JanSetu Gemini AI'}</span>
                    <div className="flex items-center gap-2">
                      {turn.meta && <span className="font-mono">{turn.meta}</span>}
                      {turn.role === 'model' && (
                        <SpeakButton text={turn.text} langOverride={aiLang} compact />
                      )}
                    </div>
                  </div>
                  <div className="whitespace-pre-line text-slate-800 dark:text-slate-100">
                    {turn.text}
                  </div>
                </div>
              ))
            )}
          </div>

          {chatError && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
              {chatError}
            </div>
          )}

          <form onSubmit={sendChatTurn} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                aiLang === 'hi'
                  ? 'कोई भी सवाल पूछें या बातचीत जारी रखें...'
                  : aiLang === 'te'
                    ? 'మీ సందేశాన్ని లేదా ఏదైనా ప్రశ్నను టైప్ చేయండి...'
                    : 'Ask any question or continue the conversation...'
              }
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              aria-label="Multi-turn chat message"
            />
            <VoiceTranscribeButton
              onTranscript={(txt) => setChatInput((prev) => (prev ? `${prev} ${txt}` : txt))}
              disabled={chatLoading}
              langOverride={aiLang}
              label="Dictate"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>{chatLoading ? 'Thinking...' : 'Send'}</span>
            </button>
          </form>
        </section>
      )}

      {/* TAB 3: Google Search Grounding */}
      {activeTab === 'search' && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Official Portal & Live Notice Check (Google Search Grounding)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Uses Gemini with Google Search grounding to check recent government portal updates and
              return live web source citations.
            </p>
          </div>

          <form onSubmit={runSearchGrounding} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                aiLang === 'hi'
                  ? 'सरकारी पोर्टल, अंतिम तिथि, राशन कार्ड, आधार या कोई विषय खोजें...'
                  : aiLang === 'te'
                    ? 'ప్రభుత్వ పోర్టల్, చివరి తేదీ, మీసేవ లేదా ఏదైనా అంశం శోధించండి...'
                    : 'Search live portal notices, scholarships, Aadhaar, ration card, MeeSeva...'
              }
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              aria-label="Google Search Grounding Query"
            />
            <VoiceTranscribeButton
              onTranscript={(txt) => setSearchQuery((prev) => (prev ? `${prev} ${txt}` : txt))}
              disabled={searchLoading}
              langOverride={aiLang}
              label="Speak"
            />
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-4 h-4" />
              <span>{searchLoading ? 'Searching Web...' : 'Verify with Search'}</span>
            </button>
          </form>

          {searchError && (
            <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
              {searchError}
            </div>
          )}

          {searchResult && (
            <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {searchResult.groundingMode === 'verified_portal_fallback'
                    ? 'Verified Official Portal Reference Mode'
                    : 'Live Google Search Grounded'}
                </span>
                <SpeakButton
                  text={searchResult.answer}
                  label="Listen to Summary"
                  langOverride={aiLang}
                  compact
                />
              </div>
              <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-line">
                {searchResult.answer}
              </div>

              {searchResult.webSources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Web Grounding Sources:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchResult.webSources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-teal-800 dark:text-cyan-300 hover:border-teal-700 dark:hover:border-cyan-400"
                      >
                        <span className="truncate max-w-[260px]">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: Live Voice Advisor */}
      {activeTab === 'voice' && (
        <LiveVoiceAdvisor initialLang={aiLang} onLangChange={handleSelectAiLang} />
      )}

      {/* TAB 5: Grievance & RTI Assistant */}
      {activeTab === 'grievance' && <GrievanceRtiPage langOverride={aiLang} />}
    </div>
  );
};
