import { useEffect, useState, useCallback, useRef } from 'react';
import { MapPin, Clock, RefreshCw, Sun, Moon, Sparkles, Navigation, AlertTriangle } from 'lucide-react';

interface BusStop {
  id: string;
  name: string;
  roadName: string;
  type: 'morning' | 'evening' | 'both';
  guaranteed: string[];
  walkTime: number;
  walkDistance: number;
  lat: number;
  lon: number;
}

const STOPS: BusStop[] = [
  { id: '40381', name: 'Blk 111', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['870', '871', '992'], walkTime: 5, walkDistance: 500, lat: 1.35636, lon: 103.73427 },
  { id: '40389', name: 'Tengah CC', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['452', '674', '871', '992'], walkTime: 7, walkDistance: 550, lat: 1.356473, lon: 103.734424 },
  { id: '40481', name: 'Bef Blk 113', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['872', '831W'], walkTime: 4, walkDistance: 500, lat: 1.3528881, lon: 103.7350774 },
  { id: '40489', name: 'Opp Blk 113', roadName: 'Plantation Cres', type: 'morning', guaranteed: ['872', '831G'], walkTime: 4, walkDistance: 550, lat: 1.3533225, lon: 103.7355067 },
  { id: '03129', name: 'UIC Bldg', roadName: 'Shenton Way', type: 'evening', guaranteed: ['674'], walkTime: 5, walkDistance: 400, lat: 1.2779979, lon: 103.8495113 },
  { id: '28349', name: 'Opp Chinese Garden Stn', roadName: 'Boon Lay Way', type: 'evening', guaranteed: ['872'], walkTime: 2, walkDistance: 150, lat: 1.3424966, lon: 103.73315 },
  { id: '43759', name: 'Blk 443D (Outside Tengah)', roadName: 'Bt Batok Rd', type: 'both', guaranteed: ['180', '160', '984'], walkTime: 9, walkDistance: 600, lat: 1.3559686, lon: 103.7369204 },
  { id: '43751', name: 'Opp Blk 443D (Outside Tengah)', roadName: 'Bt Batok Rd', type: 'both', guaranteed: ['180', '160', '984', '871'], walkTime: 5.5, walkDistance: 500, lat: 1.3557122, lon: 103.7364816 },
  { id: '01519', name: 'The Gateway', roadName: 'Beach Rd', type: 'evening', guaranteed: ['100', '107', '57'], walkTime: 3, walkDistance: 200, lat: 1.2992256, lon: 103.8590512 }
];

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const x = (lon2 - lon1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
  const y = (lat2 - lat1) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * R;
}

interface TimingDetail {
  time: string;
  isAtInterchange: boolean;
  isOneStopAway: boolean;
}

interface BusTimingInfo {
  busNo: string;
  timings: TimingDetail[];
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
      const busDataMap: Record<string, TimingDetail[]> = {};

      if (source === 'LTA') {
        const services = apiData.Services || [];
        services.forEach((s: any) => {
          const busNo = s.ServiceNo;
          const timings: TimingDetail[] = [];
          
          const now = new Date();
          const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
          const sgtNow = new Date(utcNow + (3600000 * 8));

          ['NextBus', 'NextBus2', 'NextBus3'].forEach((key) => {
            const b = s[key];
            const arrivalStr = b?.EstimatedArrival;
            if (arrivalStr) {
              const arrivalDt = new Date(arrivalStr);
              const diffMins = Math.floor((arrivalDt.getTime() - sgtNow.getTime()) / 60000);
              const time = diffMins <= 0 ? 'Arr' : `${diffMins}m`;
              
              const latVal = parseFloat(b?.Latitude || '0');
              const lonVal = parseFloat(b?.Longitude || '0');
              const isAtInterchange = latVal === 0 && lonVal === 0;
              let isOneStopAway = false;
              if (!isAtInterchange && latVal && lonVal && stop.lat && stop.lon) {
                const dist = getDistanceMeters(latVal, lonVal, stop.lat, stop.lon);
                isOneStopAway = dist >= 300 && dist <= 1000;
              }
              
              timings.push({ time, isAtInterchange, isOneStopAway });
            }
          });
          busDataMap[busNo] = timings;
        });
      } else {
        // ArriveLah parsing
        const services = apiData.services || [];
        services.forEach((s: any) => {
          const busNo = s.no;
          const timings: TimingDetail[] = [];
          ['next', 'next2', 'next3'].forEach((key) => {
            const b = s[key];
            if (b && typeof b.duration_ms === 'number') {
              const mins = Math.floor(b.duration_ms / 60000);
              const time = mins <= 0 ? 'Arr' : `${mins}m`;
              
              const latVal = b.lat;
              const lonVal = b.lng;
              const isAtInterchange = latVal === 0 && lonVal === 0;
              let isOneStopAway = false;
              if (!isAtInterchange && latVal && lonVal && stop.lat && stop.lon) {
                const dist = getDistanceMeters(latVal, lonVal, stop.lat, stop.lon);
                isOneStopAway = dist >= 300 && dist <= 1000;
              }
              
              timings.push({ time, isAtInterchange, isOneStopAway });
            }
          });
          busDataMap[busNo] = timings;
        });
      }

      // Format clean list prioritizing guaranteed buses
      const allBusNumbers = Array.from(new Set([...stop.guaranteed, ...Object.keys(busDataMap)])).sort();
      
      const buses: BusTimingInfo[] = allBusNumbers
        .filter((busNo) => {
          // If commute stops, only show target commute buses to prevent clutter
          if (['03129', '43759', '43751', '01519', '28349'].includes(stop.id)) return stop.guaranteed.includes(busNo);
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
    return stop.type === activeTab || stop.type === 'both';
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
                      Code {stop.id} • 🚶 {stop.walkTime}m walk
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
                            bus.timings.map((t, idx) => {
                              const mins = t.time === 'Arr' ? 0 : parseInt(t.time) || 0;
                              const leaveMins = mins - stop.walkTime;
                              
                              let leaveText = '';
                              let leaveColor = 'text-slate-500';
                              if (leaveMins > 0) {
                                leaveText = `Lv: ${leaveMins}m`;
                                leaveColor = idx === 0 ? 'text-brand-400 font-bold' : 'text-slate-500';
                              } else if (leaveMins === 0) {
                                leaveText = 'Lv: Now';
                                leaveColor = 'text-amber-400 font-extrabold animate-pulse';
                              } else {
                                leaveText = 'Missed';
                                leaveColor = 'text-rose-500/60 line-through text-[9px]';
                              }

                              return (
                                <div key={idx} className="flex flex-col items-center gap-1">
                                  <div
                                    className={`px-3 py-1.5 rounded-md font-mono text-sm font-bold flex items-center gap-1.5 shadow-inner border transition ${
                                      idx === 0
                                        ? t.time === 'Arr'
                                          ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 animate-pulse'
                                          : 'bg-brand-500/20 text-brand-300 border-brand-500/30'
                                        : 'bg-slate-800/60 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    <Clock className="w-3.5 h-3.5 opacity-75" />
                                    <span>{t.time}</span>
                                    
                                    {/* Interchange Icon */}
                                    {t.isAtInterchange && (
                                      <span className="text-amber-400 text-xs ml-0.5" title="Still at Interchange">
                                        🏠
                                      </span>
                                    )}
                                    
                                    {/* One Stop Away Indicator */}
                                    {t.isOneStopAway && (
                                      <span className="relative flex h-2 w-2 ml-0.5" title="One stop away!">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Sub-texts including status */}
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-[10px] font-mono tracking-wider uppercase ${leaveColor}`}>
                                      {leaveText}
                                    </span>
                                    {t.isAtInterchange && (
                                      <span className="text-[8px] text-amber-500/80 font-semibold uppercase tracking-tight">
                                        At Interchange
                                      </span>
                                    )}
                                    {t.isOneStopAway && (
                                      <span className="text-[8px] text-sky-400/90 font-bold uppercase tracking-tight animate-pulse">
                                        1 Stop Away
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
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
