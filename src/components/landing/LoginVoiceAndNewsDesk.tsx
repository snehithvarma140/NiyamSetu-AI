import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones,
  Loader2,
  Newspaper,
  Radio,
  Square,
  Volume2,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import type { NewsFeedItem, NewsFeedPayload, VoiceLanguageCode } from '../../types/niyamsetu';
import { LiveVoiceAdvisor } from '../voice/LiveVoiceAdvisor';

interface LoginVoiceAndNewsDeskProps {
  newsFeed: NewsFeedPayload | null;
  newsLoading: boolean;
  defaultLang: 'en' | 'te';
}

type ReaderTopic = 'all' | 'schemes' | 'national' | 'rules' | 'deadlines' | 'markets';

const READER_TOPICS: Array<{ id: ReaderTopic; labels: Record<VoiceLanguageCode, string> }> = [
  { id: 'all', labels: { en: 'All Top Updates', hi: 'सभी मुख्य समाचार', te: 'అన్ని ముఖ్య వార్తలు' } },
  { id: 'schemes', labels: { en: 'Govt Schemes', hi: 'सरकारी योजनाएं', te: 'ప్రభుత్వ పథకాలు' } },
  { id: 'national', labels: { en: 'National News', hi: 'राष्ट्रीय समाचार', te: 'జాతీయ వార్తలు' } },
  { id: 'rules', labels: { en: 'Rule Changes', hi: 'नियम बदलाव', te: 'నియమ మార్పులు' } },
  { id: 'deadlines', labels: { en: 'Deadlines', hi: 'अंतिम तिथियां', te: 'చివరి తేదీలు' } },
  { id: 'markets', labels: { en: 'Gold & Markets', hi: 'सोना और बाजार', te: 'బంగారం & మార్కెట్' } },
];

const READER_UI_TEXT: Record<
  VoiceLanguageCode,
  {
    badge: string;
    heading: string;
    desc: string;
    readAllBtn: string;
    stopBtn: string;
    preparingBtn: string;
    headlinesLabel: string;
    listenItem: string;
    emptyNotice: string;
  }
> = {
  en: {
    badge: 'Audio News Reader',
    heading: 'Listen to Updates Below in Your Language',
    desc: 'Listen to headlines, government schemes, deadlines, and official notices displayed below without having to read long text.',
    readAllBtn: 'Read Updates Aloud (English)',
    stopBtn: 'Stop Reading',
    preparingBtn: 'Preparing Audio...',
    headlinesLabel: 'Or tap any single headline below to listen:',
    listenItem: 'Listen',
    emptyNotice: 'Loading news and official notifications below...',
  },
  hi: {
    badge: 'समाचार ऑडियो रीडर (Hindi)',
    heading: 'नीचे दी गई खबरें अपनी भाषा में सुनें',
    desc: 'पढ़ने में कठिनाई हो तो नीचे दिए गए राष्ट्रीय समाचार, सरकारी योजनाएं, नियम और अंतिम तिथियां सीधे सुनें।',
    readAllBtn: 'नीचे के अपडेट हिन्दी में सुनें',
    stopBtn: 'सुनना बंद करें',
    preparingBtn: 'ऑडियो तैयार हो रहा है...',
    headlinesLabel: 'या किसी भी एक खबर को चुनकर सुनें:',
    listenItem: 'सुनें',
    emptyNotice: 'नीचे के समाचार और सरकारी सूचनाएं लोड हो रही हैं...',
  },
  te: {
    badge: 'వార్తల ఆడియో రీడర్ (Telugu)',
    heading: 'క్రింది వార్తలను మీ భాషలో వినండి',
    desc: 'చదవడం కష్టంగా ఉంటే క్రింద ఉన్న వార్తలు, ప్రభుత్వ పథకాలు, నియమ మార్పులు మరియు చివరి తేదీలను నేరుగా వినండి.',
    readAllBtn: 'క్రింది వార్తలను తెలుగులో వినండి',
    stopBtn: 'వినడం ఆపండి',
    preparingBtn: 'ఆడియో సిద్ధమవుతోంది...',
    headlinesLabel: 'లేదా క్రింది వార్తల్లో ఏదైనా ఒకదాన్ని ఎంచుకుని వినండి:',
    listenItem: 'వినండి',
    emptyNotice: 'క్రింది వార్తలు మరియు ప్రభుత్వ ప్రకటనలు లోడ్ అవుతున్నాయి...',
  },
};

export const LoginVoiceAndNewsDesk: React.FC<LoginVoiceAndNewsDeskProps> = ({
  newsFeed,
  newsLoading,
  defaultLang,
}) => {
  const [voiceLang, setVoiceLang] = useState<VoiceLanguageCode>(defaultLang);
  const [readerTopic, setReaderTopic] = useState<ReaderTopic>('all');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [spokenScript, setSpokenScript] = useState<string>('');
  const [readerError, setReaderError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setVoiceLang(defaultLang);
  }, [defaultLang]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
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

  const allUpdates = useMemo<NewsFeedItem[]>(() => {
    if (!newsFeed) return [];
    return [...(newsFeed.gov_notifications || []), ...(newsFeed.interest_updates || [])];
  }, [newsFeed]);

  const topicUpdates = useMemo<NewsFeedItem[]>(() => {
    if (allUpdates.length === 0) return [];
    if (readerTopic === 'all') return allUpdates.slice(0, 5);
    const filtered = allUpdates.filter((item) => {
      const cat = `${item.category} ${item.title}`.toLowerCase();
      if (readerTopic === 'schemes') return cat.includes('scheme') || item.badge_type === 'new_scheme';
      if (readerTopic === 'national') return cat.includes('national') || cat.includes('state');
      if (readerTopic === 'rules') return cat.includes('rule') || item.badge_type === 'rule_change';
      if (readerTopic === 'deadlines') return cat.includes('deadline') || item.badge_type === 'deadline';
      if (readerTopic === 'markets') {
        return cat.includes('gold') || cat.includes('silver') || cat.includes('stock') || cat.includes('market');
      }
      return true;
    });
    return (filtered.length > 0 ? filtered : allUpdates).slice(0, 5);
  }, [allUpdates, readerTopic]);

  const newsContextSummary = useMemo(() => {
    if (allUpdates.length === 0) return undefined;
    const summaryLines = allUpdates
      .slice(0, 5)
      .map((u, idx) => `${idx + 1}. ${u.title} (${u.category}): ${u.summary}`)
      .join('\n');
    return `Here are today's official notices & news updates shown on the homepage if the listener asks about them:\n${summaryLines}`;
  }, [allUpdates]);

  const speakWithBrowserEngine = (text: string, targetId: string): boolean => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceLang === 'hi' ? 'hi-IN' : voiceLang === 'te' ? 'te-IN' : 'en-IN';
      u.rate = 0.95;
      u.onend = () => setSpeakingId(null);
      u.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(u);
      setSpeakingId(targetId);
      return true;
    } catch {
      return false;
    }
  };

  const playBriefing = async (itemsToRead: NewsFeedItem[], targetId: string, label: string) => {
    if (speakingId === targetId) {
      stopAudio();
      return;
    }
    if (itemsToRead.length === 0 || loadingId) return;

    stopAudio();
    setReaderError(null);
    setLoadingId(targetId);

    try {
      const res = await apiRequest<{
        spokenText: string;
        audioBase64: string | null;
        mimeType: string;
        modelUsed: string;
        fallbackMode?: string;
      }>('/public/news-speak', {
        method: 'POST',
        body: {
          lang: voiceLang,
          categoryLabel: label,
          items: itemsToRead,
          market_quotes: readerTopic === 'all' || readerTopic === 'markets' ? newsFeed?.market_quotes : undefined,
        },
      });

      setSpokenScript(res.spokenText);
      if (!res.audioBase64 || res.fallbackMode === 'browser_speech') {
        if (!speakWithBrowserEngine(res.spokenText, targetId)) {
          setReaderError('Audio speech synthesis is unavailable in this browser. Read the script below.');
        }
        return;
      }

      const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeakingId(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        audioRef.current = null;
        if (!speakWithBrowserEngine(res.spokenText, targetId)) {
          setSpeakingId(null);
          setReaderError('Audio playback error.');
        }
      };
      try {
        await audio.play();
        setSpeakingId(targetId);
      } catch {
        audioRef.current = null;
        if (!speakWithBrowserEngine(res.spokenText, targetId)) {
          setSpeakingId(null);
          setReaderError('Audio playback blocked by browser settings.');
        }
      }
    } catch (err) {
      const fallbackText = itemsToRead.map((it) => `${it.title}. ${it.summary}`).join(' ').slice(0, 900);
      setSpokenScript(fallbackText);
      if (!speakWithBrowserEngine(fallbackText, targetId)) {
        setReaderError(err instanceof Error ? err.message : 'Unable to generate audio news briefing.');
      }
    } finally {
      setLoadingId(null);
    }
  };

  const ui = READER_UI_TEXT[voiceLang];
  const activeTopicLabel =
    READER_TOPICS.find((t) => t.id === readerTopic)?.labels[voiceLang] || 'All Updates';

  return (
    <section
      id="login-voice-desk"
      aria-label="Live Voice Advisor and Spoken News Reader"
      className="relative bg-[#070d1a] text-slate-100 border-t border-cyan-500/25 px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-300">
              <Headphones className="w-4 h-4 shrink-0" />
              <span>Voice Help &amp; Spoken News Desk · English · हिन्दी · తెలుగు</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white headline-balance">
              Ask Anything by Voice or Listen to Today&apos;s Updates
            </h2>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800 self-start">
            {(
              [
                ['en', 'English'],
                ['hi', 'हिन्दी'],
                ['te', 'తెలుగు'],
              ] as Array<[VoiceLanguageCode, string]>
            ).map(([code, lbl]) => (
              <button
                key={code}
                type="button"
                onClick={() => setVoiceLang(code)}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  voiceLang === code
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left Side: Live Voice Advisor */}
          <div className="lg:col-span-6">
            <LiveVoiceAdvisor
              variant="landing"
              initialLang={voiceLang}
              onLangChange={setVoiceLang}
              contextPrompt={newsContextSummary}
            />
          </div>

          {/* Right Side: Spoken News & Updates Reader in Required Language */}
          <div className="lg:col-span-6 rounded-2xl border border-cyan-500/25 bg-slate-900/80 backdrop-blur-md p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-xl">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                    <h3 className="text-base sm:text-lg font-bold text-white">{ui.heading}</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{ui.desc}</p>
                </div>

                <button
                  type="button"
                  disabled={newsLoading || topicUpdates.length === 0 || (loadingId !== null && loadingId !== 'bulletin')}
                  onClick={() => void playBriefing(topicUpdates, 'bulletin', activeTopicLabel)}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 ${
                    speakingId === 'bulletin'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                  }`}
                >
                  {loadingId === 'bulletin' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : speakingId === 'bulletin' ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                  <span>
                    {loadingId === 'bulletin'
                      ? ui.preparingBtn
                      : speakingId === 'bulletin'
                        ? ui.stopBtn
                        : ui.readAllBtn}
                  </span>
                </button>
              </div>

              {/* Topic Filter Strip for Audio Bulletin */}
              <div className="flex flex-wrap gap-1.5">
                {READER_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setReaderTopic(t.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors whitespace-nowrap ${
                      readerTopic === t.id
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-400/50'
                    }`}
                  >
                    {t.labels[voiceLang]}
                  </button>
                ))}
              </div>

              {readerError && (
                <div className="rounded-md border border-rose-500/40 bg-rose-950/50 p-2.5 text-xs text-rose-200">
                  {readerError}
                </div>
              )}

              {/* Individual News Items to Listen Aloud */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400">{ui.headlinesLabel}</div>
                {topicUpdates.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                    {ui.emptyNotice}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                    {topicUpdates.map((item) => {
                      const isPlayingThis = speakingId === item.id;
                      const isLoadingThis = loadingId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/85 px-3 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-mono">
                              <span
                                className={
                                  item.is_gov_notification ? 'text-cyan-300 font-semibold' : 'text-sky-300'
                                }
                              >
                                {item.is_gov_notification ? 'Official Notice' : 'News'}
                              </span>
                              <span className="text-slate-600">·</span>
                              <span className="text-slate-400 truncate">{item.category}</span>
                            </div>
                            <div className="text-xs font-semibold text-white truncate">
                              {item.title}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={loadingId !== null && !isLoadingThis}
                            onClick={() => void playBriefing([item], item.id, item.category)}
                            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                              isPlayingThis
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-slate-900 border-cyan-500/35 text-cyan-200 hover:border-cyan-400'
                            }`}
                          >
                            {isLoadingThis ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isPlayingThis ? (
                              <Square className="w-3 h-3" />
                            ) : (
                              <Volume2 className="w-3 h-3" />
                            )}
                            <span>
                              {isLoadingThis
                                ? '...'
                                : isPlayingThis
                                  ? ui.stopBtn
                                  : ui.listenItem}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Spoken Script Display */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                <span className="inline-flex items-center gap-1">
                  <Newspaper className="w-3 h-3" />
                  <span>Spoken Audio Script ({voiceLang.toUpperCase()})</span>
                </span>
                {speakingId && <span className="text-emerald-300">Playing Audio...</span>}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                {spokenScript ||
                  (voiceLang === 'hi'
                    ? 'ऊपर "हिन्दी में सुनें" बटन दबाने पर नीचे की खबरों का सरल हिन्दी ऑडियो और पाठ यहाँ दिखेगा।'
                    : voiceLang === 'te'
                      ? 'పైన "తెలుగులో వినండి" బటన్ నొక్కినప్పుడు క్రింది వార్తల ఆడియో మరియు సులభమైన తెలుగు పాఠ్యం ఇక్కడ కనిపిస్తుంది.'
                      : 'Tap "Read Updates Aloud" above to hear a spoken summary of the updates below in English, Hindi, or Telugu.')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
