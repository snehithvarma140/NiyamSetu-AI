import React, { useCallback, useEffect, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';

interface DiscoveredCenter {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  mapsUri?: string;
}

interface MapsGroundingSource {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

interface MapsGroundingResponse {
  answer: string;
  mapSources: MapsGroundingSource[];
}

const DEFAULT_VIEWPORT_CENTER = { lat: 17.385, lng: 78.4867 };

const QUICK_SEARCH_PRESETS: Array<{ label: string; labelTe: string; query: string }> = [
  {
    label: 'MeeSeva Centers',
    labelTe: 'మీసేవా కేంద్రాలు',
    query: 'MeeSeva citizen service center',
  },
  {
    label: 'Social Welfare Offices',
    labelTe: 'సాంఘిక సంక్షేమ కార్యాలయాలు',
    query: 'District Social Welfare Office',
  },
  {
    label: 'Tahsildar / MRO Offices',
    labelTe: 'తహసీల్దార్ కార్యాలయాలు',
    query: 'Tahsildar Office Revenue',
  },
  {
    label: 'ePass Help Desks',
    labelTe: 'ePass సహాయ కేంద్రాలు',
    query: 'ePass scholarship help center',
  },
  {
    label: 'Tribal Welfare ITDA',
    labelTe: 'గిరిజన సంక్షేమ ITDA',
    query: 'Tribal Welfare Office ITDA',
  },
  {
    label: 'CSC Digital Seva',
    labelTe: 'డిజిటల్ సేవా CSC',
    query: 'Common Service Centre CSC Digital Seva',
  },
  {
    label: 'Medical Board / UDID',
    labelTe: 'జిల్లా మెడికల్ బోర్డు (UDID)',
    query: 'District Hospital Medical Board UDID',
  },
  {
    label: 'Hospitals & Emergency Care',
    labelTe: 'ఆసుపత్రులు & అత్యవసర సేవలు',
    query: 'Government General Hospital Emergency Trauma Care',
  },
  {
    label: 'Banks & DBT Desks',
    labelTe: 'బ్యాంకులు & DBT సేవలు',
    query: 'State Bank Lead Bank ATM DBT branch',
  },
  {
    label: 'University Nodal Cells',
    labelTe: 'విశ్వవిద్యాలయ నోడల్ సెల్',
    query: 'University Scholarship Nodal Cell Administration',
  },
];

const MAPS_ADVISOR_PRESETS: Array<{ label: string; query: string }> = [
  {
    label: 'Income & Caste Verification',
    query: 'Find MeeSeva centers or Tahsildar offices for income and caste certificate verification',
  },
  {
    label: 'UDID Disability Assessment',
    query: 'Locate District Government Hospital Medical Board offices issuing UDID disability certificates',
  },
  {
    label: 'Aadhaar e-KYC Biometric Desk',
    query: 'Find Aadhaar Seva Kendra or post office centers for Aadhaar mobile linking and biometric eKYC',
  },
  {
    label: 'Zila Sainik Board (DEF-15)',
    query: 'Locate District Sainik Welfare Office for Armed Forces and Police Wards scholarship attestation',
  },
  {
    label: 'Agricultural Revenue & Rythu Desk',
    query: 'Find Mandal Revenue Office or Rythu Vedika center for land passbook verification',
  },
  {
    label: 'State Sports Authority Office',
    query: 'Find District Sports Authority or Sports School verification center for Khelo India merit grading',
  },
];

const AREA_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Near My GPS', value: '' },
  { label: 'Hyderabad, Telangana', value: 'Hyderabad, Telangana' },
  { label: 'Secunderabad, Telangana', value: 'Secunderabad, Telangana' },
  { label: 'Warangal, Telangana', value: 'Warangal, Telangana' },
  { label: 'Vijayawada, Andhra Pradesh', value: 'Vijayawada, Andhra Pradesh' },
  { label: 'Visakhapatnam, Andhra Pradesh', value: 'Visakhapatnam, Andhra Pradesh' },
  { label: 'Bengaluru, Karnataka', value: 'Bengaluru, Karnataka' },
  { label: 'Chennai, Tamil Nadu', value: 'Chennai, Tamil Nadu' },
  { label: 'Pune, Maharashtra', value: 'Pune, Maharashtra' },
  { label: 'New Delhi, Delhi', value: 'New Delhi, Delhi' },
];

const PlaceMarkerItem: React.FC<{
  place: DiscoveredCenter;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCloseInfo: () => void;
}> = ({ place, isSelected, onSelect, onCloseInfo }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={place.location}
        title={place.name}
        onClick={() => onSelect(place.id)}
      >
        <Pin
          background={isSelected ? '#0f766e' : '#0891b2'}
          borderColor={isSelected ? '#134e4a' : '#164e63'}
          glyphColor="#ffffff"
          scale={isSelected ? 1.25 : 1}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onCloseInfo}>
          <div className="space-y-1.5 text-slate-900 p-0.5">
            <div className="text-sm font-bold leading-snug">{place.name}</div>
            {place.address && (
              <div className="text-xs text-slate-600 leading-relaxed">{place.address}</div>
            )}
            {typeof place.rating === 'number' && (
              <div className="text-xs font-medium text-slate-700 tabular-nums">
                Rating: {place.rating.toFixed(1)}
                {typeof place.ratingCount === 'number' ? ` (${place.ratingCount})` : ''}
              </div>
            )}
            {place.mapsUri && (
              <a
                href={place.mapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline"
              >
                <span>Open in Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const CitizenHelpCentersInner: React.FC = () => {
  const { lang, token, user, setMapsQuotaExceeded } = useApp();
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const apiStatus = useApiLoadingStatus();
  const isMapAuthOrLoadError =
    apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED;

  const userAreaDefault = [user?.district, user?.state].filter(Boolean).join(', ') || 'Hyderabad, Telangana';
  const [searchText, setSearchText] = useState('MeeSeva citizen service center');
  const [areaText, setAreaText] = useState(userAreaDefault);
  const [places, setPlaces] = useState<DiscoveredCenter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const [groundingQuery, setGroundingQuery] = useState(
    'Find MeeSeva centers or District Social Welfare offices for income & caste certificate verification'
  );
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [groundingResult, setGroundingResult] = useState<MapsGroundingResponse | null>(null);

  const handleQuotaCheck = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT') ||
        msg.includes('QuotaExceeded') ||
        msg.includes('429')
      ) {
        setMapsQuotaExceeded(true);
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    },
    [setMapsQuotaExceeded]
  );

  const runPlacesSearch = useCallback(
    async (
      queryText: string,
      centerBias?: { lat: number; lng: number },
      explicitArea?: string
    ) => {
      if (!placesLib) return;
      const trimmed = queryText.trim();
      const targetArea = (explicitArea !== undefined ? explicitArea : areaText).trim();
      if (!trimmed && !targetArea) return;
      setSearchingPlaces(true);
      setPlacesError(null);

      try {
        const combinedQuery = targetArea
          ? `${trimmed || 'Citizen help center'} in ${targetArea}`
          : trimmed;
        const shouldUseBias = Boolean(centerBias || (!targetArea && userCoords) || (!targetArea && !explicitArea));
        const bias = centerBias || userCoords || DEFAULT_VIEWPORT_CENTER;

        const result = await placesLib.Place.searchByText({
          textQuery: combinedQuery,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'googleMapsURI',
          ],
          ...(shouldUseBias
            ? {
                locationBias: {
                  center: bias,
                  radius: 18000,
                },
              }
            : {}),
          maxResultCount: 10,
          language: lang === 'te' ? 'te' : 'en',
          region: 'IN',
        });

        const rawPlaces = (result?.places ?? []) as Array<{
          id?: string;
          displayName?: string;
          formattedAddress?: string;
          location?: { lat: () => number; lng: () => number };
          rating?: number;
          userRatingCount?: number;
          googleMapsURI?: string;
        }>;
        const mapped: DiscoveredCenter[] = rawPlaces
          .filter((p) => Boolean(p.location))
          .map((p) => {
            const loc = p.location!;
            return {
              id: p.id || `${loc.lat()}-${loc.lng()}`,
              name: p.displayName || 'Citizen Help Center',
              address: p.formattedAddress || '',
              location: { lat: loc.lat(), lng: loc.lng() },
              rating: typeof p.rating === 'number' ? p.rating : undefined,
              ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
              mapsUri: p.googleMapsURI || undefined,
            };
          });

        setPlaces(mapped);
        if (mapped[0]) {
          setSelectedId(mapped[0].id);
          map?.panTo(mapped[0].location);
          map?.setZoom(13);
        } else {
          setSelectedId(null);
        }
      } catch (err) {
        handleQuotaCheck(err);
        setPlacesError(
          err instanceof Error
            ? err.message
            : 'Unable to query nearby service centers from Google Places.'
        );
      } finally {
        setSearchingPlaces(false);
      }
    },
    [placesLib, userCoords, areaText, lang, map, handleQuotaCheck]
  );

  useEffect(() => {
    if (placesLib && places.length === 0 && !searchingPlaces && !placesError) {
      void runPlacesSearch('MeeSeva citizen service center', undefined, areaText);
    }
  }, [placesLib]);

  const requestCurrentLocation = () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setLocationNotice('Current location requires HTTPS. Please choose a preset city or enter your area below.');
      return;
    }
    if (!navigator.geolocation) {
      setLocationNotice('Browser geolocation is unavailable.');
      return;
    }
    setLocating(true);
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setLocating(false);
        setAreaText('');
        setLocationNotice(
          `GPS location active (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) — searching nearest centers.`
        );
        map?.panTo(coords);
        map?.setZoom(13);
        void runPlacesSearch(searchText, coords, '');
      },
      (geoErr) => {
        setLocating(false);
        if (geoErr.code === 1) {
          setLocationNotice(
            'Location permission declined. Allow location access in browser settings or select an area manually.'
          );
        } else if (geoErr.code === 3) {
          setLocationNotice(
            'Location request timed out. Try again or select your city/district manually.'
          );
        } else {
          setLocationNotice(
            geoErr.message || 'Unable to determine current position. Please select an area manually.'
          );
        }
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const askMapsGroundedGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = groundingQuery.trim();
    if (!trimmed) return;
    setGroundingLoading(true);
    setGroundingError(null);
    try {
      const res = await apiRequest<MapsGroundingResponse>('/jansetu/maps-grounded', {
        method: 'POST',
        token,
        body: {
          query: trimmed,
          lang,
          ...(userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : {}),
        },
      });
      setGroundingResult(res);
    } catch (err) {
      handleQuotaCheck(err);
      setGroundingError(
        err instanceof Error ? err.message : 'Unable to fetch Maps-grounded recommendations.'
      );
    } finally {
      setGroundingLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            {lang === 'te'
              ? 'సమీప సహాయ కేంద్రాలు & సేవా మ్యాప్'
              : 'Citizen Help Centers & Service Map'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Locate live MeeSeva kiosks, Hospitals, Banks &amp; DBT Desks, District Welfare Offices,
            and document verification centers via Google Places API (New) and Gemini Maps Grounding.
          </p>
        </div>

        <button
          type="button"
          onClick={requestCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 cursor-pointer self-start whitespace-nowrap"
        >
          {locating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Navigation className="w-3.5 h-3.5 text-teal-800 dark:text-cyan-300" />
          )}
          <span>{locating ? 'Locating...' : 'Use My Location'}</span>
        </button>
      </div>

      {locationNotice && (
        <div className="text-xs text-slate-600 dark:text-slate-400 font-mono">{locationNotice}</div>
      )}

      {isMapAuthOrLoadError && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-bold">Google Maps Failed to Load for This Domain</div>
          <p>
            Verify that Maps JavaScript API and Places API (New) are enabled with billing active in
            Google Cloud Console, and that your API key HTTP referrer restrictions include this
            website domain. You can still use the AI Location Advisor below for Maps-grounded links.
          </p>
        </div>
      )}

      {/* Area Selector + Service Search Bar & Presets */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runPlacesSearch(searchText, undefined, areaText);
          }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-2.5"
        >
          <div className="lg:col-span-5 relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Service type: MeeSeva, Tahsildar, Social Welfare, UDID..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              aria-label="Search nearby citizen service type"
            />
          </div>
          <div className="lg:col-span-5 flex gap-2">
            <input
              type="text"
              value={areaText}
              onChange={(e) => setAreaText(e.target.value)}
              placeholder="Area, District, Locality, or PIN (e.g. Ameerpet, 500016)"
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
              aria-label="Select or search area, city, or PIN code"
            />
            <select
              value={AREA_PRESETS.some((p) => p.value === areaText) ? areaText : '__custom__'}
              onChange={(e) => {
                if (e.target.value === '__custom__') return;
                setAreaText(e.target.value);
                void runPlacesSearch(searchText, e.target.value === '' ? userCoords || undefined : undefined, e.target.value);
              }}
              aria-label="Quick select area or district"
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[165px]"
            >
              <option value="__custom__">Select Area...</option>
              {AREA_PRESETS.map((ap) => (
                <option key={ap.label} value={ap.value}>
                  {ap.label}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={searchingPlaces || !placesLib}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              {searchingPlaces ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>{searchingPlaces ? 'Locating...' : 'Locate Area'}</span>
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1">
            Service Type:
          </span>
          {QUICK_SEARCH_PRESETS.map((preset) => (
            <button
              key={preset.query}
              type="button"
              disabled={searchingPlaces || !placesLib}
              onClick={() => {
                setSearchText(preset.query);
                void runPlacesSearch(preset.query, undefined, areaText);
              }}
              className={`px-3 py-1.5 rounded border text-xs font-medium cursor-pointer transition-colors ${
                searchText === preset.query
                  ? 'border-teal-700 dark:border-cyan-400 bg-teal-50 dark:bg-cyan-950/30 text-teal-900 dark:text-cyan-200'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400'
              }`}
            >
              {lang === 'te' ? preset.labelTe : preset.label}
            </button>
          ))}
        </div>

        {placesError && (
          <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
            {placesError}
          </div>
        )}
      </section>

      {/* Map + Live Results Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-900 h-[420px]">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={DEFAULT_VIEWPORT_CENTER}
            defaultZoom={12}
            gestureHandling="greedy"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            {places.map((p) => (
              <PlaceMarkerItem
                key={p.id}
                place={p}
                isSelected={selectedId === p.id}
                onSelect={(id) => {
                  setSelectedId(id);
                  map?.panTo(p.location);
                }}
                onCloseInfo={() => setSelectedId(null)}
              />
            ))}
          </GoogleMap>
        </div>

        <aside className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col h-[420px]">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5 mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Live Google Places Results
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {places.length} found
            </span>
          </div>

          {places.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <Compass className="w-6 h-6 text-slate-400" />
              <p>
                {searchingPlaces
                  ? 'Loading verified centers from Google Places API (New)...'
                  : 'Search above to discover verified service centers on the map.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {places.map((p) => {
                const active = selectedId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedId(p.id);
                      map?.panTo(p.location);
                      map?.setZoom(14);
                    }}
                    className={`rounded-md border p-3 cursor-pointer transition-colors space-y-1 ${
                      active
                        ? 'border-teal-700 dark:border-cyan-400 bg-teal-50/60 dark:bg-cyan-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-teal-800 dark:text-cyan-300" />
                        <span>{p.name}</span>
                      </div>
                      {typeof p.rating === 'number' && (
                        <span className="text-xs font-mono tabular-nums text-amber-700 dark:text-amber-300 shrink-0">
                          {p.rating.toFixed(1)}★
                        </span>
                      )}
                    </div>
                    {p.address && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {p.address}
                      </p>
                    )}
                    {p.mapsUri && (
                      <a
                        href={p.mapsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-cyan-300 hover:underline pt-0.5"
                      >
                        <span>Directions / Details</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Grounding with Google Maps in Gemini API */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-800 dark:text-cyan-300" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              AI Location Advisor (Grounded with Google Maps)
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Ask Gemini for nearby offices, document attestation points, or regional scholarship
            desks. All place links come directly from Google Maps groundingChunks.
          </p>
        </div>

        <form onSubmit={askMapsGroundedGemini} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={groundingQuery}
            onChange={(e) => setGroundingQuery(e.target.value)}
            placeholder="Ask where to verify income certificates or visit a MeeSeva office..."
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100"
            aria-label="Gemini Maps Grounding Query"
          />
          <button
            type="submit"
            disabled={groundingLoading || !groundingQuery.trim()}
            className="px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            {groundingLoading ? 'Querying Maps...' : 'Ask Maps Advisor'}
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {MAPS_ADVISOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={groundingLoading}
              onClick={() => setGroundingQuery(preset.query)}
              className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400 transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {groundingError && (
          <div className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
            {groundingError}
          </div>
        )}

        {groundingResult && (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line">
              {groundingResult.answer}
            </div>

            {groundingResult.mapSources.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Verified Google Maps Places Cited:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groundingResult.mapSources.map((src) => (
                    <div
                      key={src.uri}
                      className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1.5"
                    >
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-800 dark:text-cyan-300 hover:underline"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {src.reviewSnippets.length > 0 && (
                        <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                          {src.reviewSnippets.slice(0, 2).map((snip, idx) => (
                            <li key={idx} className="italic">
                              “{snip}”
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export const HelpCentersMapPage: React.FC = () => {
  const { lang } = useApp();
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [loadingKey, setLoadingKey] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (mapsApiKey) return;
    let mounted = true;
    (async () => {
      try {
        const res = await apiRequest<{ apiKey: string }>('/maps/config');
        if (mounted && res.apiKey) {
          setMapsApiKey(res.apiKey);
          setMapsConfigError(null);
        }
      } catch (err) {
        if (mounted) {
          setMapsConfigError(
            err instanceof Error ? err.message : 'Unable to reach backend /api/maps/config.'
          );
        }
      } finally {
        if (mounted) setLoadingKey(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mapsApiKey]);

  const fetchMapsConfig = async () => {
    setLoadingKey(true);
    setMapsConfigError(null);
    try {
      const res = await apiRequest<{ apiKey: string }>('/maps/config');
      if (res.apiKey) {
        setMapsApiKey(res.apiKey);
      }
    } catch (err) {
      setMapsConfigError(
        err instanceof Error ? err.message : 'Unable to load Google Maps configuration.'
      );
    } finally {
      setLoadingKey(false);
    }
  };

  if (loadingKey) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Initializing Google Maps Platform services...
      </div>
    );
  }

  if (!mapsApiKey) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-6 space-y-3">
        <h2 className="font-display text-lg font-bold text-amber-900 dark:text-amber-200">
          Google Maps API Key Not Loaded
        </h2>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Ensure VITE_GOOGLE_MAPS_API_KEY (frontend) or GOOGLE_MAPS_API_KEY (backend) is configured
          with Maps JavaScript API and Places API (New) enabled to render interactive service center
          maps.
        </p>
        {mapsConfigError && (
          <p className="text-xs font-mono text-amber-900 dark:text-amber-200">{mapsConfigError}</p>
        )}
        <button
          type="button"
          onClick={() => void fetchMapsConfig()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold cursor-pointer"
        >
          Retry Loading Google Maps
        </button>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={mapsApiKey}
      libraries={['marker', 'places']}
      language={lang === 'te' ? 'te' : 'en'}
      region="IN"
    >
      <CitizenHelpCentersInner />
    </APIProvider>
  );
};
