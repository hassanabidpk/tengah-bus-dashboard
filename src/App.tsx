import { useEffect, useState, useCallback, useRef } from 'react';
import { MapPin, RefreshCw, Sun, Moon, Sparkles, AlertTriangle, Footprints } from 'lucide-react';

interface BusStop {
  id: string;
  name: string;
  roadName: string;
  type: 'morning' | 'evening' | 'both';
  guaranteed: string[];
  walkTime: number;
}

const STOPS: BusStop[] = [
  { id: '40381', name: 'Blk 111', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['870', '871', '992'], walkTime: 3 },
  { id: '40389', name: 'Tengah CC', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['452', '674', '871', '992'], walkTime: 5 },
  { id: '40481', name: 'Bef Blk 113', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['872', '831W'], walkTime: 4 },
  { id: '40489', name: 'Opp Blk 113', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['872', '831G'], walkTime: 4 },
  { id: '03129', name: 'UIC Bldg', roadName: 'Shenton Way', type: 'evening', guaranteed: ['674'], walkTime: 2 },
  { id: '42151', name: 'Beauty World Stn Exit C', roadName: 'Jln Jurong Kechil', type: 'evening', guaranteed: ['462'], walkTime: 6 },
  { id: '01519', name: 'The Gateway', roadName: 'Beach Rd', type: 'evening', guaranteed: ['57', '100', '107'], walkTime: 2 },
  { id: '28359', name: 'Blk 350', roadName: 'Boon Lay Way', type: 'evening', guaranteed: ['872'], walkTime: 3 },
  { id: '43759', name: 'Blk 443D (Outside Tengah)', roadName: 'Bt Batok Rd', type: 'both', guaranteed: ['180', '160', '984'], walkTime: 8 },
  { id: '43751', name: 'Opp Blk 443D (Outside Tengah)', roadName: 'Bt Batok Rd', type: 'both', guaranteed: ['180', '160', '984'], walkTime: 8 },
];

interface Timing {
  mins: number | 'Arr';
  load?: string; // SEA, SDA, LSD
  type?: 'SD' | 'DD' | 'BD' | string;
}

interface BusTimingInfo {
  busNo: string;
  timings: Timing[];
}

interface StopData {
  stopCode: string;
  name: string;
  roadName: string;
  source: string;
  buses: BusTimingInfo[];
}

// Vintage London Bus Inspired SVGs
const DoubleDeckerIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} strokeLinecap="round" strokeLinejoin="round">
    {/* Body */}
    <path d="M2.5 16V4.5A1.5 1.5 0 0 1 4 3h15a2 2 0 0 1 2 2v11h1.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5z" />
    {/* Mid divider */}
    <path d="M2 10h19" />
    {/* Upper Windows */}
    <path d="M5 5.5h2.5v2.5H5zM9.5 5.5h3v2.5h-3zM14.5 5.5h3v2.5h-3z" />
    {/* Lower Windows */}
    <path d="M9.5 12h3v2.5h-3zM14.5 12h3v2.5h-3z" />
    {/* Open platform / door at the back (left side is back) */}
    <path d="M4 12h3v4H4z" />
    {/* Wheels */}
    <circle cx="7.5" cy="18.5" r="1.5" />
    <circle cx="16.5" cy="18.5" r="1.5" />
  </svg>
);

const BendyBusIcon = ({ className = "w-4 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="8" width="10" height="8" rx="1" />
    <rect x="16" y="8" width="10" height="8" rx="1" />
    <path d="M12 9l2-1v10l-2-1M12 11l2-1v4l-2-1M14 8h2M14 16h2" />
    <circle cx="5" cy="18" r="1.5" />
    <circle cx="21" cy="18" r="1.5" />
  </svg>
);

export default function App() {
  const [data, setData] = useState<Record<string, StopData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'morning' | 'evening'>('all');
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'info'>('board');

  // Theme state
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        return true;
      }
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  }, [isDark]);

  // Auto-set tab based on SGT time of day
  useEffect(() => {
    const date = new Date();
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const sgTime = new Date(utc + (3600000 * 8));
    const hours = sgTime.getHours();

    if (hours >= 6 && hours < 12) {
      setActiveTab('morning');
    } else if (hours >= 16 && hours < 21) {
      setActiveTab('evening');
    } else {
      setActiveTab('all');
    }
  }, []);

  const fetchStopData = useCallback(async (stop: BusStop): Promise<StopData | null> => {
    try {
      const response = await fetch(`/api/bus-arrival?stopCode=${stop.id}`);
      if (!response.ok) throw new Error('API request failed');
      const payload = await response.json();
      
      const source = payload.source;
      const apiData = payload.data;
      const busDataMap: Record<string, Timing[]> = {};

      if (source === 'LTA') {
        const services = apiData.Services || [];
        services.forEach((s: any) => {
          const busNo = s.ServiceNo;
          const timings: Timing[] = [];
          
          const now = new Date();
          const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
          const sgtNow = new Date(utcNow + (3600000 * 8));

          ['NextBus', 'NextBus2', 'NextBus3'].forEach((key) => {
            const arrivalStr = s[key]?.EstimatedArrival;
            const load = s[key]?.Load; // SEA, SDA, LSD
            const type = s[key]?.Type; // SD, DD, BD
            if (arrivalStr) {
              const arrivalDt = new Date(arrivalStr);
              const diffMins = Math.floor((arrivalDt.getTime() - sgtNow.getTime()) / 60000);
              timings.push({ mins: diffMins <= 0 ? 'Arr' : diffMins, load, type });
            }
          });
          busDataMap[busNo] = timings;
        });
      } else {
        // ArriveLah parsing
        const services = apiData.services || [];
        services.forEach((s: any) => {
          const busNo = s.no;
          const timings: Timing[] = [];
          ['next', 'next2', 'next3'].forEach((key) => {
            if (s[key] && typeof s[key].duration_ms === 'number') {
              const mins = Math.floor(s[key].duration_ms / 60000);
              const load = s[key].load; 
              const type = s[key].type; // SD, DD, BD
              timings.push({ mins: mins <= 0 ? 'Arr' : mins, load, type });
            }
          });
          busDataMap[busNo] = timings;
        });
      }
      const allBusNumbers = Array.from(new Set([...stop.guaranteed, ...Object.keys(busDataMap)])).sort();
      
      const buses: BusTimingInfo[] = allBusNumbers
        .filter((busNo) => {
          if (['03129', '28359', '43759', '43751'].includes(stop.id)) return stop.guaranteed.includes(busNo);
          return true;
        })
        .map((busNo) => ({
          busNo,
          timings: busDataMap[busNo] || [],
        }));

      return {
        stopCode: stop.id,
        name: stop.name,
        roadName: stop.roadName,
        source,
        buses,
      };
    } catch (e) {
      console.error(`Failed to fetch ${stop.name}:`, e);
      return null;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.all(STOPS.map(stop => fetchStopData(stop)));
    const newData: Record<string, StopData> = {};
    results.forEach((res, index) => {
      if (res) {
        newData[STOPS[index].id] = res;
      }
    });
    setData(newData);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [fetchStopData]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isAutoRefresh) {
      timerRef.current = setInterval(() => {
        refreshAll();
      }, 30000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAutoRefresh, refreshAll]);

  const filteredStops = STOPS.filter((stop) => {
    if (activeTab === 'all') return true;
    return stop.type === activeTab || stop.type === 'both';
  });

  const visibleStopData = filteredStops
    .map((stop) => data[stop.id])
    .filter((stopData): stopData is StopData => Boolean(stopData));

  const liveStopCount = visibleStopData.length;
  const liveServiceCount = visibleStopData.reduce((total, stopData) => total + stopData.buses.length, 0);

  const nextDeparture = visibleStopData.reduce<{
    mins: number;
    busNo: string;
    stopName: string;
  } | null>((best, stopData) => {
    stopData.buses.forEach((bus) => {
      const firstTiming = bus.timings[0];
      if (!firstTiming) return;

      const mins = firstTiming.mins === 'Arr' ? 0 : firstTiming.mins;
      if (!best || mins < best.mins) {
        best = {
          mins,
          busNo: bus.busNo,
          stopName: stopData.name,
        };
      }
    });

    return best;
  }, null);

  const sourceSummary = visibleStopData.length
    ? Array.from(new Set(visibleStopData.map((stopData) => stopData.source))).join(' · ')
    : 'Waiting for live feeds';

  const modeMeta = {
    all: {
      eyebrow: 'System overview',
      title: 'All stops at a glance',
      description: 'A calm, at-a-glance overview of every saved stop and the live services currently reporting.',
      status: 'Broadcast mode',
    },
    morning: {
      eyebrow: 'Morning wave',
      title: 'Plan the commute before you leave',
      description: 'Focus on the routes that matter for the morning run toward MRT links and the fastest feed in each stop.',
      status: 'Peak flow',
    },
    evening: {
      eyebrow: 'Evening return',
      title: 'Keep the ride home in view',
      description: 'Track the return pattern back to Tengah with enough buffer to make the right feeder without rushing.',
      status: 'Homebound',
    },
  }[activeTab];

  const routeMessage =
    activeTab === 'morning'
      ? '🌅 Morning Commute is active! Take Bus 452 to Beauty World MRT, or take Bus 872 to Chinese Garden MRT.'
      : activeTab === 'evening'
        ? '🌇 Evening Return is active! Board Bus 674 from UIC Building, or take Bus 462 from Beauty World Stn Exit C back to Tengah.'
        : '🚇 Ready for your commute? Toggle Morning or Evening modes to focus on specific routes, stops, and timings.';

  const liveStatusLabel = loading ? 'Syncing live feeds' : refreshing ? 'Refreshing network' : isAutoRefresh ? 'Auto-refresh live' : 'Manual refresh';
  const nextDepartureLabel = nextDeparture ? (nextDeparture.mins === 0 ? 'Arr' : `${nextDeparture.mins}m`) : '—';
  const lastUpdatedLabel = lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Awaiting first refresh';

  const stopAccentClass = (stopType: BusStop['type']) => {
    if (stopType === 'morning') return 'from-amber-400 via-orange-400 to-brand-500';
    if (stopType === 'evening') return 'from-indigo-400 via-violet-400 to-brand-500';
    return 'from-cyan-400 via-sky-400 to-emerald-400';
  };

  const stopTypeLabel = (stopType: BusStop['type']) => {
    if (stopType === 'morning') return 'Morning route';
    if (stopType === 'evening') return 'Evening route';
    return 'Shared stop';
  };

  return (
    <div className="min-h-screen bg-white text-slate-950 dark:bg-[#090a0b] dark:text-slate-100">
      <div className="relative mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-8">
        <header className="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-slate-900/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-200 shadow-lg shadow-brand-500/10 backdrop-blur sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Tengah Commute Tracker
            </div>

            <div className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
              <h1 className="text-2xl font-black leading-[1.05] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-4xl md:text-5xl">
                Plantation Cres Live Board
              </h1>
              <p className="max-w-2xl text-[13px] leading-5 text-slate-600 dark:text-slate-400 sm:text-base sm:leading-relaxed">
                A polished, live bus dashboard for Tengah residents — tuned for quick morning decisions, evening returns, and everything in between.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <div className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/80 p-1.5 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 sm:flex sm:w-auto sm:flex-wrap sm:gap-2 sm:p-2">
              <button
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                className={`min-h-11 rounded-xl px-3 py-2 text-xs font-bold transition sm:min-h-0 sm:text-sm sm:font-semibold ${
                  isAutoRefresh
                    ? 'border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400 dark:hover:bg-slate-900'
                }`}
              >
                {isAutoRefresh ? 'Auto On' : 'Auto Off'}
              </button>

              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:hover:bg-slate-900 sm:min-h-0 sm:min-w-0"
                title="Refresh now"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-brand-500 dark:text-brand-400' : ''}`} />
              </button>

              <button
                onClick={() => setIsDark(!isDark)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:hover:bg-slate-900 sm:min-h-0 sm:min-w-0"
                title="Toggle dark mode"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 sm:justify-end sm:gap-2 sm:text-xs">
              <span className="rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 font-medium shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
                {liveStatusLabel}
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 font-mono shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
                {lastUpdatedLabel}
              </span>
            </div>
          </div>
        </header>

        <section className="mb-4 flex flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
              Pages
            </p>
            <h2 className="mt-1 text-base font-black leading-tight tracking-[-0.02em] text-slate-950 dark:text-white sm:text-base">
              {viewMode === 'board' ? 'Live bus board' : 'Stops and information'}
            </h2>
          </div>

          <div className="grid w-full grid-cols-2 gap-1 rounded-3xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950 sm:inline-flex sm:w-auto sm:grid-cols-none sm:rounded-full">
            <button
              type="button"
              aria-pressed={viewMode === 'board'}
              onClick={() => setViewMode('board')}
              className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-black transition sm:min-h-0 sm:rounded-full sm:px-3 sm:py-1.5 sm:font-bold ${
                viewMode === 'board'
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Board
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'info'}
              onClick={() => setViewMode('info')}
              className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-black transition sm:min-h-0 sm:rounded-full sm:px-3 sm:py-1.5 sm:font-bold ${
                viewMode === 'info'
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Info
            </button>
          </div>
        </section>

        <section className={viewMode === 'info' ? 'mb-5 grid gap-3 sm:gap-4 lg:grid-cols-[1.05fr_0.95fr]' : 'hidden'}>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
              Info page
            </p>
            <h3 className="mt-2 text-xl font-black leading-tight tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">
              Live stops and service signals
            </h3>
            <p className="mt-2 max-w-xl text-[13px] leading-5 text-slate-600 dark:text-slate-400 sm:text-sm sm:leading-6">
              {modeMeta.description}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 sm:mt-4 sm:gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium dark:border-slate-800 dark:bg-slate-950">
                {sourceSummary}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium dark:border-slate-800 dark:bg-slate-950">
                {lastUpdatedLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium dark:border-slate-800 dark:bg-slate-950">
                {viewMode === 'info' ? 'Info page active' : 'Board page active'}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950 sm:mt-5 sm:p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400 sm:text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Smart route guidance
              </div>
              <p className="mt-2 text-[13px] leading-5 text-slate-700 dark:text-slate-300 sm:text-sm sm:leading-relaxed">
                {routeMessage}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Live overview
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{liveStopCount}</span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">/{filteredStops.length} visible</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Stops are filtered by the current mode and updated live from both feeds.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Service counts
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{liveServiceCount}</span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">tracked routes</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Combined route count currently visible on the board.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Next departure
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{nextDepartureLabel}</span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">fastest pull</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {nextDeparture ? `${nextDeparture.busNo} · ${nextDeparture.stopName}` : 'Waiting for fresh data.'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Refresh cadence
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{isAutoRefresh ? '30s' : 'Paused'}</span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">live sync</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {isAutoRefresh ? 'The board refreshes in the background.' : 'Manual refresh is enabled.'}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  Live stops
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400 sm:text-sm">
                  A compact summary of the stops currently reporting.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                {visibleStopData.length} live
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleStopData.map((stopData) => {
                const stop = STOPS.find((entry) => entry.id === stopData.stopCode);
                return (
                  <div key={stopData.stopCode} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{stopData.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{stopData.roadName}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                        {stopData.source}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-950">{stopData.buses.length} services</span>
                      {stop && (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-950">{stopTypeLabel(stop.type)}</span>
                      )}
                      {stop && stop.walkTime > 0 && (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-950">{stop.walkTime}m walk</span>
                      )}
                      {stopData.buses[0] && (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-950">Lead {stopData.buses[0].busNo}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={viewMode === 'board' ? 'mb-4 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:mb-6 sm:p-4' : 'hidden'}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                Mode
              </p>
              <h3 className="mt-1 text-base font-black leading-tight tracking-[-0.02em] text-slate-900 dark:text-slate-100 sm:text-base">
                {modeMeta.status}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400 sm:text-sm">
                Switch between morning, evening, or the full route view.
              </p>
            </div>

            <div className="grid w-full grid-cols-3 gap-1 lg:w-auto lg:min-w-[25rem] lg:gap-1.5">
              <button
                onClick={() => setActiveTab('morning')}
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 text-xs font-black transition sm:min-h-11 sm:px-3 sm:text-sm sm:font-bold ${
                  activeTab === 'morning'
                    ? 'border border-amber-200 bg-amber-100 text-amber-700 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-900'
                }`}
              >
                <Sun className="h-3.5 w-3.5 shrink-0" />
                Morning
              </button>
              <button
                onClick={() => setActiveTab('evening')}
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 text-xs font-black transition sm:min-h-11 sm:px-3 sm:text-sm sm:font-bold ${
                  activeTab === 'evening'
                    ? 'border border-indigo-200 bg-indigo-100 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-900'
                }`}
              >
                <Moon className="h-3.5 w-3.5 shrink-0" />
                Evening
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 text-xs font-black transition sm:min-h-11 sm:px-3 sm:text-sm sm:font-bold ${
                  activeTab === 'all'
                    ? 'border border-slate-700 bg-slate-800 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-900'
                }`}
              >
                All Stops
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <RefreshCw className="h-10 w-10 animate-spin text-brand-500" />
            <p className="font-medium text-slate-500 animate-pulse dark:text-slate-400">
              Loading live bus information...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-5 lg:grid-cols-2">
            {filteredStops.map((stop) => {
              const stopData = data[stop.id];

              return (
                <div
                  key={stop.id}
                  className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-950/5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900/65 dark:hover:border-slate-700 dark:hover:shadow-slate-950/25 sm:shadow-2xl"
                >
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stopAccentClass(stop.type)}`} />

                  <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 dark:border-slate-800 sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div className="flex-shrink-0 rounded-2xl border border-brand-200 bg-brand-100 p-1.5 text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-400 sm:p-2">
                        <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>

                      <div>
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 sm:px-2.5 sm:py-1 sm:text-[10px]">
                          {stopTypeLabel(stop.type)}
                        </span>
                        <h3 className="mt-1.5 text-[15px] font-black leading-snug tracking-[-0.02em] text-slate-950 dark:text-slate-100 sm:mt-2 sm:text-base md:text-lg">
                          {stop.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="whitespace-nowrap text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs">
                            {stop.roadName}
                          </p>
                          {stop.walkTime > 0 && (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 sm:text-[10px]">
                              <Footprints className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              {stop.walkTime}m walk
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-right">
                        <span className="block text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:text-[10px]">
                          Code
                        </span>
                        <div className="text-base font-black tracking-[0.18em] text-slate-900 dark:text-white sm:text-lg">
                          {stop.id}
                        </div>
                      </div>

                      {stopData && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider sm:text-[10px] ${
                            stopData.source === 'LTA'
                              ? 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/10 dark:bg-sky-500/10 dark:text-sky-300'
                              : 'border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-500/10 dark:bg-indigo-500/10 dark:text-indigo-300'
                          }`}
                        >
                          {stopData.source}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
                    <div className="mb-2.5 flex items-center justify-between sm:mb-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                          Service counts
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-xs">
                          {stopData ? `${stopData.buses.length} tracked routes` : 'Waiting for fresh data'}
                        </p>
                      </div>

                      {stopData && (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                            stopData.source === 'LTA'
                              ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/10 dark:bg-sky-500/10 dark:text-sky-300'
                              : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/10 dark:bg-indigo-500/10 dark:text-indigo-300'
                          }`}
                        >
                          {stopData.source} feed
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {stopData?.buses.map((bus) => {
                        const isTargetBus =
                          (activeTab === 'morning' && ['872', '452', '871'].includes(bus.busNo)) ||
                          (activeTab === 'evening' && ['674', '872', '57', '100', '107', '462'].includes(bus.busNo));

                        return (
                          <div
                            key={bus.busNo}
                            className={`flex items-center gap-2 rounded-2xl py-2.5 transition-all first:pt-0 last:pb-0 sm:gap-2.5 sm:py-3 ${
                              isTargetBus ? 'bg-brand-50/90 px-2 -mx-2 border border-brand-100 dark:bg-brand-500/10 dark:border-brand-500/10 sm:px-3 sm:-mx-3' : ''
                            }`}
                          >
                            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                              <div
                                className={`flex h-9 min-w-[2.65rem] items-center justify-center rounded-2xl border px-1 text-sm font-black transition sm:h-11 sm:min-w-[3.5rem] sm:px-2 sm:text-base ${
                                  isTargetBus
                                    ? 'border-brand-300 bg-brand-100 text-brand-700 shadow-sm dark:border-brand-500/40 dark:bg-brand-500/20 dark:text-brand-300 dark:shadow-brand-500/10'
                                    : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {bus.busNo}
                              </div>
                            </div>

                            <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
                              <div className="flex min-w-max items-center justify-end gap-1 sm:gap-1.5">
                                {bus.timings.length > 0 ? (
                                  bus.timings.map((t, idx) => {
                                  const isArr = t.mins === 'Arr';
                                  const displayTime = isArr ? 'Arr' : `${t.mins}m`;
                                  const timeToLeave = isArr ? -99 : (t.mins as number) - stop.walkTime;
                                  const isLeavingNow = timeToLeave >= -2 && timeToLeave <= 3;
                                  const crowdColorClass =
                                    t.load === 'LSD'
                                      ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]'
                                      : t.load === 'SDA'
                                        ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]'
                                        : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]';

                                  return (
                                    <div
                                      key={idx}
                                      className={`relative flex min-w-[2.55rem] flex-col items-center justify-center rounded-lg border px-1.5 py-1.5 font-mono shadow-sm transition sm:min-w-[3.2rem] sm:px-2 sm:py-2 ${
                                        idx === 0
                                          ? isArr
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-600/20 dark:text-emerald-400'
                                            : isLeavingNow
                                              ? 'border-rose-300 bg-rose-50 text-rose-700 ring-1 ring-rose-400 dark:border-rose-500/30 dark:bg-rose-600/20 dark:text-rose-400 dark:ring-rose-500/50'
                                              : 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/20 dark:text-brand-300'
                                          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400'
                                      }`}
                                    >
                                      <div className="relative mb-0.5 flex h-5 w-full items-center justify-center sm:h-5">
                                        {t.type === 'DD' ? (
                                          <DoubleDeckerIcon className="h-4 w-4 text-slate-500 opacity-90 dark:text-slate-300" />
                                        ) : t.type === 'BD' ? (
                                          <BendyBusIcon className="h-4 w-4 text-slate-500 opacity-90 sm:h-4.5 sm:w-5 dark:text-slate-300" />
                                        ) : (
                                          <div className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                                        )}
                                        {idx === 0 && isLeavingNow && (
                                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[7px] font-extrabold leading-none tracking-widest text-white shadow-sm sm:text-[8px]">
                                            LEAVE
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-xs font-black tracking-tighter sm:text-sm ${isArr && 'text-emerald-600 dark:text-emerald-400'}`}>
                                          {displayTime}
                                        </span>
                                        <div
                                          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full sm:h-2 sm:w-2 ${crowdColorClass}`}
                                          title={`Crowd level: ${t.load === 'LSD' ? 'Crowded (No Seats)' : t.load === 'SDA' ? 'Standing Available' : 'Seats Available'}`}
                                        />
                                      </div>
                                    </div>
                                  );
                                  })
                                ) : (
                                  <div className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-medium text-slate-500 dark:border-slate-800/80 dark:bg-slate-800/50 dark:text-slate-400 sm:px-3 sm:text-xs">
                                    <AlertTriangle className="h-3 w-3 text-slate-400 dark:text-slate-500 sm:h-3.5 sm:w-3.5" />
                                    Not operating
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                      })}

                      {(!stopData || stopData.buses.length === 0) && (
                        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          No timings available for this stop.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
