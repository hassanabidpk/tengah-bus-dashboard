import { useEffect, useState, useCallback, useRef } from 'react';
import { MapPin, Clock, RefreshCw, Sun, Moon, Sparkles, Navigation, AlertTriangle } from 'lucide-react';

interface BusStop {
  id: string;
  name: string;
  roadName: string;
  type: 'morning' | 'evening' | 'both';
  guaranteed: string[];
}

const STOPS: BusStop[] = [
  { id: '40381', name: 'Blk 111', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['870', '871', '992'] },
  { id: '40389', name: 'Tengah CC', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['452', '674', '871', '992'] },
  { id: '40481', name: 'Bef Blk 113', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['872'] },
  { id: '40489', name: 'Opp Blk 113', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['872'] },
  { id: '03129', name: 'UIC Bldg', roadName: 'Shenton Way', type: 'evening', guaranteed: ['674'] },
];

interface BusTimingInfo {
  busNo: string;
  timings: string[];
}

interface StopData {
  stopCode: string;
  name: string;
  roadName: string;
  source: string;
  buses: BusTimingInfo[];
}

export default function App() {
  const [data, setData] = useState<Record<string, StopData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'morning' | 'evening'>('all');
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  // Auto-set tab based on SGT time of day
  useEffect(() => {
    // SGT is UTC+8
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
      const busDataMap: Record<string, string[]> = {};

      if (source === 'LTA') {
        const services = apiData.Services || [];
        services.forEach((s: any) => {
          const busNo = s.ServiceNo;
          const timings: string[] = [];
          
          const now = new Date();
          const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
          const sgtNow = new Date(utcNow + (3600000 * 8));

          ['NextBus', 'NextBus2', 'NextBus3'].forEach((key) => {
            const arrivalStr = s[key]?.EstimatedArrival;
            if (arrivalStr) {
              const arrivalDt = new Date(arrivalStr);
              const diffMins = Math.floor((arrivalDt.getTime() - sgtNow.getTime()) / 60000);
              timings.push(diffMins <= 0 ? 'Arr' : `${diffMins}m`);
            }
          });
          busDataMap[busNo] = timings;
        });
      } else {
        // ArriveLah parsing
        const services = apiData.services || [];
        services.forEach((s: any) => {
          const busNo = s.no;
          const timings: string[] = [];
          ['next', 'next2', 'next3'].forEach((key) => {
            if (s[key] && typeof s[key].duration_ms === 'number') {
              const mins = Math.floor(s[key].duration_ms / 60000);
              timings.push(mins <= 0 ? 'Arr' : `${mins}m`);
            }
          });
          busDataMap[busNo] = timings;
        });
      }

      // Format clean list prioritizing guaranteed buses
      const allBusNumbers = Array.from(new Set([...stop.guaranteed, ...Object.keys(busDataMap)])).sort();
      
      const buses: BusTimingInfo[] = allBusNumbers
        .filter((busNo) => {
          // If UIC Bldg, only show target commute buses to prevent clutter
          if (stop.id === '03129') return stop.guaranteed.includes(busNo);
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

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh interval
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isAutoRefresh) {
      timerRef.current = setInterval(() => {
        refreshAll();
      }, 30000); // 30s
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAutoRefresh, refreshAll]);

  const filteredStops = STOPS.filter(stop => {
    if (activeTab === 'all') return true;
    return stop.type === activeTab;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-brand-600/20 text-brand-400 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 border border-brand-500/20">
              <Sparkles className="w-3.5 h-3.5" /> Tengah Commute Tracker
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Plantation Cres Live Board
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time bus timings. Sourced from LTA & ArriveLah.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center gap-2">
            <button
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                isAutoRefresh
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAutoRefresh ? 'Auto Refresh On' : 'Auto Refresh Off'}
            </button>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 p-1.5 rounded-md transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
          {lastUpdated && (
            <span className="text-xs text-slate-500 font-mono">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* Commuter Recommendation HUD */}
      <div className="mb-8 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="bg-brand-600/10 p-2.5 rounded-lg border border-brand-500/20 text-brand-400 mt-0.5">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-200">Suggested Route Recommendation</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              {activeTab === 'morning' && '🌅 Morning Commute is active! Take Bus 452 to Beauty World MRT, or take Bus 872 to Chinese Garden MRT.'}
              {activeTab === 'evening' && '🌇 Evening Return is active! Board Bus 674 from UIC Building, or take Bus 872 from Chinese Garden MRT back to Tengah.'}
              {activeTab === 'all' && '🚇 Ready for your commute? Toggle Morning or Evening modes to focus on specific routes, stops, and timings.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('morning')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'morning'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-900/50 hover:bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80'
            }`}
          >
            <Sun className="w-4 h-4" /> Morning
          </button>
          <button
            onClick={() => setActiveTab('evening')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'evening'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-900/50 hover:bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80'
            }`}
          >
            <Moon className="w-4 h-4" /> Evening
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'bg-slate-900/50 hover:bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80'
            }`}
          >
            Show All
          </button>
        </div>
      </div>

      {/* Grid of Bus Stops */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-10 h-10 animate-spin text-brand-500" />
          <p className="text-slate-400 animate-pulse font-medium">Loading live bus information...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredStops.map((stop) => {
            const stopData = data[stop.id];
            return (
              <div
                key={stop.id}
                className="bg-slate-900/40 border border-slate-800 hover:border-slate-700/80 rounded-xl overflow-hidden transition duration-300 shadow-md backdrop-blur-sm"
              >
                {/* Stop Header */}
                <div className="bg-slate-900/80 px-5 py-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-brand-500/10 p-2 rounded-lg text-brand-400 border border-brand-500/20">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 text-lg leading-snug">{stop.name}</h3>
                      <p className="text-xs text-slate-400">{stop.roadName}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      Code {stop.id}
                    </span>
                    {stopData && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          stopData.source === 'LTA'
                            ? 'bg-sky-600/10 text-sky-400 border border-sky-500/10'
                            : 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/10'
                        }`}
                      >
                        {stopData.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bus List */}
                <div className="p-5 divide-y divide-slate-800/50">
                  {stopData?.buses.map((bus) => {
                    const isTargetBus =
                      (activeTab === 'morning' && ['872', '452', '871'].includes(bus.busNo)) ||
                      (activeTab === 'evening' && ['674', '872'].includes(bus.busNo));

                    return (
                      <div
                        key={bus.busNo}
                        className={`py-3.5 flex items-center justify-between first:pt-0 last:pb-0 transition-all rounded-lg ${
                          isTargetBus ? 'bg-brand-500/5 px-2 -mx-2 border border-brand-500/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 h-11 rounded-lg flex items-center justify-center font-extrabold text-base border transition ${
                              isTargetBus
                                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 shadow-sm shadow-brand-500/10'
                                : 'bg-slate-800 text-slate-300 border-slate-700/60'
                            }`}
                          >
                            {bus.busNo}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-200">
                              Bus {bus.busNo}
                            </span>
                            {isTargetBus && (
                              <span className="block text-[10px] text-brand-400 font-medium">
                                Highlighted Commute Bus
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Timing Indicators */}
                        <div className="flex items-center gap-2">
                          {bus.timings.length > 0 ? (
                            bus.timings.map((time, idx) => (
                              <div
                                key={idx}
                                className={`px-3 py-1.5 rounded-md font-mono text-sm font-bold flex items-center gap-1 shadow-inner border transition ${
                                  idx === 0
                                    ? time === 'Arr'
                                      ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 animate-pulse'
                                      : 'bg-brand-500/20 text-brand-300 border-brand-500/30'
                                    : 'bg-slate-800/60 text-slate-400 border-slate-800'
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5 opacity-75" />
                                {time}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-slate-500 bg-slate-850 px-3 py-1.5 rounded-md border border-slate-800/80 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-slate-600" />
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
