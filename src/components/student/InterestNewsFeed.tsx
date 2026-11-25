import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Info,
  Newspaper,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type {
  GovChangeAlert,
  NewsFeedItem,
  NewsFeedPayload,
  SavedNewsUpdate,
} from '../../types/niyamsetu';

export const InterestNewsFeed: React.FC = () => {
  const { user, token, setPage, setAuthModalOpen, saveUserProfile } = useApp();
  const [feed, setFeed] = useState<NewsFeedPayload | null>(null);
  const [changeAlerts, setChangeAlerts] = useState<GovChangeAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const savedUpdates: SavedNewsUpdate[] = user?.saved_updates || [];
  const savedIds = new Set(savedUpdates.map((u) => u.id));

  const loadFeed = useCallback(
    async (forceRefresh = false) => {
      if (!token) {
        setFeed(null);
        setChangeAlerts([]);
        return;
      }
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [feedRes, alertsRes] = await Promise.all([
          apiRequest<NewsFeedPayload>(forceRefresh ? '/news-feed?refresh=1' : '/news-feed', {
            token,
          }),
          apiRequest<{ change_alerts: GovChangeAlert[] }>('/citizen/change-alerts', { token }),
        ]);
        setFeed(feedRes);
        setChangeAlerts(alertsRes.change_alerts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load personalised updates.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadFeed(false);
  }, [loadFeed, user?.interests?.join('|'), user?.state, user?.district, user?.language_preference]);

  const handleToggleSave = async (item: NewsFeedItem) => {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setSavingItemId(item.id);
    try {
      if (savedIds.has(item.id)) {
        const res = await apiRequest<{ saved_updates: SavedNewsUpdate[] }>(
          `/profile/saved-updates/${encodeURIComponent(item.id)}`,
          { method: 'DELETE', token }
        );
        await saveUserProfile({ saved_updates: res.saved_updates });
      } else {
        const res = await apiRequest<{ saved_updates: SavedNewsUpdate[] }>(
          '/profile/saved-updates',
          {
            method: 'POST',
            token,
            body: {
              id: item.id,
              title: item.title,
              summary: item.summary,
              category: item.category,
              source_name: item.source_name,
              source_url: item.source_url,
              published_at: item.published_at,
              is_gov_notification: item.is_gov_notification,
            },
          }
        );
        await saveUserProfile({ saved_updates: res.saved_updates });
      }
    } catch {
      // Fallback: silent catch; server route updates user.saved_updates
    } finally {
      setSavingItemId(null);
    }
  };

  if (!token) {
    return (
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            My Interests &amp; Daily Verified Feed
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sign in to personalise government notifications, district updates, scholarships, agriculture,
            and informational market feeds based on your selected interests.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="px-3.5 py-2 rounded-md bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          Sign In to Personalise Feed
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-teal-800 dark:text-cyan-300 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              My Daily Briefing — Official Notifications &amp; Selected Interests
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Topics: {(feed?.interests || user?.interests || ['Government schemes and notifications']).join(' · ')}
            {feed?.generated_at && (
              <span className="font-mono tabular-nums ml-2">
                · Updated {new Date(feed.generated_at).toLocaleString('en-IN')}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSavedDrawer((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer whitespace-nowrap"
          >
            <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Saved Updates ({savedUpdates.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setPage('profile_vault')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Manage Interests</span>
          </button>

          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void loadFeed(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-900 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Updates'}</span>
          </button>
        </div>
      </div>

      {/* Government Rule Change Impact Alerts */}
      {changeAlerts.length > 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/25 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
            <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Revised Government Rules &amp; Circulars Affecting Your Profile / Drafts</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            {changeAlerts.slice(0, 4).map((ca) => (
              <div
                key={ca.id}
                className="flex items-start justify-between gap-2 border-t border-amber-200/70 dark:border-amber-800/50 pt-2 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-mono text-[11px] font-bold text-amber-900 dark:text-amber-300 tabular-nums">
                    {ca.scheme_code} · Effective {ca.effective_date} ·{' '}
                    {ca.reason === 'active_application' ? 'Active Application Match' : 'Relevant Circular'}
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 leading-snug">{ca.summary}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Updates Section (Toggleable) */}
      {showSavedDrawer && (
        <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Your Saved Bookmarks ({savedUpdates.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowSavedDrawer(false)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Close
            </button>
          </div>
          {savedUpdates.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No saved updates yet. Click Save on any notification or news update below.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {savedUpdates.map((su) => (
                <div key={su.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {su.category} · {su.source_name} · Saved{' '}
                      {new Date(su.saved_at).toLocaleDateString('en-IN')}
                    </div>
                    <a
                      href={su.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-teal-800 dark:text-cyan-300 hover:underline inline-flex items-center gap-1"
                    >
                      <span>{su.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void handleToggleSave({
                        id: su.id,
                        title: su.title,
                        summary: su.summary,
                        category: su.category,
                        source_name: su.source_name,
                        source_url: su.source_url,
                        published_at: su.published_at,
                        is_gov_notification: su.is_gov_notification,
                      })
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                    aria-label={`Remove saved update ${su.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">{error}</div>
      )}

      {loading && !feed ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
          <div className="h-36 rounded bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
          <div className="h-36 rounded bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: Official Government Notifications */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Official Government Notifications
              </h3>
              <span className="text-[11px] font-mono text-teal-800 dark:text-cyan-300 tabular-nums">
                {(feed?.gov_notifications || []).length} verified notices
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {(feed?.gov_notifications || []).map((item) => {
                const isSaved = savedIds.has(item.id);
                return (
                  <article key={item.id} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="truncate">
                        {item.category} · {item.source_name} ·{' '}
                        {new Date(item.published_at).toLocaleDateString('en-IN')}
                      </span>
                      <button
                        type="button"
                        disabled={savingItemId === item.id}
                        onClick={() => void handleToggleSave(item)}
                        className="inline-flex items-center gap-1 text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                      >
                        {isSaved ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            <span>Saved</span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.summary}
                    </p>
                    <div>
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline"
                      >
                        <span>Official Portal / Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Column 2: General News & Interest Updates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Interest-Based News &amp; Market Updates
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {(feed?.interest_updates || []).length} items
              </span>
            </div>

            {feed?.market_notice && (
              <div className="flex items-start gap-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                <Info className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300 shrink-0 mt-0.5" />
                <span>
                  {feed.market_notice} Market figures, when shown from verified publishers, are strictly
                  informational and never financial advice.
                </span>
              </div>
            )}

            {(feed?.interest_updates || []).length === 0 ? (
              <div className="py-6 text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <p>
                  No live search updates returned right now for your selected topics, or live external
                  market pricing is currently unavailable (we never fabricate prices or headlines).
                </p>
                <button
                  type="button"
                  onClick={() => void loadFeed(true)}
                  className="text-teal-800 dark:text-cyan-300 font-semibold hover:underline cursor-pointer"
                >
                  Retry Live Source Lookup
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {(feed?.interest_updates || []).map((item) => {
                  const isSaved = savedIds.has(item.id);
                  return (
                    <article key={item.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="truncate">
                          {item.category} · {item.source_name} ·{' '}
                          {new Date(item.published_at).toLocaleDateString('en-IN')}
                          {item.is_market_informational ? ' · Informational Only' : ''}
                        </span>
                        <button
                          type="button"
                          disabled={savingItemId === item.id}
                          onClick={() => void handleToggleSave(item)}
                          className="inline-flex items-center gap-1 text-teal-800 dark:text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                        >
                          {isSaved ? (
                            <>
                              <BookmarkCheck className="w-3.5 h-3.5" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.summary}
                      </p>
                      <div>
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline"
                        >
                          <span>Read at {item.source_name}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
