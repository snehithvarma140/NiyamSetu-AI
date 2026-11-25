import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coins,
  Cpu,
  ExternalLink,
  Gavel,
  Globe,
  GraduationCap,
  HeartPulse,
  Info,
  Landmark,
  LayoutGrid,
  MapPin,
  Newspaper,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  TrendingUp,
  X,
} from 'lucide-react';
import type {
  CitizenInterestTopic,
  LanguageCode,
  NewsFeedItem,
  NewsFeedPayload,
} from '../../types/niyamsetu';
import type { PageId } from '../../context/AppContext';
import { SpeakButton } from '../voice/SpeakButton';

const SHOWCASE_CATEGORIES = [
  'All Updates',
  'For Your Interests',
  'National News and Important Announcements',
  'Government Schemes and New Benefits',
  'New Government Rules and Policy Changes',
  'Stock Market and Company Updates',
  'Gold and Silver Prices',
  'Education, Scholarships and Exams',
  'Jobs, Recruitment and Employment',
  'Healthcare and Public Health Updates',
  'Agriculture and Farmer Updates',
  'Technology, AI and Innovation',
  'State and District News',
  'Application Deadlines and Important Dates',
] as const;

type ShowcaseCategoryFilter = (typeof SHOWCASE_CATEGORIES)[number];

const SHORT_CATEGORY_LABELS: Record<ShowcaseCategoryFilter, string> = {
  'All Updates': 'All Updates',
  'For Your Interests': 'For Your Interests',
  'National News and Important Announcements': 'National News',
  'Government Schemes and New Benefits': 'Govt Schemes',
  'New Government Rules and Policy Changes': 'Rule Changes',
  'Stock Market and Company Updates': 'Stock Market',
  'Gold and Silver Prices': 'Gold & Silver',
  'Education, Scholarships and Exams': 'Education & Exams',
  'Jobs, Recruitment and Employment': 'Jobs & Recruitment',
  'Healthcare and Public Health Updates': 'Healthcare',
  'Agriculture and Farmer Updates': 'Agriculture',
  'Technology, AI and Innovation': 'Tech & AI',
  'State and District News': 'State & District',
  'Application Deadlines and Important Dates': 'Deadlines',
};

const STATE_DISTRICT_PRESETS: Array<{ state: string; district: string }> = [
  { state: 'Telangana', district: 'Hyderabad' },
  { state: 'Andhra Pradesh', district: 'Vijayawada' },
  { state: 'Maharashtra', district: 'Mumbai' },
  { state: 'Karnataka', district: 'Bengaluru' },
  { state: 'Tamil Nadu', district: 'Chennai' },
  { state: 'Delhi', district: 'New Delhi' },
];

interface SavedPublicUpdate extends NewsFeedItem {
  saved_at: string;
}

function readSavedPublicUpdates(): SavedPublicUpdate[] {
  try {
    const raw = localStorage.getItem('niyamsetu_saved_public_updates');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore invalid storage
  }
  return [];
}

function matchesInterestTopic(item: NewsFeedItem, interests: CitizenInterestTopic[]): boolean {
  const cat = item.category.toLowerCase();
  const title = item.title.toLowerCase();
  return interests.some((topic) => {
    const t = topic.toLowerCase();
    if (t.includes('government schemes') && (cat.includes('scheme') || cat.includes('rule') || item.is_gov_notification)) {
      return true;
    }
    if (t.includes('national') && cat.includes('national')) return true;
    if (t.includes('gold') && (cat.includes('gold') || cat.includes('silver') || title.includes('gold'))) {
      return true;
    }
    if (t.includes('stock') && (cat.includes('stock') || cat.includes('company') || title.includes('nifty'))) {
      return true;
    }
    if (t.includes('education') && (cat.includes('education') || cat.includes('job') || cat.includes('scholarship'))) {
      return true;
    }
    if (t.includes('agriculture') && cat.includes('agri')) return true;
    if (t.includes('technology') && (cat.includes('tech') || cat.includes('ai'))) return true;
    if (t.includes('business') && (cat.includes('business') || cat.includes('stock') || cat.includes('economy'))) {
      return true;
    }
    if (t.includes('health') && cat.includes('health')) return true;
    if (t.includes('state') && (cat.includes('state') || cat.includes('district'))) return true;
    return false;
  });
}

function matchesCategoryFilter(
  item: NewsFeedItem,
  filter: ShowcaseCategoryFilter,
  interests: CitizenInterestTopic[]
): boolean {
  if (filter === 'All Updates') return true;
  if (filter === 'For Your Interests') return matchesInterestTopic(item, interests);

  const cat = item.category.toLowerCase();
  const title = item.title.toLowerCase();
  switch (filter) {
    case 'National News and Important Announcements':
      return cat.includes('national');
    case 'Government Schemes and New Benefits':
      return cat.includes('scheme') || item.badge_type === 'new_scheme';
    case 'New Government Rules and Policy Changes':
      return cat.includes('rule') || cat.includes('policy') || item.badge_type === 'rule_change';
    case 'Stock Market and Company Updates':
      return cat.includes('stock') || cat.includes('company') || cat.includes('business') || title.includes('nifty') || title.includes('sensex');
    case 'Gold and Silver Prices':
      return cat.includes('gold') || cat.includes('silver') || cat.includes('bullion') || title.includes('gold');
    case 'Education, Scholarships and Exams':
      return cat.includes('education') || cat.includes('scholarship') || cat.includes('exam');
    case 'Jobs, Recruitment and Employment':
      return cat.includes('job') || cat.includes('recruit') || cat.includes('employ') || cat.includes('skill');
    case 'Healthcare and Public Health Updates':
      return cat.includes('health') || cat.includes('medical') || title.includes('ayushman');
    case 'Agriculture and Farmer Updates':
      return cat.includes('agri') || cat.includes('farmer') || title.includes('rythu');
    case 'Technology, AI and Innovation':
      return cat.includes('tech') || cat.includes('ai') || cat.includes('digital');
    case 'State and District News':
      return cat.includes('state') || cat.includes('district');
    case 'Application Deadlines and Important Dates':
      return cat.includes('deadline') || item.badge_type === 'deadline' || Boolean(item.deadline_date);
    default:
      return true;
  }
}

function getCategoryVisualMeta(item: NewsFeedItem): {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  accentText: string;
  label: string;
  badgeStyle: string;
  artworkKind: 'national' | 'scheme' | 'rule' | 'market' | 'bullion' | 'education' | 'jobs' | 'health' | 'agri' | 'tech' | 'deadline';
} {
  const cat = item.category.toLowerCase();
  const badge = item.badge_type || (item.is_gov_notification ? 'rule_change' : 'update');

  const label =
    badge === 'breaking'
      ? 'Breaking News'
      : badge === 'new_scheme'
        ? 'New Scheme'
        : badge === 'rule_change'
          ? 'Rule Change'
          : badge === 'deadline'
            ? 'Upcoming Deadline'
            : badge === 'market'
              ? 'Market Data'
              : item.is_gov_notification
                ? 'Official Gov Notice'
                : 'Verified Update';

  const badgeStyle =
    badge === 'breaking'
      ? 'text-rose-300'
      : badge === 'new_scheme'
        ? 'text-emerald-300'
        : badge === 'rule_change'
          ? 'text-amber-300'
          : badge === 'deadline'
            ? 'text-orange-300'
            : badge === 'market'
              ? 'text-sky-300'
              : 'text-cyan-300';

  if (cat.includes('stock') || cat.includes('company') || cat.includes('business')) {
    return {
      icon: TrendingUp,
      gradient: 'from-emerald-950/90 via-slate-900 to-cyan-950/70',
      accentText: 'text-emerald-300',
      label,
      badgeStyle,
      artworkKind: 'market',
    };
  }
  if (cat.includes('gold') || cat.includes('silver') || cat.includes('bullion')) {
    return {
      icon: Coins,
      gradient: 'from-amber-950/90 via-slate-900 to-yellow-950/60',
      accentText: 'text-amber-300',
      label,
      badgeStyle,
      artworkKind: 'bullion',
    };
  }
  if (cat.includes('deadline')) {
    return {
      icon: CalendarClock,
      gradient: 'from-orange-950/85 via-slate-900 to-rose-950/70',
      accentText: 'text-orange-300',
      label,
      badgeStyle,
      artworkKind: 'deadline',
    };
  }
  if (cat.includes('rule') || cat.includes('policy')) {
    return {
      icon: Gavel,
      gradient: 'from-amber-950/80 via-slate-900 to-slate-950',
      accentText: 'text-amber-300',
      label,
      badgeStyle,
      artworkKind: 'rule',
    };
  }
  if (cat.includes('scheme')) {
    return {
      icon: Landmark,
      gradient: 'from-teal-950/90 via-slate-900 to-cyan-950/70',
      accentText: 'text-teal-300',
      label,
      badgeStyle,
      artworkKind: 'scheme',
    };
  }
  if (cat.includes('health') || cat.includes('medical')) {
    return {
      icon: HeartPulse,
      gradient: 'from-cyan-950/90 via-slate-900 to-emerald-950/70',
      accentText: 'text-cyan-300',
      label,
      badgeStyle,
      artworkKind: 'health',
    };
  }
  if (cat.includes('agri') || cat.includes('farmer')) {
    return {
      icon: Sprout,
      gradient: 'from-lime-950/85 via-slate-900 to-emerald-950/80',
      accentText: 'text-lime-300',
      label,
      badgeStyle,
      artworkKind: 'agri',
    };
  }
  if (cat.includes('job') || cat.includes('recruit') || cat.includes('employ')) {
    return {
      icon: Briefcase,
      gradient: 'from-indigo-950/85 via-slate-900 to-blue-950/75',
      accentText: 'text-indigo-300',
      label,
      badgeStyle,
      artworkKind: 'jobs',
    };
  }
  if (cat.includes('education') || cat.includes('scholarship')) {
    return {
      icon: GraduationCap,
      gradient: 'from-blue-950/90 via-slate-900 to-cyan-950/70',
      accentText: 'text-sky-300',
      label,
      badgeStyle,
      artworkKind: 'education',
    };
  }
  if (cat.includes('tech') || cat.includes('ai')) {
    return {
      icon: Cpu,
      gradient: 'from-violet-950/85 via-slate-900 to-cyan-950/75',
      accentText: 'text-cyan-300',
      label,
      badgeStyle,
      artworkKind: 'tech',
    };
  }
  return {
    icon: Globe,
    gradient: 'from-sky-950/90 via-slate-900 to-slate-950',
    accentText: 'text-sky-300',
    label,
    badgeStyle,
    artworkKind: 'national',
  };
}

const CategoryThumbnailVisual: React.FC<{ item: NewsFeedItem }> = ({ item }) => {
  const gradId = useId();
  const meta = getCategoryVisualMeta(item);
  const Icon = meta.icon;

  return (
    <div
      className={`relative h-28 w-full rounded-lg overflow-hidden border border-slate-800 bg-gradient-to-br ${meta.gradient} flex items-center justify-between px-4`}
    >
      {/* Subtle geometric backdrop pattern */}
      <svg
        className="absolute inset-0 w-full h-full opacity-25 pointer-events-none"
        viewBox="0 0 320 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        {meta.artworkKind === 'market' ? (
          <polyline
            fill="none"
            stroke="#34d399"
            strokeWidth="2.5"
            points="10,95 65,78 110,84 160,52 215,58 265,28 310,20"
          />
        ) : meta.artworkKind === 'bullion' ? (
          <>
            <rect x="180" y="54" width="52" height="20" rx="3" fill="#fbbf24" fillOpacity="0.35" />
            <rect x="208" y="34" width="52" height="20" rx="3" fill="#f59e0b" fillOpacity="0.45" />
            <rect x="236" y="54" width="52" height="20" rx="3" fill="#fbbf24" fillOpacity="0.35" />
          </>
        ) : (
          <>
            <circle cx="265" cy="60" r="46" stroke={`url(#${gradId})`} strokeWidth="1.5" fill="none" />
            <circle cx="265" cy="60" r="28" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="1" fill="none" />
            <line x1="0" y1="92" x2="320" y2="92" stroke="#38bdf8" strokeOpacity="0.2" strokeWidth="1" />
          </>
        )}
      </svg>

      <div className="relative z-10 flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-lg bg-slate-950/80 border border-cyan-500/30 flex items-center justify-center shrink-0">
          <Icon className={`w-5 h-5 ${meta.accentText}`} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-slate-300 truncate">
            {item.is_gov_notification ? 'Official Notification' : 'News & Sector Desk'}
          </div>
          <div className="text-xs font-semibold text-white truncate max-w-[180px]">
            {item.department || item.source_name}
          </div>
        </div>
      </div>

      <span className={`relative z-10 text-[11px] font-mono font-semibold shrink-0 ${meta.badgeStyle}`}>
        {meta.label}
      </span>
    </div>
  );
};

type BentoArtworkType =
  | 'market'
  | 'bullion'
  | 'national'
  | 'scheme'
  | 'rule'
  | 'health'
  | 'deadline'
  | 'guidance';

const BentoSideArtwork: React.FC<{ kind: BentoArtworkType }> = ({ kind }) => {
  const gradId = useId();
  return (
    <div className="w-20 h-20 sm:w-24 sm:h-20 shrink-0 rounded-lg overflow-hidden border border-cyan-500/25 bg-slate-950/90 relative flex items-center justify-center">
      <svg
        viewBox="0 0 96 80"
        className="w-full h-full block"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#082f49" />
          </linearGradient>
        </defs>
        <rect width="96" height="80" fill={`url(#${gradId})`} />
        {kind === 'market' && (
          <>
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points="8,62 24,52 38,56 54,34 68,40 88,18"
            />
            <polygon
              fill="#10b981"
              fillOpacity="0.16"
              points="8,62 24,52 38,56 54,34 68,40 88,18 88,74 8,74"
            />
            <circle cx="88" cy="18" r="3" fill="#34d399" />
          </>
        )}
        {kind === 'bullion' && (
          <>
            <rect x="14" y="44" width="32" height="14" rx="2" fill="#f59e0b" />
            <rect x="48" y="44" width="32" height="14" rx="2" fill="#d97706" />
            <rect x="31" y="27" width="34" height="14" rx="2" fill="#fbbf24" />
            <line x1="35" y1="31" x2="60" y2="31" stroke="#fef3c7" strokeWidth="1.5" />
          </>
        )}
        {kind === 'national' && (
          <>
            <path d="M22,64 L22,36 C22,22 74,22 74,36 L74,64 Z" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
            <rect x="30" y="40" width="6" height="22" fill="#38bdf8" fillOpacity="0.65" />
            <rect x="45" y="40" width="6" height="22" fill="#38bdf8" fillOpacity="0.65" />
            <rect x="60" y="40" width="6" height="22" fill="#38bdf8" fillOpacity="0.65" />
            <line x1="48" y1="14" x2="48" y2="25" stroke="#fbbf24" strokeWidth="1.8" />
            <rect x="48" y="14" width="12" height="6" fill="#22d3ee" />
          </>
        )}
        {kind === 'scheme' && (
          <>
            <rect x="20" y="16" width="56" height="48" rx="5" fill="#0f172a" stroke="#2dd4bf" strokeWidth="1.5" />
            <circle cx="48" cy="34" r="9" fill="#14b8a6" fillOpacity="0.3" stroke="#2dd4bf" strokeWidth="1.5" />
            <line x1="30" y1="50" x2="66" y2="50" stroke="#99f6e4" strokeWidth="2" />
            <line x1="34" y1="56" x2="62" y2="56" stroke="#2dd4bf" strokeOpacity="0.6" strokeWidth="1.5" />
          </>
        )}
        {kind === 'rule' && (
          <>
            <rect x="18" y="56" width="60" height="8" rx="3" fill="#b45309" />
            <g transform="rotate(-28 48 36)">
              <rect x="32" y="24" width="28" height="12" rx="2" fill="#fbbf24" />
              <rect x="44" y="36" width="5" height="24" rx="1.5" fill="#d97706" />
            </g>
          </>
        )}
        {kind === 'health' && (
          <>
            <rect x="18" y="20" width="60" height="44" rx="5" fill="#0f172a" stroke="#22d3ee" strokeWidth="1.5" />
            <rect x="43" y="28" width="10" height="28" rx="2" fill="#fb7185" />
            <rect x="34" y="37" width="28" height="10" rx="2" fill="#fb7185" />
          </>
        )}
        {kind === 'deadline' && (
          <>
            <rect x="18" y="18" width="52" height="44" rx="5" fill="#0f172a" stroke="#fb923c" strokeWidth="1.5" />
            <rect x="18" y="18" width="52" height="12" rx="4" fill="#ea580c" />
            <circle cx="64" cy="54" r="12" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
            <polyline points="64,48 64,54 69,56" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {kind === 'guidance' && (
          <>
            <circle cx="48" cy="34" r="15" fill="#facc15" fillOpacity="0.25" stroke="#fde047" strokeWidth="1.8" />
            <rect x="41" y="49" width="14" height="9" rx="2" fill="#22d3ee" />
            <line x1="48" y1="11" x2="48" y2="15" stroke="#fde047" strokeWidth="2" />
            <line x1="25" y1="34" x2="29" y2="34" stroke="#fde047" strokeWidth="2" />
            <line x1="67" y1="34" x2="71" y2="34" stroke="#fde047" strokeWidth="2" />
          </>
        )}
      </svg>
    </div>
  );
};

interface LatestUpdatesShowcaseProps {
  lang: LanguageCode;
  allInterestTopics: CitizenInterestTopic[];
  selectedInterests: CitizenInterestTopic[];
  onToggleInterest: (topic: CitizenInterestTopic) => void;
  location: { state: string; district: string };
  onLocationChange: (next: { state: string; district: string }) => void;
  newsFeed: NewsFeedPayload | null;
  newsLoading: boolean;
  newsRefreshing: boolean;
  newsError: string | null;
  onRefresh: () => void;
  onQuickAccess: (targetPage: PageId) => void;
}

export const LatestUpdatesShowcase: React.FC<LatestUpdatesShowcaseProps> = ({
  lang,
  allInterestTopics,
  selectedInterests,
  onToggleInterest,
  location,
  onLocationChange,
  newsFeed,
  newsLoading,
  newsRefreshing,
  newsError,
  onRefresh,
  onQuickAccess,
}) => {
  const [activeCategory, setActiveCategory] = useState<ShowcaseCategoryFilter>('All Updates');
  const [personalizedOnly, setPersonalizedOnly] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [readerItem, setReaderItem] = useState<NewsFeedItem | null>(null);
  const [savedUpdates, setSavedUpdates] = useState<SavedPublicUpdate[]>(() =>
    readSavedPublicUpdates()
  );

  // Carousel scroll & animation state
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const scrollPosRef = useRef<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Location inline inputs
  const [draftState, setDraftState] = useState(location.state);
  const [draftDistrict, setDraftDistrict] = useState(location.district);

  useEffect(() => {
    setDraftState(location.state);
    setDraftDistrict(location.district);
  }, [location.district, location.state]);

  const savedIds = useMemo(() => new Set(savedUpdates.map((s) => s.id)), [savedUpdates]);

  const toggleSaveUpdate = (item: NewsFeedItem) => {
    setSavedUpdates((prev) => {
      const exists = prev.some((x) => x.id === item.id);
      const next = exists
        ? prev.filter((x) => x.id !== item.id)
        : [{ ...item, saved_at: new Date().toISOString() }, ...prev].slice(0, 30);
      try {
        localStorage.setItem('niyamsetu_saved_public_updates', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  // Combine Official Government Notifications + Live Search Interest Updates, prioritizing state/district matches
  const combinedUpdates = useMemo<NewsFeedItem[]>(() => {
    if (!newsFeed) return [];
    const merged = [...(newsFeed.gov_notifications || []), ...(newsFeed.interest_updates || [])];
    const stateLower = location.state.toLowerCase();
    const districtLower = location.district.toLowerCase();

    return merged.sort((a, b) => {
      const aLocal =
        (stateLower && `${a.title} ${a.summary}`.toLowerCase().includes(stateLower)) ||
        (districtLower && `${a.title} ${a.summary}`.toLowerCase().includes(districtLower))
          ? 1
          : 0;
      const bLocal =
        (stateLower && `${b.title} ${b.summary}`.toLowerCase().includes(stateLower)) ||
        (districtLower && `${b.title} ${b.summary}`.toLowerCase().includes(districtLower))
          ? 1
          : 0;
      if (aLocal !== bLocal) return bLocal - aLocal;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
  }, [location.district, location.state, newsFeed]);

  const filteredUpdates = useMemo<NewsFeedItem[]>(() => {
    let list = combinedUpdates;
    if (personalizedOnly) {
      list = list.filter((item) => matchesInterestTopic(item, selectedInterests));
    }
    if (activeCategory !== 'All Updates') {
      list = list.filter((item) => matchesCategoryFilter(item, activeCategory, selectedInterests));
    }
    return list;
  }, [activeCategory, combinedUpdates, personalizedOnly, selectedInterests]);

  const shouldLoopSeamless = filteredUpdates.length >= 3;
  const renderedCarouselItems = useMemo(
    () =>
      shouldLoopSeamless
        ? [
            ...filteredUpdates.map((item) => ({ item, copyKey: `a-${item.id}` })),
            ...filteredUpdates.map((item) => ({ item, copyKey: `b-${item.id}` })),
          ]
        : filteredUpdates.map((item) => ({ item, copyKey: `a-${item.id}` })),
    [filteredUpdates, shouldLoopSeamless]
  );

  // Reset scroll offset cleanly when filters change
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    scrollPosRef.current = 0;
    el.scrollLeft = 0;
  }, [activeCategory, personalizedOnly, selectedInterests]);

  // Continuous smooth right-to-left horizontal auto-scrolling with sub-pixel accumulator
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || isPaused || hoverPaused || filteredUpdates.length <= 1) return;

    scrollPosRef.current = el.scrollLeft;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 0.1);
      lastTs = now;
      if (el.scrollWidth > el.clientWidth + 10) {
        scrollPosRef.current += dt * 48;
        if (shouldLoopSeamless) {
          const halfWidth = el.scrollWidth / 2;
          if (halfWidth > 0 && scrollPosRef.current >= halfWidth) {
            scrollPosRef.current -= halfWidth;
          }
        } else if (scrollPosRef.current + el.clientWidth >= el.scrollWidth - 2) {
          scrollPosRef.current = 0;
        }
        el.scrollLeft = scrollPosRef.current;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [filteredUpdates.length, hoverPaused, isPaused, shouldLoopSeamless]);

  // Sync pagination indicators with scroll position
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const updatePagination = () => {
      const singleSetWidth = shouldLoopSeamless ? el.scrollWidth / 2 : el.scrollWidth;
      const maxScroll = Math.max(1, shouldLoopSeamless ? singleSetWidth : el.scrollWidth - el.clientWidth);
      const estimatedPages = Math.max(
        1,
        Math.min(8, Math.ceil(singleSetWidth / Math.max(el.clientWidth, 320)))
      );
      setTotalPages(estimatedPages);
      const normalizedLeft = shouldLoopSeamless && singleSetWidth > 0 ? el.scrollLeft % singleSetWidth : el.scrollLeft;
      const ratio = Math.min(1, Math.max(0, normalizedLeft / maxScroll));
      setActivePageIndex(Math.min(estimatedPages - 1, Math.round(ratio * (estimatedPages - 1))));
    };
    updatePagination();
    el.addEventListener('scroll', updatePagination, { passive: true });
    window.addEventListener('resize', updatePagination);
    return () => {
      el.removeEventListener('scroll', updatePagination);
      window.removeEventListener('resize', updatePagination);
    };
  }, [filteredUpdates, shouldLoopSeamless]);

  const scrollCarouselBy = (direction: 'left' | 'right') => {
    const el = carouselRef.current;
    if (!el) return;
    const step = Math.max(300, Math.round(el.clientWidth * 0.72));
    if (direction === 'left') {
      if (el.scrollLeft <= 4) {
        const target = shouldLoopSeamless ? el.scrollWidth / 2 - step : el.scrollWidth;
        scrollPosRef.current = Math.max(0, target);
        el.scrollTo({ left: scrollPosRef.current, behavior: 'smooth' });
      } else {
        scrollPosRef.current = Math.max(0, el.scrollLeft - step);
        el.scrollBy({ left: -step, behavior: 'smooth' });
      }
    } else {
      const limit = shouldLoopSeamless ? el.scrollWidth / 2 : el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= limit - 4) {
        scrollPosRef.current = 0;
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scrollPosRef.current = el.scrollLeft + step;
        el.scrollBy({ left: step, behavior: 'smooth' });
      }
    }
  };

  const jumpToPage = (pageIdx: number) => {
    const el = carouselRef.current;
    if (!el) return;
    const singleSetWidth = shouldLoopSeamless ? el.scrollWidth / 2 : el.scrollWidth;
    const maxScroll = Math.max(0, shouldLoopSeamless ? singleSetWidth - el.clientWidth / 2 : el.scrollWidth - el.clientWidth);
    const target = totalPages <= 1 ? 0 : (pageIdx / (totalPages - 1)) * maxScroll;
    scrollPosRef.current = target;
    el.scrollTo({ left: target, behavior: 'smooth' });
  };

  const openCategoryViewAll = (category: ShowcaseCategoryFilter) => {
    setActiveCategory(category);
    setViewAllOpen(true);
  };

  const marketQuotes = newsFeed?.market_quotes || [];
  const stockQuotes = marketQuotes.filter((q) => !/gold|silver|bullion/i.test(q.symbol));
  const bullionQuotes = marketQuotes.filter((q) => /gold|silver|bullion/i.test(q.symbol));

  const topNational = combinedUpdates.find((i) =>
    matchesCategoryFilter(i, 'National News and Important Announcements', selectedInterests)
  ) || combinedUpdates[0];
  const topScheme = combinedUpdates.find((i) =>
    matchesCategoryFilter(i, 'Government Schemes and New Benefits', selectedInterests)
  );
  const topRule = combinedUpdates.find((i) =>
    matchesCategoryFilter(i, 'New Government Rules and Policy Changes', selectedInterests)
  );
  const topHealth = combinedUpdates.find((i) =>
    matchesCategoryFilter(i, 'Healthcare and Public Health Updates', selectedInterests)
  );
  const topDeadline = combinedUpdates.find((i) =>
    matchesCategoryFilter(i, 'Application Deadlines and Important Dates', selectedInterests)
  );

  const tickerItems = useMemo(() => {
    const entries: Array<{ id: string; text: string; tone: string; item?: NewsFeedItem }> = [];
    marketQuotes.forEach((q, idx) => {
      entries.push({
        id: `mq-${idx}`,
        text: `${q.symbol}: ${q.price} (${q.change}) · ${q.source}`,
        tone:
          q.direction === 'up'
            ? 'text-emerald-300'
            : q.direction === 'down'
              ? 'text-rose-300'
              : 'text-sky-300',
      });
    });
    if (marketQuotes.length === 0) {
      entries.push({
        id: 'mq-unavail',
        text: 'Market Feed: Live NSE/BSE & IBJA quotes unavailable right now (No synthetic figures displayed)',
        tone: 'text-amber-300',
      });
    }
    combinedUpdates.slice(0, 8).forEach((item) => {
      entries.push({
        id: `tk-${item.id}`,
        text: `${item.is_gov_notification ? 'Official' : 'News'} · ${item.title}`,
        tone: item.is_gov_notification ? 'text-cyan-300' : 'text-slate-200',
        item,
      });
    });
    return entries;
  }, [combinedUpdates, marketQuotes]);

  return (
    <section
      id="login-interest-news"
      aria-label="Latest Updates Across India"
      className="relative bg-[#060b16] text-slate-100 border-t border-cyan-500/25 overflow-hidden"
    >
      {/* Subtle radial atmospheric glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 65% 60% at 50% 0%, rgba(14, 165, 233, 0.22), transparent 75%)',
        }}
        aria-hidden="true"
      />

      {/* 1. Continuous Live Market & National Ticker Strip */}
      <div
        className="relative border-b border-cyan-500/20 bg-slate-950/90 py-2.5 px-4"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3 overflow-hidden">
          <span className="shrink-0 text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-300 border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 rounded">
            Live India Desk
          </span>
          <div className="flex-1 overflow-hidden">
            <div className="ticker-marquee-track flex items-center gap-8 whitespace-nowrap">
              {[...tickerItems, ...tickerItems].map((entry, idx) => (
                <button
                  key={`${entry.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (entry.item) setReaderItem(entry.item);
                  }}
                  className={`text-xs font-mono tabular-nums inline-flex items-center gap-2 ${entry.tone} ${
                    entry.item ? 'hover:underline cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span>{entry.text}</span>
                  <span className="text-slate-600" aria-hidden="true">
                    |
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
        {/* 2. Section Header & Personalization Controls */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-800/90 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-cyan-300 font-medium">
              <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {lang === 'te'
                  ? 'భారతదేశం అంతటా తాజా నవీకరణలు · వ్యక్తిగతీకరించిన ఫీడ్'
                  : 'National & State Information Feed · Official Circulars Separate from News'}
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white headline-balance">
              {lang === 'te'
                ? 'భారతదేశం అంతటా తాజా నవీకరణలు'
                : 'Latest Updates Across India'}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                <span>
                  Prioritising {location.district}, {location.state}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Last updated:{' '}
                {newsFeed?.generated_at
                  ? new Date(newsFeed.generated_at).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Syncing...'}
              </span>
              {newsFeed?.model_used && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">{newsFeed.model_used}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setPersonalizedOnly(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  !personalizedOnly
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                All Updates
              </button>
              <button
                type="button"
                onClick={() => setPersonalizedOnly(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  personalizedOnly
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                For You ({selectedInterests.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCustomize((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                showCustomize
                  ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/90 text-slate-200 hover:border-cyan-400/60'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Interests &amp; Location</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSaved((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                showSaved
                  ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/90 text-slate-200 hover:border-cyan-400/60'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Saved ({savedUpdates.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewAllOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/90 hover:border-cyan-400/60 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
              <span>View All</span>
            </button>

            <button
              type="button"
              disabled={newsRefreshing || newsLoading}
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${newsRefreshing ? 'animate-spin' : ''}`} />
              <span>{newsRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Inline Customize Interests & Location Panel */}
        {showCustomize && (
          <div className="rounded-xl border border-cyan-500/30 bg-slate-900/85 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Personalised Interests &amp; State / District Priority
                </h3>
                <p className="text-xs text-slate-400">
                  Changes save automatically and immediately update your feed below and inside the Citizen Portal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomize(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Done
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-8 space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Select Topics ({selectedInterests.length} active):
                </div>
                <div className="flex flex-wrap gap-2">
                  {allInterestTopics.map((topic) => {
                    const active = selectedInterests.includes(topic);
                    return (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => onToggleInterest(topic)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                            : 'bg-slate-950/80 border-slate-700 text-slate-300 hover:border-cyan-400/50'
                        }`}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="text-xs font-semibold text-slate-200">
                  State &amp; District Priority
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={draftState}
                    onChange={(e) => setDraftState(e.target.value)}
                    placeholder="State"
                    aria-label="Preferred State"
                    className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={draftDistrict}
                    onChange={(e) => setDraftDistrict(e.target.value)}
                    placeholder="District"
                    aria-label="Preferred District"
                    className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATE_DISTRICT_PRESETS.slice(0, 4).map((p) => (
                    <button
                      key={p.district}
                      type="button"
                      onClick={() => {
                        setDraftState(p.state);
                        setDraftDistrict(p.district);
                        onLocationChange(p);
                      }}
                      className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-[11px] text-slate-300 hover:border-cyan-400 cursor-pointer"
                    >
                      {p.district}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onLocationChange({
                        state: draftState.trim() || 'Telangana',
                        district: draftDistrict.trim() || 'Hyderabad',
                      })
                    }
                    className="ml-auto px-2.5 py-0.5 rounded bg-cyan-500 text-slate-950 text-[11px] font-bold cursor-pointer"
                  >
                    Apply Location
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Saved Important Updates Drawer */}
        {showSaved && (
          <div className="rounded-xl border border-cyan-500/30 bg-slate-900/85 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-white">
                Saved Important Updates ({savedUpdates.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowSaved(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            {savedUpdates.length === 0 ? (
              <p className="text-xs text-slate-400">
                No updates saved yet. Click the bookmark button on any card below to save important schemes, deadlines, or news.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {savedUpdates.map((su) => (
                  <div
                    key={su.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5 flex flex-col justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="text-[11px] font-mono text-cyan-300 truncate">
                        {su.category} · {su.source_name}
                      </div>
                      <div className="font-bold text-white line-clamp-2">{su.title}</div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setReaderItem(su)}
                        className="text-cyan-300 font-semibold hover:underline cursor-pointer"
                      >
                        Read More
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSaveUpdate(su)}
                        className="text-rose-400 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Interactive 12-Category Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 snap-x">
          {SHOWCASE_CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`snap-start shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-cyan-500/50 hover:text-white'
                }`}
              >
                {SHORT_CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        {/* Truthful Informational Notice */}
        {newsFeed?.market_notice && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-slate-300">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{newsFeed.market_notice}</span>
          </div>
        )}

        {newsError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
            {newsError}
          </div>
        )}

        {/* 4. Continuously Scrolling Horizontal Update Carousel */}
        <div
          className="space-y-3"
          onMouseEnter={() => setHoverPaused(true)}
          onMouseLeave={() => setHoverPaused(false)}
          onFocus={() => setHoverPaused(true)}
          onBlur={() => setHoverPaused(false)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-400">
              Showing <span className="text-white font-semibold tabular-nums">{filteredUpdates.length}</span>{' '}
              updates · Auto-scrolls smoothly (hover or pause anytime)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-900 text-xs text-slate-200 hover:border-cyan-400 cursor-pointer whitespace-nowrap"
                aria-label={isPaused ? 'Resume automatic carousel scrolling' : 'Pause automatic carousel scrolling'}
              >
                {isPaused || hoverPaused ? (
                  <>
                    <Play className="w-3 h-3 text-cyan-300" />
                    <span>{hoverPaused && !isPaused ? 'Paused on Hover' : 'Resume'}</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 text-cyan-300" />
                    <span>Pause</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => scrollCarouselBy('left')}
                className="p-1.5 rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-400 cursor-pointer"
                aria-label="Scroll updates left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollCarouselBy('right')}
                className="p-1.5 rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-400 cursor-pointer"
                aria-label="Scroll updates right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {newsLoading && !newsFeed ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((skeleton) => (
                <div
                  key={skeleton}
                  className="h-64 rounded-xl border border-slate-800 bg-slate-900/70 animate-pulse"
                />
              ))}
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center space-y-2.5">
              <p className="text-sm text-slate-300">
                No updates currently match{' '}
                {personalizedOnly
                  ? 'your selected interests under this category filter.'
                  : `"${SHORT_CATEGORY_LABELS[activeCategory]}".`}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPersonalizedOnly(false);
                    setActiveCategory('All Updates');
                  }}
                  className="text-xs font-semibold text-cyan-300 hover:underline cursor-pointer"
                >
                  Show All Updates
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomize(true)}
                  className="text-xs font-semibold text-slate-200 hover:underline cursor-pointer"
                >
                  Edit Selected Interests
                </button>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="text-xs font-semibold text-cyan-300 hover:underline cursor-pointer"
                >
                  Refresh Live Feed
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={carouselRef}
                className="flex gap-4 overflow-x-auto pb-2 no-scrollbar"
                role="region"
                aria-label="Scrolling updates carousel"
              >
                {renderedCarouselItems.map(({ item, copyKey }) => {
                  const isSaved = savedIds.has(item.id);
                  return (
                    <article
                      key={copyKey}
                      className="w-[86vw] sm:w-[360px] lg:w-[390px] shrink-0 rounded-xl border border-cyan-500/20 bg-slate-900/80 p-4 flex flex-col justify-between gap-3.5 card-3d hover:border-cyan-400/60"
                    >
                      <div className="space-y-3">
                        <CategoryThumbnailVisual item={item} />

                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
                          <span className="truncate text-cyan-300">{item.category}</span>
                          <span className="shrink-0">
                            {new Date(item.published_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-white leading-snug line-clamp-2">
                          {item.title}
                        </h3>

                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                          {item.summary}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[11px] text-slate-400 truncate max-w-[125px]">
                          {item.source_name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <SpeakButton
                            text={`${item.title}. ${item.summary}`}
                            label="Listen"
                            compact
                            darkSurface
                          />
                          <button
                            type="button"
                            onClick={() => toggleSaveUpdate(item)}
                            aria-label={isSaved ? 'Remove bookmark' : 'Save update'}
                            className={`p-1.5 rounded border cursor-pointer transition-colors ${
                              isSaved
                                ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-300'
                                : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'
                            }`}
                          >
                            {isSaved ? (
                              <BookmarkCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Bookmark className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReaderItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 font-semibold text-xs cursor-pointer whitespace-nowrap"
                          >
                            <span>Read More</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Pagination Indicators */}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {Array.from({ length: totalPages }, (_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => jumpToPage(idx)}
                    aria-label={`Go to carousel page ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      activePageIndex === idx
                        ? 'w-7 bg-cyan-400'
                        : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 5. Dark Glassmorphism Highlights Bento Grid (8 Cards with Side Thumbnails) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-2">
          {/* Card 1: Stock Market Updates */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Stock Market Updates</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('Stock Market and Company Updates')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <BentoSideArtwork kind="market" />
              {stockQuotes.length > 0 ? (
                <div className="flex-1 min-w-0 space-y-1.5 text-[11px] font-mono tabular-nums">
                  {stockQuotes.slice(0, 3).map((q) => (
                    <div
                      key={q.symbol}
                      className="flex items-center justify-between gap-1 rounded bg-slate-950/75 px-2 py-1 border border-slate-800"
                    >
                      <span className="text-slate-300 font-semibold truncate">{q.symbol}</span>
                      <span
                        className={
                          q.direction === 'up'
                            ? 'text-emerald-400 shrink-0'
                            : q.direction === 'down'
                              ? 'text-rose-400 shrink-0'
                              : 'text-slate-300 shrink-0'
                        }
                      >
                        {q.price}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 min-w-0 text-xs text-slate-300 space-y-1">
                  <div className="font-semibold text-amber-300">Live quotes paused</div>
                  <p className="text-[11px] text-slate-400 line-clamp-3">
                    Click Refresh to sync official NSE India market benchmarks.
                  </p>
                </div>
              )}
            </div>
            <a
              href="https://www.nseindia.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1"
            >
              <span>NSE India Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Card 2: Gold & Silver Rates */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Gold &amp; Silver Rates</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('Gold and Silver Prices')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <BentoSideArtwork kind="bullion" />
              {bullionQuotes.length > 0 ? (
                <div className="flex-1 min-w-0 space-y-1.5 text-[11px] font-mono tabular-nums">
                  {bullionQuotes.slice(0, 2).map((q) => (
                    <div
                      key={q.symbol}
                      className="flex items-center justify-between gap-1 rounded bg-slate-950/75 px-2 py-1.5 border border-slate-800"
                    >
                      <span className="text-amber-200 font-semibold truncate">{q.symbol}</span>
                      <span className="text-white font-bold shrink-0">{q.price}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 min-w-0 text-xs text-slate-300 space-y-1">
                  <div className="font-semibold text-amber-300">Bullion feed unavailable</div>
                  <p className="text-[11px] text-slate-400 line-clamp-3">
                    Verified 24K Gold &amp; Silver spot rates load via live grounding.
                  </p>
                </div>
              )}
            </div>
            <a
              href="https://ibjarates.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1"
            >
              <span>IBJA Bullion Reference</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Card 3: National & State Updates */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">National &amp; State Updates</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('National News and Important Announcements')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <BentoSideArtwork kind="national" />
              {topNational ? (
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-white line-clamp-2">{topNational.title}</div>
                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {topNational.summary}
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-xs text-slate-400">
                  Refresh feed to sync today&apos;s verified national and {location.state} updates.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="truncate">{topNational?.source_name || 'PIB / Press Desk'}</span>
              {topNational && (
                <button
                  type="button"
                  onClick={() => setReaderItem(topNational)}
                  className="text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                >
                  Read More
                </button>
              )}
            </div>
          </div>

          {/* Card 4: Government Schemes */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">Government Schemes</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('Government Schemes and New Benefits')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <BentoSideArtwork kind="scheme" />
              {topScheme ? (
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-white line-clamp-2">{topScheme.title}</div>
                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {topScheme.summary}
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-xs text-slate-400">
                  16 verified scholarship and welfare schemes available in Citizen Portal.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="truncate">{topScheme?.department || 'Official Scheme Registry'}</span>
              {topScheme && (
                <button
                  type="button"
                  onClick={() => setReaderItem(topScheme)}
                  className="text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                >
                  Read More
                </button>
              )}
            </div>
          </div>

          {/* Card 5: Important Rule Changes */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Important Rule Changes</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('New Government Rules and Policy Changes')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <BentoSideArtwork kind="rule" />
              {topRule ? (
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-white line-clamp-2">{topRule.title}</div>
                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {topRule.summary}
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-xs text-slate-400">
                  Inspect verified circular amendments inside Schemes Explorer.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="truncate">{topRule?.source_name || 'Verified Circulars'}</span>
              {topRule && (
                <button
                  type="button"
                  onClick={() => setReaderItem(topRule)}
                  className="text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                >
                  Read More
                </button>
              )}
            </div>
          </div>

          {/* Card 6: Healthcare Updates */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Healthcare Updates</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('Healthcare and Public Health Updates')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <BentoSideArtwork kind="health" />
              {topHealth ? (
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-white line-clamp-2">{topHealth.title}</div>
                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {topHealth.summary}
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-xs text-slate-400">
                  Public health schemes, Medical stipends, and UDID guidelines.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="truncate">{topHealth?.source_name || 'Health & Family Welfare'}</span>
              {topHealth && (
                <button
                  type="button"
                  onClick={() => setReaderItem(topHealth)}
                  className="text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                >
                  Read More
                </button>
              )}
            </div>
          </div>

          {/* Card 7: Application Deadlines */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-bold text-white">Application Deadlines</h3>
              </div>
              <button
                type="button"
                onClick={() => openCategoryViewAll('Application Deadlines and Important Dates')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <BentoSideArtwork kind="deadline" />
              {topDeadline ? (
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-white line-clamp-2">{topDeadline.title}</div>
                  <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                    {topDeadline.summary}
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-xs text-slate-400">
                  Inspect official cutoff dates across all 16 verified schemes.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-orange-300 tabular-nums">
              <span>{topDeadline?.deadline_date ? `Cutoff: ${topDeadline.deadline_date}` : 'Official Registry Dates'}</span>
              {topDeadline && (
                <button
                  type="button"
                  onClick={() => setReaderItem(topDeadline)}
                  className="text-cyan-300 hover:underline cursor-pointer shrink-0 font-sans font-semibold"
                >
                  Read More
                </button>
              )}
            </div>
          </div>

          {/* Card 8: Helpful Citizen Tip & Guidance */}
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/75 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Citizen Guidance</h3>
              </div>
              <button
                type="button"
                onClick={() => onQuickAccess('jansetu')}
                className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span>Open JanSetu</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-3">
              <BentoSideArtwork kind="guidance" />
              <p className="flex-1 text-[11px] text-slate-300 leading-relaxed line-clamp-4">
                Use JanSetu AI &amp; FormSathi Readiness Check to cross-verify Aadhaar NPCI seeding and exact clause citations before applying.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Bilingual Guidance · English &amp; తెలుగు
            </div>
          </div>
        </div>
      </div>

      {/* Article Detail Reader Modal */}
      {readerItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={readerItem.title}
        >
          <div className="max-w-lg w-full rounded-xl border border-cyan-500/35 bg-slate-900 p-6 space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-cyan-300">
                  {readerItem.is_gov_notification ? 'Official Government Notification' : 'News & Sector Update'} ·{' '}
                  {readerItem.category}
                </div>
                <h3 className="text-lg font-bold text-white leading-snug">{readerItem.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setReaderItem(null)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close update detail"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed">{readerItem.summary}</p>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-xs font-mono text-slate-300 tabular-nums">
              <div>Source: {readerItem.source_name}</div>
              {readerItem.department && <div>Department: {readerItem.department}</div>}
              <div>
                Published:{' '}
                {new Date(readerItem.published_at).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <SpeakButton
                  text={`${readerItem.title}. ${readerItem.summary}`}
                  label="Listen"
                  darkSurface
                />
                <button
                  type="button"
                  onClick={() => toggleSaveUpdate(readerItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs font-semibold text-slate-200 hover:border-cyan-400 cursor-pointer"
                >
                  {savedIds.has(readerItem.id) ? (
                    <>
                      <BookmarkCheck className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save Update</span>
                    </>
                  )}
                </button>
              </div>

              <a
                href={readerItem.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
              >
                <span>Open Official / Source Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* View All Updates Gallery Modal */}
      {viewAllOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="All National and Official Updates"
        >
          <div className="max-w-5xl w-full max-h-[88vh] rounded-xl border border-cyan-500/35 bg-slate-900 flex flex-col overflow-hidden shadow-2xl text-slate-100">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  All Updates — {SHORT_CATEGORY_LABELS[activeCategory]} ({filteredUpdates.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Official Government Notifications and verified updates across India.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewAllOpen(false)}
                className="p-1.5 rounded text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close all updates modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-2.5 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto">
              {SHOWCASE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    activeCategory === cat
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-cyan-400/50'
                  }`}
                >
                  {SHORT_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUpdates.map((item) => (
                <article
                  key={`modal-${item.id}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <CategoryThumbnailVisual item={item} />
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
                      <span className="truncate text-cyan-300">{item.category}</span>
                      <span>{new Date(item.published_at).toLocaleDateString('en-IN')}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white">{item.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                    <span className="text-[11px] text-slate-400 truncate">{item.source_name}</span>
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-300 font-semibold hover:underline shrink-0"
                    >
                      <span>Read More</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
