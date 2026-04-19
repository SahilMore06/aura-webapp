import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bell, MapPin, Navigation, RefreshCw, Info, Wind, Droplets, ThermometerSun, Loader2, Shield, Activity, Leaf, CheckCircle, Flame, Factory, Car, AlertTriangle, ShieldAlert, Skull, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { generateDashboardIEEE } from '../utils/ieeeDashboardReport';

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [locationName, setLocationName] = useState('Detecting location…');
  const [trendMetric, setTrendMetric] = useState('pm25');
  const [mlCities, setMlCities] = useState<any>(null);
  const [alertActive, setAlertActive] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('just now');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'granted' | 'denied' | 'ip'>('detecting');

  const GOOGLE_AQ_KEY = import.meta.env.VITE_GOOGLE_AQ_API_KEY as string;
  const ML_API_URL = (import.meta.env.VITE_ML_API_URL as string) || 'https://aura-air-api.onrender.com';

  const fetchData = async (lat: number, lon: number) => {
    setCoords({ lat, lon });
    try {
      setLoading(true);
      setError(null);

      // ── Primary: Google Air Quality API (accurate, real-time) ──
      const googleRes = await fetch(
        `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_AQ_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: { latitude: lat, longitude: lon },
            extraComputations: ['POLLUTANT_CONCENTRATION', 'LOCAL_AQI', 'POLLUTANT_ADDITIONAL_INFO'],
            languageCode: 'en',
          }),
        }
      );
      const googleJson = await googleRes.json();

      // Extract pollutant data from Google response
      const pollutantMap: Record<string, number> = {};
      if (googleJson.pollutants) {
        googleJson.pollutants.forEach((p: any) => {
          const val = p.concentration?.value || 0;
          // Google returns ppb for gases, µg/m³ for PM — normalize all to µg/m³ for UI
          if (p.code === 'pm25') pollutantMap.pm2_5 = val;
          else if (p.code === 'pm10') pollutantMap.pm10 = val;
          else if (p.code === 'no2') pollutantMap.nitrogen_dioxide = val;
          else if (p.code === 'o3') pollutantMap.ozone = val;
          else if (p.code === 'so2') pollutantMap.sulphur_dioxide = val;
          else if (p.code === 'co') pollutantMap.carbon_monoxide = val;
        });
      }

      // Get AQI — prefer local Indian AQI if available, else Universal AQI
      let mainAqi = 0;
      if (googleJson.indexes) {
        const localIdx = googleJson.indexes.find((idx: any) => idx.code === 'ind_cpcb');
        const uaqiIdx = googleJson.indexes.find((idx: any) => idx.code === 'uaqi');
        mainAqi = localIdx?.aqi || uaqiIdx?.aqi || 0;
      }

      // ── Secondary: Open-Meteo for 24hr trend (Google doesn't offer free hourly history) ──
      let trendData: any[] = [];
      try {
        const meteoRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi,pm2_5`);
        const meteoJson = await meteoRes.json();
        if (meteoJson.hourly?.time) {
          const now = new Date();
          const currentIndex = meteoJson.hourly.time.findIndex((t: string) => new Date(t) > now);
          const startIdx = Math.max(0, (currentIndex !== -1 ? currentIndex : 0) - 12);
          for (let i = startIdx; i < Math.min(meteoJson.hourly.time.length, startIdx + 24); i += 2) {
            const time = new Date(meteoJson.hourly.time[i]);
            trendData.push({
              time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              pm25: meteoJson.hourly.pm2_5[i],
              aqi: meteoJson.hourly.us_aqi[i],
            });
          }
        }
      } catch (e) {
        console.warn('Open-Meteo trend fetch failed (non-critical)', e);
      }

      setData({
        current: {
          us_aqi: mainAqi,
          pm2_5: pollutantMap.pm2_5 || 0,
          pm10: pollutantMap.pm10 || 0,
          ozone: pollutantMap.ozone || 0,
          nitrogen_dioxide: pollutantMap.nitrogen_dioxide || 0,
          sulphur_dioxide: pollutantMap.sulphur_dioxide || 0,
          carbon_monoxide: pollutantMap.carbon_monoxide || 0,
        },
        trend: trendData,
        source: 'Google Air Quality API',
        googleRaw: googleJson, // keep full response for report generation
      });

      // ── Reverse geocode for location name using Nominatim ──
      // This gives the REAL city from coordinates — far more accurate than any IP service
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const geoJson = await geoRes.json();
        if (geoJson.address) {
          const a = geoJson.address;
          // Priority order: most specific first
          const city =
            a.city ||
            a.town ||
            a.municipality ||
            a.city_district ||
            a.suburb ||
            a.village ||
            a.district ||
            a.county ||
            '';
          const state = a.state || '';
          if (city || state) {
            setLocationName(`${city}${city && state ? ', ' : ''}${state}`);
          }
        }
      } catch (e) {
        console.warn('Reverse geocoding failed', e);
      }
      
    } catch (err) {
      setError('Failed to fetch air quality data');
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

  };

  const handleManualRefresh = () => {
    if (coords) {
      setIsRefreshing(true);
      fetchData(coords.lat, coords.lon);
    }
  };

  useEffect(() => {
    // Fetch categorized cities silently
    fetch(`${ML_API_URL}/cities/quality`)
      .then(res => res.json())
      .then(json => setMlCities(json.quality_groups))
      .catch(err => console.error('Failed to load ML Cities', err));
  }, []);

  // ── IP-based geolocation fallback (works on HTTP / when GPS is denied) ──
  const fetchByIp = async (): Promise<{ lat: number; lon: number; city: string }> => {
    const res = await fetch('https://ipapi.co/json/');
    const json = await res.json();
    return { lat: json.latitude, lon: json.longitude, city: `${json.city}, ${json.region}` };
  };

  // ── Request GPS from the browser ──
  const requestGps = (onSuccess: (lat: number, lon: number) => void, onFail: () => void) => {
    if (!navigator.geolocation) { onFail(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { onSuccess(pos.coords.latitude, pos.coords.longitude); },
      (err) => { console.warn('GPS denied/unavailable:', err.message); onFail(); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const startFetch = (lat: number, lon: number) => {
      fetchData(lat, lon);
      intervalId = setInterval(() => fetchData(lat, lon), 5 * 60 * 1000);
    };

    setLocationStatus('detecting');

    requestGps(
      (lat, lon) => {
        setLocationStatus('granted');
        startFetch(lat, lon);
      },
      async () => {
        // GPS denied → try IP geolocation for COORDINATES ONLY
        // (Never use ip.city — it's ISP-registered location, not your physical location)
        try {
          const ip = await fetchByIp();
          setLocationStatus('ip');
          // Keep showing 'Detecting…' — Nominatim inside fetchData will set real city name
          startFetch(ip.lat, ip.lon);
        } catch {
          // Last resort: Mumbai coords
          setLocationStatus('denied');
          setLocationName('Mumbai, Maharashtra');
          startFetch(19.0760, 72.8777);
        }
      }
    );

    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const aqi = data?.current?.us_aqi;
    if (aqi >= 151) {
      setAlertActive(true);
      if (!audioPlayed) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log('Audio autoplay blocked by browser', e));
        setAudioPlayed(true);
      }
    } else if (aqi < 151) {
      setAlertActive(false);
      setAudioPlayed(false);
    }
  }, [data?.current?.us_aqi, audioPlayed]);

  const getAqiColor = (val: number) => {
    if (!val || isNaN(val)) return 'var(--muted)';
    if (val <= 50) return '#00E676';
    if (val <= 100) return '#FFE57F';
    if (val <= 150) return '#FF9E40';
    if (val <= 200) return '#FF5252';
    return '#CE93D8';
  };

  const getAqiLabel = (val: number) => {
    if (!val || isNaN(val)) return 'Unknown';
    if (val <= 50) return 'Good';
    if (val <= 100) return 'Moderate';
    if (val <= 150) return 'Unhealthy for Sensitive';
    if (val <= 200) return 'Unhealthy';
    if (val <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  };

  const getAdvisory = (val: number) => {
    if (!val || isNaN(val)) return 'Data unavailable.';
    if (val <= 50) return 'Air quality is considered satisfactory, and air pollution poses little or no risk.';
    if (val <= 100) return 'Air quality is acceptable; however, there may be a moderate health concern for a very small number of people.';
    if (val <= 150) return 'Members of sensitive groups may experience health effects. The general public is not likely to be affected.';
    if (val <= 200) return 'Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.';
    return 'Health warnings of emergency conditions. The entire population is more likely to be affected.';
  };

  // iPhone Weather-style: one plain English headline for non-tech users
  const getConditionHeadline = (val: number): string => {
    if (!val || isNaN(val)) return 'Checking air quality...';
    if (val <= 50)  return 'Great day to be outside';
    if (val <= 100) return 'Air is okay for most people';
    if (val <= 150) return 'Sensitive people should take care';
    if (val <= 200) return 'Limit time outdoors today';
    if (val <= 300) return 'Stay indoors if possible';
    return 'Dangerous — avoid going outside';
  };

  // iPhone Weather "Feels like" equivalent — one punchy human sentence
  const getSimpleAdvisory = (val: number): string => {
    if (!val || isNaN(val)) return 'Unable to get advisory.';
    if (val <= 50)  return 'Go ahead — the air is clean and safe.';
    if (val <= 100) return 'Air is fine for most people. Unusually sensitive individuals may want to take it easy outdoors.';
    if (val <= 150) return 'People with asthma, allergies, or heart conditions should reduce time outside.';
    if (val <= 200) return 'Everyone may feel discomfort. Wear a mask if going out.';
    if (val <= 300) return 'Health alert — avoid outdoor activity. Close windows and run an air purifier.';
    return 'Emergency conditions. Stay indoors, seal windows. This air is dangerous for everyone.';
  };

  // iPhone Weather tile-style "what to do" for each pollutant
  const getPollutantTip = (label: string, aqi: number): string => {
    const lvl = aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : 3;
    const tips: Record<string, string[]> = {
      'Fine Dust':        ['Safe — fine dust is low',      'Slightly elevated — sensitive? wear a mask', 'High — wear an N95 mask outdoors', 'Very high — stay indoors'],
      'Coarse Dust':      ['Dust levels are normal',        'Mild dust — avoid open dusty areas',          'High dust — wear a mask',           'Stay indoors'],
      'Ground Ozone':     ['Ozone is fine',                 'Moderate ozone — limit midday jogs',          'High ozone — avoid afternoon runs', 'Stay indoors, especially midday'],
      'Traffic Fumes':    ['Traffic fumes at safe levels',  'Slightly elevated — avoid highway runs',      'High — stay away from busy roads',  'Stay indoors, close windows'],
      'Industrial Smoke': ['Industrial smoke is low',       'Mild — limit prolonged outdoor time',         'High — reduce outdoor activity',    'Stay indoors'],
      'Carbon Monoxide':  ['Carbon monoxide is safe',       'Slightly elevated — ventilate indoor spaces', 'High — avoid heavy traffic areas',  'Stay indoors immediately'],
    };
    return tips[label]?.[lvl] ?? (lvl === 0 ? 'Within safe range' : lvl === 1 ? 'Slightly elevated — monitor' : 'Elevated — take precautions');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#00D4AA]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center text-text-primary p-6">
        <p className="text-[#FF5252] mb-4">{error || 'Something went wrong'}</p>
        <button 
          onClick={() => fetchData(19.0760, 72.8777)}
          className="px-4 py-2 bg-surface border border-stroke rounded-xl hover:bg-stroke/50 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const aqiValue = data.current?.us_aqi || 0;
  const aqiColor = getAqiColor(aqiValue);
  const aqiLabel = getAqiLabel(aqiValue);
  const advisoryText = getAdvisory(aqiValue);

  const handleAlertClick = () => {
    if (!alertActive || !data) return;
    const html = generateDashboardIEEE(data, aqiValue, aqiLabel, advisoryText, locationName, coords?.lat, coords?.lon);
    const printWindow = window.open('', '_blank');
    printWindow?.document.write(html);
    printWindow?.document.close();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen bg-bg text-text-primary p-6 pb-32 overflow-y-auto"
    >
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-3 bg-surface border border-stroke rounded-full px-4 py-2 backdrop-blur-md">
              {locationStatus === 'detecting' 
                ? <Loader2 className="w-4 h-4 text-[#00D4AA] animate-spin" />
                : <MapPin className="w-4 h-4 text-[#00D4AA]" />
              }
              <span className="font-medium text-sm">
                {locationStatus === 'detecting' ? 'Detecting…' : locationName}
              </span>
              {locationStatus === 'ip' && (
                <span className="text-[9px] text-muted bg-bg border border-stroke rounded-full px-2 py-0.5">IP</span>
              )}
            </div>
            {(locationStatus === 'denied' || locationStatus === 'ip') && (
              <button
                onClick={() => {
                  setLocationStatus('detecting');
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setLocationStatus('granted'); fetchData(pos.coords.latitude, pos.coords.longitude); },
                      () => setLocationStatus('denied'),
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-[#00D4AA] bg-surface border border-[#00D4AA]/30 rounded-full px-3 py-1.5 hover:bg-[#00D4AA]/10 transition-colors"
              >
                <Navigation className="w-3 h-3" />
                Use GPS
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={alertActive ? handleAlertClick : undefined}
              title={alertActive ? "Hazardous AQI! Download IEEE Alert Report" : "No active alerts"}
              className={`relative p-2 rounded-full bg-surface border transition-colors ${alertActive ? 'border-[#FF5252] hover:bg-[#FF5252]/10 cursor-pointer animate-pulse cursor-pointer shadow-[0_0_15px_rgba(255,82,82,0.5)]' : 'border-stroke hover:bg-stroke/50 cursor-default'}`}
            >
              <Bell className={`w-5 h-5 ${alertActive ? 'text-[#FF5252]' : 'text-muted'}`} />
              {alertActive && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF5252]" />}
            </button>
            <div className="w-10 h-10 rounded-full accent-gradient flex items-center justify-center font-bold text-bg">
              A
            </div>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main AQI Gauge */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1 bg-surface border border-stroke rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at center, ${aqiColor} 0%, transparent 70%)` }} />
            
            <h2 className="text-muted font-medium mb-6 z-10 text-sm uppercase tracking-widest">Current Air Quality</h2>
            
            <div className="relative w-48 h-48 flex items-center justify-center z-10">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--stroke)" strokeWidth="8" />
                <motion.circle
                  cx="50" cy="50" r="45" fill="none"
                  stroke={aqiColor} strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="283"
                  initial={{ strokeDashoffset: 283 }}
                  animate={{ strokeDashoffset: 283 - (283 * Math.min(aqiValue, 300)) / 300 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-6xl font-display italic tracking-tighter" style={{ color: aqiColor }}>
                  {aqiValue}
                </span>
                <span className="text-xs font-medium uppercase tracking-widest mt-1 text-center px-2" style={{ color: aqiColor }}>
                  {aqiLabel}
                </span>
                {/* iPhone Weather-style plain English condition line */}
                <p className="text-[10px] text-muted text-center mt-2 px-3 leading-snug">
                  {getConditionHeadline(aqiValue)}
                </p>
              </div>
            </div>
            
            <button 
              onClick={handleManualRefresh}
              className="mt-8 flex items-center gap-2 text-xs text-muted z-10 hover:text-[#00D4AA] transition-colors group"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing || loading ? 'animate-spin text-[#00D4AA]' : ''}`} />
              <span>Updated {isRefreshing ? 'refreshing...' : lastUpdated === 'just now' ? 'just now' : `at ${lastUpdated}`}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] animate-pulse" title="Auto-refresh every 5 min" />
            </button>
          </motion.div>

          {/* Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* 6 Grid Mini Stats */}
            <div className="grid grid-cols-3 gap-4 flex-1">
              {[
                { label: 'Fine Dust', value: data.current?.pm2_5, icon: Wind, color: '#FF9E40', aqi: Math.round(data.current?.pm2_5 * 2.5) || 50 },
                { label: 'Coarse Dust', value: data.current?.pm10, icon: Factory, color: '#FFE57F', aqi: Math.round(data.current?.pm10 * 1.5) || 30 },
                { label: 'Ozone', value: data.current?.ozone, icon: ThermometerSun, color: '#00E676', aqi: Math.round(data.current?.ozone * 0.5) || 14 },
                { label: 'Traffic Fumes', value: data.current?.nitrogen_dioxide, icon: Car, color: '#00D4AA', aqi: Math.round(data.current?.nitrogen_dioxide * 1.2) || 32 },
                { label: 'Industrial', value: data.current?.sulphur_dioxide, icon: Factory, color: '#CE93D8', aqi: Math.round(data.current?.sulphur_dioxide * 1.5) || 18 },
                { label: 'CO', value: data.current?.carbon_monoxide, icon: Flame, color: '#FF5252', aqi: Math.round(data.current?.carbon_monoxide * 0.01) || 3 },
              ].map((stat, i) => {
                const status = stat.aqi <= 50 ? { label: 'Good', color: '#00E676' } : stat.aqi <= 100 ? { label: 'Moderate', color: '#FFE57F' } : stat.aqi <= 150 ? { label: 'Poor', color: '#FF9E40' } : { label: 'Bad', color: '#FF5252' };
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="bg-surface border border-stroke rounded-2xl p-5 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[130px]"
                  >
                    <div className="absolute top-2 right-2 opacity-[0.07]"><stat.icon className="w-12 h-12" style={{ color: stat.color }} /></div>
                    <span className="text-xs font-semibold mb-2 z-10 tracking-wide" style={{ color: stat.color }}>{stat.label}</span>
                    <span className="text-4xl font-display italic font-bold text-text-primary z-10 leading-none">{stat.value !== undefined && stat.value !== null ? Number(stat.value).toFixed(1) : '-'}</span>
                    <span className="text-[10px] font-bold mt-3 px-3 py-1 rounded-full z-10" style={{ backgroundColor: status.color + '20', color: status.color }}>{status.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recommended Cities (ML Engine) — moved above chart */}
        {mlCities && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-surface border border-stroke rounded-3xl p-6"
          >
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-[#00D4AA]" />
              <h3 className="font-semibold text-lg">Cities by Air Quality</h3>
              <span className="text-[10px] font-bold uppercase bg-[#00D4AA]/10 text-[#00D4AA] px-2 py-0.5 rounded-full ml-auto border border-[#00D4AA]/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] animate-pulse" /> Live ML Sort
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: 'Good', label: 'Good', color: '#00E676' },
                { key: 'Moderate', label: 'Moderate', color: '#FFE57F' },
                { key: 'Bad', label: 'Bad', color: '#FF9E40' },
                { key: 'Worst', label: 'Worst', color: '#FF5252' }
              ].map(({ key, label, color }) => {
                const cities = mlCities[key]?.filter((city: any) => city.country === 'India') || [];
                if (cities.length === 0) return null;
                
                return (
                  <div key={key} className="bg-bg/40 border border-stroke rounded-3xl p-5 flex flex-col max-h-96">
                    <h4 className="font-bold text-sm mb-4 pb-3 border-b border-stroke flex items-center justify-between sticky top-0 bg-bg/40 backdrop-blur-md z-10" style={{ color }}>
                      {label} <span className="text-[10px] font-mono text-muted bg-bg px-2 py-0.5 rounded-full border border-stroke">{cities.length}</span>
                    </h4>
                    <div className="space-y-2 overflow-y-auto pr-2 scrollbar-hide flex-1 pb-4">
                      {cities.slice(0, 10).map((city: any, i: number) => (
                        <div key={i} className="bg-surface border border-stroke rounded-2xl p-3 flex justify-between items-center group hover:border-current transition-colors" style={{ color }}>
                          <div className="overflow-hidden min-w-0 pr-2">
                            <div className="text-xs font-bold text-text-primary truncate">{city.city}</div>
                            <div className="text-[10px] text-muted truncate">{city.country}</div>
                          </div>
                          <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className="text-base font-display italic font-bold leading-none" style={{ color }}>{city.avg_aqi}</span>
                            <span className="text-[8px] uppercase font-bold mt-1 tracking-wider opacity-60 text-muted">{city.dominant_pollutant}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* 24-Hour Trend — Histogram */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="bg-surface border border-stroke rounded-3xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg">How has the air changed today?</h3>
            <select 
              value={trendMetric}
              onChange={(e) => setTrendMetric(e.target.value)}
              className="bg-bg border border-stroke rounded-lg px-3 py-1 text-sm text-muted focus:outline-none focus:border-[#00D4AA]"
            >
              <option value="pm25">Fine Dust (PM2.5)</option>
              <option value="aqi">Air Quality Score (AQI)</option>
            </select>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.85}/>
                    <stop offset="95%" stopColor="#00D4AA" stopOpacity={0.25}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--stroke)', borderRadius: '12px' }}
                  itemStyle={{ color: 'var(--text)' }}
                />
                <Bar dataKey={trendMetric} fill="url(#colorTrend)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
