import { useEffect, useState, useCallback, useRef } from 'react';
import { MapPin, Clock, RefreshCw, Sun, Moon, Sparkles, Navigation, AlertTriangle, Footprints, Users } from 'lucide-react';

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

// Custom responsive SVGs for single, double decker, and bendy buses
const SingleDeckerIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="8" rx="1.5" />
    <path d="M3 12h18M7 8v4M12 8v4M17 8v4" />
    <circle cx="7" cy="18" r="1.5" />
    <circle cx="17" cy="18" r="1.5" />
  </svg>
);

const DoubleDeckerIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M3 10h18M7 4v6M12 4v6M17 4v6M7 10v6M12 10v6M17 10v6" />
    <circle cx="7" cy="18" r="1.5" />
    <circle cx="17" cy="18" r="1.5" />
  </svg>
);

const BendyBusIcon = ({ className = "w-4 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} strokeLinecap="round" strokeLinejoin="round">
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
          if (['03129', '43759', '43751'].includes(stop.id)) return stop.guaranteed.includes(busNo);
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

  const filteredStops = STOPS.filter(stop => {
    if (activeTab === 'all') return true;
    return stop.type === activeTab || stop.type === 'both';
  });

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-brand-100 text-brand-700 border-brand-200 dark:bg-brand-600/20 dark:text-brand-400 dark:border-brand-500/20 text-[10px] sm:text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 border">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Tengah Commute Tracker
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-transparent dark:bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-slate-400 dark:bg-clip-text">
            Plantation Cres Live Board
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm mt-1">
            Real-time bus timings. Sourced from LTA & ArriveLah.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-between sm:justify-start">
          <div className="bg-white border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 rounded-lg p-1 flex items-center gap-1">
            <button
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={`text-[10px] sm:text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md font-medium transition ${
                isAutoRefresh
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-600/20 dark:text-emerald-400 dark:border-emerald-500/20'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {isAutoRefresh ? 'Auto On' : 'Auto Off'}
            </button>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 p-1.5 rounded-md transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin text-brand-500 dark:text-brand-400' : ''}`} />
            </button>
            <div className="w-px h-5 sm:h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button
              onClick={() => setIsDark(!isDark)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 p-1.5 rounded-md transition"
              title="Toggle Dark Mode"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          </div>
          {lastUpdated && (
            <span className="text-[10px] sm:text-xs text-slate-500 font-mono">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* Commuter Recommendation HUD */}
      <div className="mb-6 sm:mb-8 bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md dark:shadow-xl">
        <div className="flex items-start gap-3">
          <div className="bg-brand-100 dark:bg-brand-600/10 p-2 sm:p-2.5 rounded-lg border border-brand-200 dark:border-brand-500/20 text-brand-600 dark:text-brand-400 mt-0.5 flex-shrink-0">
            <Navigation className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-200">Suggested Route Recommendation</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
              {activeTab === 'morning' && '🌅 Morning Commute is active! Take Bus 452 to Beauty World MRT, or take Bus 872 to Chinese Garden MRT.'}
              {activeTab === 'evening' && '🌇 Evening Return is active! Board Bus 674 from UIC Building, or take Bus 872 from Chinese Garden MRT back to Tengah.'}
              {activeTab === 'all' && '🚇 Ready for your commute? Toggle Morning or Evening modes to focus on specific routes, stops, and timings.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('morning')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'morning'
                ? 'bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
                : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800/80'
            }`}
          >
            <Sun className="w-3.5 h-3.5" /> Morning
          </button>
          <button
            onClick={() => setActiveTab('evening')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'evening'
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30'
                : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800/80'
            }`}
          >
            <Moon className="w-3.5 h-3.5" /> Evening
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'all'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800/80'
            }`}
          >
            All Stops
          </button>
        </div>
      </div>

      {/* Grid of Bus Stops */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-10 h-10 animate-spin text-brand-500" />
          <p className="text-slate-500 dark:text-slate-400 animate-pulse font-medium">Loading live bus information...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredStops.map((stop) => {
            const stopData = data[stop.id];
            return (
              <div
                key={stop.id}
                className="bg-white border border-slate-200 shadow-sm dark:bg-slate-900/40 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-xl overflow-hidden transition duration-300 dark:backdrop-blur-sm"
              >
                {/* Stop Header - Inline and responsive for mobile */}
                <div className="bg-slate-50 dark:bg-slate-900/80 px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="bg-brand-100 dark:bg-brand-500/10 p-1.5 sm:p-2 rounded-lg text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20 flex-shrink-0">
                      <MapPin className="w-4 sm:w-5 h-4 sm:h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base md:text-lg leading-snug">
                        {stop.name}
                      </h3>
                      <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                        <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{stop.roadName}</p>
                        {stop.walkTime > 0 && (
                          <span className="text-[9px] sm:text-[10px] bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 sm:gap-1 font-medium border border-slate-300 dark:border-slate-700 whitespace-nowrap">
                            <Footprints className="w-2.5 sm:w-3 h-2.5 sm:h-3" /> {stop.walkTime}m
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 sm:gap-1 flex-shrink-0">
                    <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      Code {stop.id}
                    </span>
                    {stopData && (
                      <span
                        className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          stopData.source === 'LTA'
                            ? 'bg-sky-100 text-sky-700 border border-sky-200 dark:bg-sky-600/10 dark:text-sky-400 dark:border-sky-500/10'
                            : 'bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-600/10 dark:text-indigo-400 dark:border-indigo-500/10'
                        }`}
                      >
                        {stopData.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bus List */}
                <div className="p-4 sm:p-5 divide-y divide-slate-100 dark:divide-slate-800/50">
                  {stopData?.buses.map((bus) => {
                    const isTargetBus =
                      (activeTab === 'morning' && ['872', '452', '871'].includes(bus.busNo)) ||
                      (activeTab === 'evening' && ['674', '872'].includes(bus.busNo));

                    return (
                      <div
                        key={bus.busNo}
                        className={`py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0 transition-all rounded-lg ${
                          isTargetBus ? 'bg-brand-50 px-2 sm:px-3 -mx-2 sm:-mx-3 border border-brand-100 dark:bg-brand-500/5 dark:border-brand-500/10' : ''
                        }`}
                      >
                        {/* Bus Badge and Route Description */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          <div
                            className={`min-w-[2.75rem] h-9 sm:min-w-[3.5rem] sm:h-11 px-1 sm:px-2 rounded-lg flex items-center justify-center font-extrabold text-sm sm:text-base border transition flex-shrink-0 ${
                              isTargetBus
                                ? 'bg-brand-100 text-brand-700 border-brand-300 dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/40 dark:shadow-sm dark:shadow-brand-500/10'
                                : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60'
                            }`}
                          >
                            {bus.busNo}
                          </div>
                          <div className="hidden min-[380px]:block">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm whitespace-nowrap">
                              Bus {bus.busNo}
                            </span>
                            {isTargetBus && (
                              <span className="block text-[9px] sm:text-[10px] text-brand-600 dark:text-brand-400 font-medium leading-none mt-0.5">
                                Active Route
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Timing Indicators - Horizontally aligned and scroll-prevented */}
                        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar max-w-full justify-end flex-grow">
                          {bus.timings.length > 0 ? (
                            bus.timings.map((t, idx) => {
                              const isArr = t.mins === 'Arr';
                              const displayTime = isArr ? 'Arr' : `${t.mins}m`;
                              const timeToLeave = isArr ? null : (t.mins as number) - stop.walkTime;
                              const isLeavingNow = typeof timeToLeave === 'number' && timeToLeave >= 0 && timeToLeave <= 2;
                              const crowdColorClass = 
                                t.load === 'LSD' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 
                                t.load === 'SDA' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 
                                'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';

                              return (
                                <div
                                  key={idx}
                                  className={`relative px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md font-mono text-[10px] sm:text-xs sm:text-sm font-bold flex items-center gap-1 sm:gap-1.5 shadow-sm border transition ${
                                    idx === 0
                                      ? isArr
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-600/20 dark:text-emerald-400 dark:border-emerald-500/30 animate-pulse'
                                        : isLeavingNow
                                          ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-600/20 dark:text-rose-400 dark:border-rose-500/30 animate-pulse'
                                          : 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30'
                                      : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-800'
                                  }`}
                                >
                                  {idx === 0 && isLeavingNow && (
                                    <div className="absolute -top-2.5 -right-1 bg-rose-500 text-white text-[7px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded shadow-sm border border-rose-600 tracking-wider">
                                      LEAVE
                                    </div>
                                  )}
                                  
                                  {/* Time */}
                                  <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                                    <Clock className="w-3 sm:w-3.5 h-3 sm:h-3.5 opacity-75" />
                                    <span>{displayTime}</span>
                                  </div>
                                  
                                  {/* Crowd dot */}
                                  <div className={`flex items-center border-l pl-1 sm:pl-1.5 ${
                                    idx === 0 
                                      ? (isArr 
                                        ? 'border-emerald-200 dark:border-emerald-500/30' 
                                        : isLeavingNow 
                                          ? 'border-rose-200 dark:border-rose-500/30' 
                                          : 'border-brand-200 dark:border-brand-500/30') 
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}>
                                    <div className="flex items-center gap-0.5 sm:gap-1 opacity-90 flex-shrink-0" title={`Crowd level: ${t.load === 'LSD' ? 'Crowded' : t.load === 'SDA' ? 'Standing' : 'Seats Available'}`}>
                                      <Users className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
                                      <div className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${crowdColorClass}`} />
                                    </div>
                                  </div>

                                  {/* Bus Type Icon */}
                                  <div className={`flex items-center border-l pl-1 sm:pl-1.5 ${
                                    idx === 0 
                                      ? (isArr 
                                        ? 'border-emerald-200 dark:border-emerald-500/30' 
                                        : isLeavingNow 
                                          ? 'border-rose-200 dark:border-rose-500/30' 
                                          : 'border-brand-200 dark:border-brand-500/30') 
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}>
                                    <div className="flex items-center gap-0.5 sm:gap-1 opacity-90 flex-shrink-0" title={t.type === 'DD' ? 'Double Decker Bus' : t.type === 'BD' ? 'Bendy Bus' : 'Single Decker Bus'}>
                                      {t.type === 'DD' ? (
                                        <DoubleDeckerIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-500 dark:text-slate-400" />
                                      ) : t.type === 'BD' ? (
                                        <BendyBusIcon className="w-4 sm:w-4.5 h-3.5 sm:h-4 text-slate-500 dark:text-slate-400" />
                                      ) : (
                                        <SingleDeckerIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-slate-500 dark:text-slate-400" />
                                      )}
                                      <span className="text-[8px] sm:text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500">
                                        {t.type || 'SD'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-[10px] sm:text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md border border-slate-200 dark:border-slate-800/80 flex items-center gap-1.5 flex-shrink-0">
                              <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 dark:text-slate-500" />
                              Not operating
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {(!stopData || stopData.buses.length === 0) && (
                    <div className="py-6 text-center text-slate-500 text-sm">
                      No timings available for this stop.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
