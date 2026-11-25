import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MessageSquareText,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type { FaqCategory, FaqItem } from '../../types/niyamsetu';

const FAQ_CATEGORIES: Array<'All' | FaqCategory> = [
  'All',
  'Account and profile',
  'Government schemes',
  'Eligibility and benefits',
  'Applications and forms',
  'Required documents',
  'Application delays and tracking',
  'Complaints and grievances',
  'Emergency information',
  'Nearby services',
  'Privacy and security',
];

export const FaqCenterPanel: React.FC = () => {
  const { token, setPage } = useApp();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<'All' | FaqCategory>('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  // Report unanswered question state
  const [reportText, setReportText] = useState('');
  const [reportCategory, setReportCategory] = useState<FaqCategory>('Government schemes');
  const [reporting, setReporting] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<{ faqs: FaqItem[]; unanswered_count: number }>('/faqs')
      .then((res) => {
        if (active) {
          setFaqs(res.faqs || []);
          setUnansweredCount(res.unanswered_count || 0);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const topViewed = useMemo(
    () => [...faqs].sort((a, b) => b.views - a.views).slice(0, 3),
    [faqs]
  );

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((item) => {
      if (activeCat !== 'All' && item.category !== activeCat) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.official_reference.toLowerCase().includes(q)
      );
    });
  }, [faqs, activeCat, query]);

  const faqById = useMemo(() => new Map(faqs.map((f) => [f.id, f])), [faqs]);

  const handleToggleFaq = async (id: string) => {
    const nextOpen = openId === id ? null : id;
    setOpenId(nextOpen);
    if (nextOpen && !viewedIds.has(id)) {
      setViewedIds((prev) => new Set(prev).add(id));
      try {
        const res = await apiRequest<{ faq: FaqItem }>(`/faqs/${id}/view`, { method: 'POST' });
        setFaqs((prev) => prev.map((f) => (f.id === id ? res.faq : f)));
      } catch {
        // ignore
      }
    }
  };

  const handleVote = async (id: string, helpful: boolean) => {
    if (votedIds.has(id)) return;
    setVotedIds((prev) => new Set(prev).add(id));
    try {
      const res = await apiRequest<{ faq: FaqItem }>(`/faqs/${id}/vote`, {
        method: 'POST',
        body: { helpful },
      });
      setFaqs((prev) => prev.map((f) => (f.id === id ? res.faq : f)));
    } catch {
      // ignore
    }
  };

  const handleReportUnanswered = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    setReporting(true);
    setReportNotice(null);
    try {
      await apiRequest('/faqs/unanswered', {
        method: 'POST',
        token,
        body: { question: reportText.trim(), category: reportCategory },
      });
      setReportText('');
      setUnansweredCount((c) => c + 1);
      setReportNotice(
        'Your question was logged to Government Feedback Intelligence for official FAQ drafting.'
      );
    } catch {
      setReportNotice('Unable to submit unanswered question right now.');
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search + Categories */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Frequently Asked Questions &amp; Citizen Knowledge Center
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            {faqs.length} verified answers · 10 categories
          </span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions about FormSathi, delays, Emergency QR, Aadhaar seeding, complaints, privacy..."
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2.5 text-sm"
            aria-label="Search FAQs"
          />
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="FAQ Categories">
          {FAQ_CATEGORIES.map((cat) => {
            const active = activeCat === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCat(cat)}
                className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'border-teal-800 dark:border-cyan-400 bg-teal-800 text-white dark:bg-cyan-500 dark:text-slate-950'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-teal-700'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Frequently Viewed Quick Strip */}
        {topViewed.length > 0 && !query.trim() && activeCat === 'All' && (
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Frequently Viewed Questions
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {topViewed.map((tv) => (
                <button
                  key={tv.id}
                  type="button"
                  onClick={() => void handleToggleFaq(tv.id)}
                  className="text-left p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-700 cursor-pointer space-y-1"
                >
                  <div className="font-mono text-[10px] text-teal-800 dark:text-cyan-300 tabular-nums">
                    {tv.category} · {tv.views} views
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                    {tv.question}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expandable Q&A List */}
        {loading ? (
          <div className="py-6 text-xs text-slate-500 dark:text-slate-400">Loading FAQ library...</div>
        ) : filteredFaqs.length === 0 ? (
          <div className="py-6 text-xs text-slate-500 dark:text-slate-400 space-y-2">
            <p>No FAQ matched &ldquo;{query}&rdquo; in {activeCat}.</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveCat('All');
              }}
              className="text-teal-800 dark:text-cyan-300 font-semibold hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredFaqs.map((item) => {
              const isOpen = openId === item.id;
              const hasVoted = votedIds.has(item.id);
              const relatedItems = item.related_ids
                .map((rid) => faqById.get(rid))
                .filter((x): x is FaqItem => Boolean(x));

              return (
                <div key={item.id} className="py-3.5">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => void handleToggleFaq(item.id)}
                    className="w-full flex items-start justify-between gap-3 text-left cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {item.category} · {item.views} views · {item.helpful_count} helpful
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {item.question}
                      </h3>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.answer}
                      </p>

                      <div className="text-[11px] font-mono text-teal-800 dark:text-cyan-300">
                        Official Reference: {item.official_reference}
                      </div>

                      {relatedItems.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-600 dark:text-slate-400">
                            Related Questions:
                          </span>
                          {relatedItems.map((rel) => (
                            <button
                              key={rel.id}
                              type="button"
                              onClick={() => {
                                setActiveCat('All');
                                void handleToggleFaq(rel.id);
                              }}
                              className="text-teal-800 dark:text-cyan-300 hover:underline font-medium cursor-pointer"
                            >
                              {rel.question}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 dark:text-slate-400">Was this helpful?</span>
                          <button
                            type="button"
                            disabled={hasVoted}
                            onClick={() => void handleVote(item.id, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-emerald-600 disabled:opacity-60 cursor-pointer tabular-nums"
                          >
                            <ThumbsUp className="w-3 h-3 text-emerald-600" />
                            <span>Yes ({item.helpful_count})</span>
                          </button>
                          <button
                            type="button"
                            disabled={hasVoted}
                            onClick={() => void handleVote(item.id, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-rose-600 disabled:opacity-60 cursor-pointer tabular-nums"
                          >
                            <ThumbsDown className="w-3 h-3 text-rose-600" />
                            <span>No ({item.not_helpful_count})</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem('niyamsetu_pending_q', item.question);
                            setPage('jansetu');
                          }}
                          className="inline-flex items-center gap-1 text-teal-800 dark:text-cyan-300 font-semibold hover:underline cursor-pointer"
                        >
                          <MessageSquareText className="w-3.5 h-3.5" />
                          <span>Ask JanSetu AI to explain in simple steps</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Report Unanswered Question */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Didn&apos;t Find Your Answer? Report an Unanswered Question
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Submitted questions feed directly into Government Citizen Feedback Intelligence so new
              verified circulars and FAQs can be published.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
            {unansweredCount} logged
          </span>
        </div>

        <form onSubmit={handleReportUnanswered} className="flex flex-col sm:flex-row gap-2.5 text-xs">
          <select
            value={reportCategory}
            onChange={(e) => setReportCategory(e.target.value as FaqCategory)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
            aria-label="Question category"
          >
            {FAQ_CATEGORIES.filter((c): c is FaqCategory => c !== 'All').map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Write the exact rule, certificate, or portal question you could not find..."
            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            disabled={reporting}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-semibold cursor-pointer whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{reporting ? 'Sending...' : 'Submit Question'}</span>
          </button>
        </form>
        {reportNotice && (
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {reportNotice}
          </div>
        )}
      </section>
    </div>
  );
};
