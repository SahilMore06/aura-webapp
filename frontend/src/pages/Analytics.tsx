import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Download, Calendar, Activity, BarChart3, MapPin, Loader2, Radio, Plus, X, ChevronDown, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { AuraLogo } from '../components/AuraLogo';

const AVAILABLE_CITIES = [
  { id: 'mumbai', name: 'Mumbai', lat: 19.0760, lon: 72.8777, color: '#00D4AA' },
  { id: 'delhi', name: 'Delhi', lat: 28.6139, lon: 77.2090, color: '#FF5252' },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, color: '#0066FF' },
  { id: 'chennai', name: 'Chennai', lat: 13.0827, lon: 80.2707, color: '#FFE57F' },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.3850, lon: 78.4867, color: '#CE93D8' },
  { id: 'kolkata', name: 'Kolkata', lat: 22.5726, lon: 88.3639, color: '#FF9E40' },
  { id: 'pune', name: 'Pune', lat: 18.5204, lon: 73.8567, color: '#4FC3F7' },
  { id: 'ahmedabad', name: 'Ahmedabad', lat: 23.0225, lon: 72.5714, color: '#AED581' },
  { id: 'jaipur', name: 'Jaipur', lat: 26.9124, lon: 75.7873, color: '#F48FB1' },
  { id: 'lucknow', name: 'Lucknow', lat: 26.8467, lon: 80.9462, color: '#FFCC80' },
  { id: 'chandigarh', name: 'Chandigarh', lat: 30.7333, lon: 76.7794, color: '#80CBC4' },
  { id: 'patna', name: 'Patna', lat: 25.6093, lon: 85.1376, color: '#B39DDB' },
  { id: 'bhopal', name: 'Bhopal', lat: 23.2599, lon: 77.4126, color: '#EF9A9A' },
  { id: 'indore', name: 'Indore', lat: 22.7196, lon: 75.8577, color: '#A5D6A7' },
  { id: 'nagpur', name: 'Nagpur', lat: 21.1458, lon: 79.0882, color: '#90CAF9' },
  { id: 'visakhapatnam', name: 'Visakhapatnam', lat: 17.6868, lon: 83.2185, color: '#BCAAA4' },
];

const DEFAULT_CITY_IDS = ['mumbai', 'delhi', 'bengaluru', 'chennai'];

export function Analytics() {
  const [range, setRange] = useState('7D');
  const [cities, setCities] = useState(() => AVAILABLE_CITIES.filter(c => DEFAULT_CITY_IDS.includes(c.id)));
  const [activeCities, setActiveCities] = useState<string[]>(['mumbai', 'delhi', 'bengaluru']);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCity, setShowAddCity] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  const toggleCity = (cityId: string) => {
    setActiveCities(prev => 
      prev.includes(cityId) 
        ? prev.filter(id => id !== cityId)
        : [...prev, cityId]
    );
  };

  const addCity = (cityId: string) => {
    const city = AVAILABLE_CITIES.find(c => c.id === cityId);
    if (city && !cities.find(c => c.id === cityId)) {
      setCities(prev => [...prev, city]);
      setActiveCities(prev => [...prev, cityId]);
      setCitySearch('');
      setShowAddCity(false);
    }
  };

  const removeCity = (cityId: string) => {
    setCities(prev => prev.filter(c => c.id !== cityId));
    setActiveCities(prev => prev.filter(id => id !== cityId));
  };

  const handleExport = () => {
    if (data.length === 0) return;
    const headers = ['Date', ...activeCities.map(id => cities.find(c => c.id === id)?.name || id)];
    const rows = data.map(row => [row.fullDate, ...activeCities.map(id => row[id] ?? '')]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura_analytics_${range}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchHistoricalData = async () => {
      if (activeCities.length === 0) {
        setData([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const endDate = new Date();
        const startDate = new Date();
        
        if (range === '7D') startDate.setDate(endDate.getDate() - 7);
        else if (range === '30D') startDate.setDate(endDate.getDate() - 30);
        else if (range === '90D') startDate.setDate(endDate.getDate() - 90);
        else if (range === '1Y') startDate.setFullYear(endDate.getFullYear() - 1);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const promises = activeCities.map(async (cityId) => {
          const city = cities.find(c => c.id === cityId)!;
          const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&start_date=${startStr}&end_date=${endStr}&hourly=us_aqi`);
          const json = await res.json();
          return { cityId, data: json };
        });

        const results = await Promise.all(promises);
        
        // Process data to merge by date
        const mergedData: Record<string, any> = {};
        
        results.forEach(({ cityId, data }) => {
          if (data.hourly && data.hourly.time) {
            // Calculate daily averages to reduce data points for longer ranges
            const dailyAverages: Record<string, { sum: number, count: number }> = {};
            
            data.hourly.time.forEach((timeStr: string, index: number) => {
              const date = timeStr.split('T')[0];
              const aqi = data.hourly.us_aqi[index];
              
              if (aqi !== null && aqi !== undefined) {
                if (!dailyAverages[date]) {
                  dailyAverages[date] = { sum: 0, count: 0 };
                }
                dailyAverages[date].sum += aqi;
                dailyAverages[date].count += 1;
              }
            });

            Object.entries(dailyAverages).forEach(([date, { sum, count }]) => {
              if (!mergedData[date]) {
                const dateObj = new Date(date);
                mergedData[date] = { 
                  time: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  fullDate: date
                };
              }
              mergedData[date][cityId] = Math.round(sum / count);
            });
          }
        });

        const finalData = Object.values(mergedData).sort((a: any, b: any) => a.fullDate.localeCompare(b.fullDate));
        setData(finalData);
      } catch (err) {
        console.error('Failed to fetch historical data', err);
        setError('Failed to load analytics data.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, [range, activeCities]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen bg-bg text-text-primary p-6 pb-32 overflow-y-auto"
    >
      <div className="max-w-6xl mx-auto space-y-8">
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <AuraLogo variant="icon" width={36} height={36} />
            <div>
              <h1 className="text-2xl font-display italic">Environmental Analytics</h1>
              <p className="text-xs text-muted tracking-wide">Longitudinal Atmospheric Trend Analysis</p>
            </div>
          </div>
          
          <button
            onClick={handleExport}
            disabled={data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-stroke rounded-full hover:bg-stroke/50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Export audit trail as CSV"
          >
            <Download className="w-4 h-4 text-muted" />
            <span className="text-sm font-medium">Export Audit Trail</span>
          </button>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls Sidebar */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1 space-y-6"
          >
            <div className="bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6">
              <h3 className="text-muted font-medium mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Calendar className="w-4 h-4" /> Observation Window
              </h3>
              <div className="flex gap-2">
                {['7D', '30D', '90D', '1Y'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      range === r 
                        ? 'bg-[#00D4AA] text-bg' 
                        : 'bg-bg border border-stroke text-muted hover:bg-stroke/50 hover:text-text-primary'
                    }`}
                  >
                    {r === '7D' ? '1W' : r === '30D' ? '1M' : r === '90D' ? '3M' : r === '1Y' ? '1Y' : r}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-muted font-medium flex items-center gap-2 text-sm uppercase tracking-wider">
                  <MapPin className="w-4 h-4" /> Monitoring Stations
                </h3>
                <button
                  onClick={() => setShowAddCity(!showAddCity)}
                  className="w-7 h-7 rounded-lg bg-[#00D4AA]/10 border border-[#00D4AA]/20 flex items-center justify-center hover:bg-[#00D4AA]/20 transition-colors"
                  title="Add city"
                >
                  <Plus className="w-3.5 h-3.5 text-[#00D4AA]" />
                </button>
              </div>

              {/* Add City Dropdown */}
              {showAddCity && (
                <div className="mb-4 bg-bg border border-stroke rounded-2xl p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="Search cities..."
                      className="w-full bg-surface border border-stroke rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-[#00D4AA] transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-hide">
                    {AVAILABLE_CITIES
                      .filter(c => !cities.find(existing => existing.id === c.id))
                      .filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase()))
                      .map(city => (
                        <button
                          key={city.id}
                          onClick={() => addCity(city.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-text-primary hover:bg-surface transition-colors text-left"
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: city.color }} />
                          {city.name}
                          <Plus className="w-3 h-3 ml-auto opacity-50" />
                        </button>
                      ))}
                    {AVAILABLE_CITIES
                      .filter(c => !cities.find(existing => existing.id === c.id))
                      .filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-muted text-center py-2">No cities found</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {cities.map((city) => {
                  const isActive = activeCities.includes(city.id);
                  return (
                    <div key={city.id} className="flex items-center justify-between group">
                      <label className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => toggleCity(city.id)}>
                        <div 
                          className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                            isActive ? 'border-transparent' : 'border-muted group-hover:border-text-primary'
                          }`}
                          style={{ backgroundColor: isActive ? city.color : 'transparent' }}
                        >
                          {isActive && <span className="text-bg text-[10px] font-bold">✓</span>}
                        </div>
                        <span className={isActive ? 'text-text-primary text-sm' : 'text-muted text-sm group-hover:text-text-primary transition-colors'}>
                          {city.name}
                        </span>
                      </label>
                      {!DEFAULT_CITY_IDS.includes(city.id) && (
                        <button
                          onClick={() => removeCity(city.id)}
                          className="w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#FF5252]/10 transition-all"
                          title="Remove city"
                        >
                          <X className="w-3 h-3 text-[#FF5252]" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Redesigned Period Summary */}
            {!loading && data.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <h3 className="text-muted font-medium flex items-center gap-2 text-sm uppercase tracking-wider px-1">
                  <BarChart3 className="w-4 h-4" /> Period Summary
                </h3>
                {activeCities.map(cityId => {
                  const city = cities.find(c => c.id === cityId);
                  if (!city) return null;
                  const cityValues = data.map(d => d[cityId]).filter(v => v !== undefined);
                  const avg = cityValues.length > 0 ? Math.round(cityValues.reduce((a: number, b: number) => a + b, 0) / cityValues.length) : 0;
                  const max = cityValues.length > 0 ? Math.max(...cityValues) : 0;
                  const min = cityValues.length > 0 ? Math.min(...cityValues) : 0;
                  const status = avg <= 50 ? { label: 'Good', color: '#00E676' } : avg <= 100 ? { label: 'Moderate', color: '#FFE57F' } : avg <= 150 ? { label: 'Poor', color: '#FF9E40' } : { label: 'Bad', color: '#FF5252' };
                  const trend = cityValues.length >= 2 ? cityValues[cityValues.length - 1] - cityValues[0] : 0;
                  return (
                    <div key={cityId} className="bg-surface backdrop-blur-xl border border-stroke rounded-2xl p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full rounded-r-full" style={{ backgroundColor: city.color }} />
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: city.color }} />
                          <span className="text-sm font-semibold text-text-primary">{city.name}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: status.color + '20', color: status.color }}>{status.label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="text-center">
                          <div className="text-lg font-display italic font-bold text-text-primary">{avg}</div>
                          <div className="text-[9px] text-muted uppercase tracking-wider">Average</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-display italic font-bold" style={{ color: '#FF5252' }}>{max}</div>
                          <div className="text-[9px] text-muted uppercase tracking-wider">Peak</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-display italic font-bold" style={{ color: '#00E676' }}>{min}</div>
                          <div className="text-[9px] text-muted uppercase tracking-wider">Low</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-3">
                          <div className="h-1.5 w-full bg-stroke rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((avg / 300) * 100, 100)}%`, backgroundColor: status.color }} />
                          </div>
                        </div>
                        <div className={`flex items-center gap-0.5 text-[10px] font-bold ${trend <= 0 ? 'text-[#00E676]' : 'text-[#FF5252]'}`}>
                          {trend <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                          {Math.abs(trend)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </motion.div>

          {/* Main Chart Area */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3 bg-surface backdrop-blur-xl border border-stroke rounded-3xl p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-display italic mb-1">Atmospheric Quality Index</h2>
                <p className="text-muted text-sm">Multi-station comparative analysis over selected observation window</p>
              </div>
              <div className="flex items-center gap-2 bg-bg border border-stroke rounded-lg px-3 py-1.5">
                <Radio className="w-4 h-4 text-[#00D4AA]" />
                <span className="text-sm font-medium">Telemetry Active</span>
              </div>
            </div>

            <div className="flex-1 min-h-[400px] w-full relative">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#00D4AA]" />
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center text-[#FF5252]">
                  {error}
                </div>
              ) : data.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted">
                  Select a monitoring station to visualize atmospheric trend data.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--stroke)', borderRadius: '12px' }}
                      itemStyle={{ color: 'var(--text)' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="square" wrapperStyle={{ fontSize: '12px', color: 'var(--muted)' }} />
                    {cities.map(city => (
                      activeCities.includes(city.id) && (
                        <Bar 
                          key={city.id}
                          dataKey={city.id} 
                          name={city.name} 
                          fill={city.color} 
                          radius={[4, 4, 0, 0]}
                          opacity={0.85}
                        />
                      )
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
