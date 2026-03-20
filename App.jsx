import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer 
} from 'recharts';
import { 
  ThermometerSnowflake, Droplets, MapPin, Settings2, AlertTriangle, 
  Activity, Clock, ChevronDown, ChevronUp, Check, X, Download, Plus, Sparkles, Bot, Trash2
} from 'lucide-react';

const apiKey = ""; // Gemini API Key
const FARMS = {
  "Waldo": "https://forecast.weather.gov/MapClick.php?lon=-82.159&lat=29.747",
  "BRB": "https://forecast.weather.gov/MapClick.php?lon=-82.34519004821777&lat=28.45078252975948",
  "Center Hill": "https://forecast.weather.gov/MapClick.php?lon=-82.07756996154784&lat=28.547735226713513",
  "Zephyrhills": "https://forecast.weather.gov/MapClick.php?lon=-82.08160400390625&lat=28.247487331337695",
  "Williston": "https://forecast.weather.gov/MapClick.php?lat=29.3877&lon=-82.4455",
  "Umatilla": "https://forecast.weather.gov/MapClick.php?lon=-81.74165185329217&lat=28.963247121602578",
  "Mount Dora": "https://forecast.weather.gov/MapClick.php?lon=-81.65519714355466&lat=28.736154891411473",
  "Eustis": "https://forecast.weather.gov/MapClick.php?lon=-81.64179280400275&lat=28.879401845760512",
  "Lake Placid": "https://forecast.weather.gov/MapClick.php?lon=-81.569&lat=27.356",
  "Newberry": "https://forecast.weather.gov/MapClick.php?lat=29.6466&lon=-82.6067",
  "Interlachen": "https://forecast.weather.gov/MapClick.php?lat=29.6264&lon=-81.8886",
  "Zolfo Springs": "https://forecast.weather.gov/MapClick.php?lat=27.4945&lon=-81.7986",
};

const CHART_COLORS = ["#059669", "#2563eb", "#dc2626", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#ea580c"];

const calculateWetBulbStull = (tempF, rhPct) => {
  const rh = Math.max(0.000001, Math.min(100.0, parseFloat(rhPct)));
  const tC = (parseFloat(tempF) - 32.0) * 5.0 / 9.0;
  const twC = tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
      + Math.atan(tC + rh)
      - Math.atan(rh - 1.676331)
      + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
      - 4.686035;
  return (twC * 9.0 / 5.0) + 32.0;
};

const parseLatLon = (text) => {
  let s = text.trim().replace(/°/g, ''); 
  try {
    const url = new URL(s);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    if (lat && lon) return { lat: parseFloat(lat), lon: parseFloat(lon) };
  } catch (e) {}
  let m = s.match(/(-?\d+(?:\.\d+)?)\s*[,|\s]+\s*(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  throw new Error(`Could not parse coordinates from: "${text}"`);
};

const formatDate = (dateObj) => {
  if (!dateObj) return "—";
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(dateObj);
};

function App() {
  const [selectedFarms, setSelectedFarms] = useState([]);
  const [threshold, setThreshold] = useState(28.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Persistent Extra Locations logic
  const [extraLocations, setExtraLocations] = useState(() => {
    const saved = localStorage.getItem('frostguard_custom_locs');
    return saved ? JSON.parse(saved) : [];
  });

  const [newFarmName, setNewFarmName] = useState("");
  const [newFarmLat, setNewFarmLat] = useState("");
  const [newFarmLon, setNewFarmLon] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    localStorage.setItem('frostguard_custom_locs', JSON.stringify(extraLocations));
  }, [extraLocations]);

  const handleAddLocation = () => {
    if (!newFarmLat || !newFarmLon) return;
    const name = newFarmName.trim() || `Custom ${extraLocations.length + 1}`;
    const lat = parseFloat(newFarmLat);
    const lon = parseFloat(newFarmLon);

    if (isNaN(lat) || isNaN(lon)) {
      alert("Please enter valid numerical coordinates.");
      return;
    }

    setExtraLocations([...extraLocations, { name, lat, lon, selected: true }]);
    setNewFarmName("");
    setNewFarmLat("");
    setNewFarmLon("");
  };

  const toggleExtraLocation = (index) => {
    const updated = [...extraLocations];
    updated[index].selected = !updated[index].selected;
    setExtraLocations(updated);
  };

  const removeExtraLocation = (index) => {
    setExtraLocations(extraLocations.filter((_, i) => i !== index));
  };

  const runForecast = async () => {
    setLoading(true); setError(""); setResults(null);
    try {
      let locs = selectedFarms.map(name => ({ name, ...parseLatLon(FARMS[name]) }));
      locs.push(...extraLocations.filter(l => l.selected));
      
      if (locs.length === 0) throw new Error("Please select a farm or add/select a custom location.");

      const allData = []; const summaries = []; const allEvents = []; const failedLocs = [];
      let chartDataMap = {};
      const now = new Date(); const cutoff = new Date(now.getTime() + (6 * 24 * 60 * 60 * 1000));

      for (const loc of locs) {
        try {
          const pointsRes = await fetch(`https://api.weather.gov/points/${loc.lat},${loc.lon}`);
          if (!pointsRes.ok) throw new Error("NWS Error: Coordinates out of bounds or API down.");
          const pointsData = await pointsRes.json();
          const hourlyRes = await fetch(pointsData.properties.forecastHourly);
          const hourlyData = await hourlyRes.json();
          
          let locHourlyData = [];
          for (const p of hourlyData.properties.periods) {
            const startTime = new Date(p.startTime);
            if (startTime < now || startTime > cutoff) continue;
            const wetbulbF = calculateWetBulbStull(p.temperature, p.relativeHumidity?.value);
            locHourlyData.push({ time: startTime, tempF: p.temperature, rh: p.relativeHumidity?.value, wetbulbF, atOrBelow: wetbulbF <= threshold });
            const timeKey = startTime.toISOString();
            if (!chartDataMap[timeKey]) chartDataMap[timeKey] = { time: startTime, timeStr: formatDate(startTime) };
            chartDataMap[timeKey][loc.name] = parseFloat(wetbulbF.toFixed(1));
          }

          let events = []; let inEvent = false; let eventStart = null; let lastTime = null;
          for (const row of locHourlyData) {
            if (row.atOrBelow && !inEvent) { inEvent = true; eventStart = row.time; }
            else if (!row.atOrBelow && inEvent) { events.push({ start: eventStart, end: lastTime }); inEvent = false; }
            lastTime = row.time;
          }
          if (inEvent) events.push({ start: eventStart, end: lastTime });

          let totalHrs = 0; let minWb = Math.min(...locHourlyData.map(r => r.wetbulbF));
          events.forEach(ev => {
            const dur = Math.round((ev.end - ev.start) / 3600000) + 1;
            totalHrs += dur;
            allEvents.push({ location: loc.name, startWater: ev.start, lastCritical: ev.end, duration: dur, minWetbulb: minWb });
          });

          summaries.push({ location: loc.name, totalHours: totalHrs, minWetbulb: minWb, numEvents: events.length });
          allData.push({ location: loc.name, data: locHourlyData });
        } catch (err) { failedLocs.push({ name: loc.name, reason: err.message }); }
      }
      setResults({ summaries, events: allEvents, chartData: Object.values(chartDataMap).sort((a,b) => a.time - b.time), warnings: failedLocs });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-slate-50">
      <header className="flex items-center justify-between border-b pb-6">
        <div className="flex items-center gap-3">
          <ThermometerSnowflake className="text-emerald-600 h-8 w-8" />
          <h1 className="text-2xl font-bold tracking-tight">FrostGuard <span className="text-slate-400 font-normal">| Wet-Bulb</span></h1>
        </div>
        <div className="text-xs text-slate-400 bg-white px-3 py-1 rounded-full border">America/New_York</div>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <aside className="space-y-6 bg-white p-6 rounded-2xl border shadow-sm h-fit">
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Critical Threshold (°F)</label>
            <input type="number" step="0.5" value={threshold} onChange={e => setThreshold(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-lg text-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none" />
            
            <div className="pt-4 border-t">
              <span className="text-sm font-semibold mb-3 block text-slate-700">Preset Farms</span>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(FARMS).map(f => (
                  <button key={f} onClick={() => setSelectedFarms(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                    className={`text-xs p-2.5 rounded-lg border transition text-left flex justify-between items-center ${selectedFarms.includes(f) ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'}`}>
                    <span className="truncate">{f}</span>
                    {selectedFarms.includes(f) && <Check size={14}/>}
                  </button>
                ))}
              </div>
            </div>

            {extraLocations.length > 0 && (
              <div className="pt-4 border-t">
                <span className="text-sm font-semibold mb-3 block text-slate-700">Custom Locations</span>
                <div className="space-y-2">
                  {extraLocations.map((loc, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
                      <button onClick={() => toggleExtraLocation(idx)} className={`flex-1 text-xs p-2.5 rounded-lg border transition text-left flex justify-between items-center ${loc.selected ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'bg-white text-slate-500 border-slate-200'}`}>
                        <span className="truncate">{loc.name}</span>
                        {loc.selected && <Check size={14}/>}
                      </button>
                      <button onClick={() => removeExtraLocation(idx)} className="p-2.5 text-slate-300 hover:text-red-500 transition"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full py-2 text-xs text-slate-400 flex items-center justify-center gap-1 hover:text-slate-600 transition">
              {showAdvanced ? "Hide New Farm Inputs" : "Add New Farm Coordinate"} {showAdvanced ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            </button>
            
            {showAdvanced && (
              <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 animate-in fade-in slide-in-from-top-2">
                <input placeholder="Farm Name (e.g. North Block)" value={newFarmName} onChange={e => setNewFarmName(e.target.value)} className="w-full p-2.5 text-sm border rounded-lg bg-white" />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold ml-1">Lat</label>
                    <input type="number" step="any" placeholder="28.95" value={newFarmLat} onChange={e => setNewFarmLat(e.target.value)} className="w-full p-2.5 text-sm border rounded-lg bg-white" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold ml-1">Lon</label>
                    <input type="number" step="any" placeholder="-81.75" value={newFarmLon} onChange={e => setNewFarmLon(e.target.value)} className="w-full p-2.5 text-sm border rounded-lg bg-white" />
                  </div>
                </div>
                <button onClick={handleAddLocation} className="w-full py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-black transition flex items-center justify-center gap-2 shadow-sm">
                  <Plus size={16}/> Add to List
                </button>
                <p className="text-[10px] text-slate-400 text-center italic">US Longitudes must be negative (e.g. -100.78)</p>
              </div>
            )}
          </div>
          
          <button onClick={runForecast} disabled={loading} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Activity size={20}/>}
            {loading ? "Fetching Data..." : "Run 6-Day Forecast"}
          </button>
          
          {error && <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5"/> {error}</div>}
        </aside>

        <section className="lg:col-span-2 space-y-6">
          {results ? (
            <>
              {results.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-amber-800 flex items-center gap-2"><AlertTriangle size={14}/> Failed Locations</h3>
                  {results.warnings.map((w, i) => <div key={i} className="text-xs text-amber-700"><strong>{w.name}:</strong> {w.reason}</div>)}
                </div>
              )}

              <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <h2 className="font-bold mb-4 flex items-center gap-2 text-slate-800"><Clock size={18} className="text-emerald-600"/> Actionable Freeze Events</h2>
                <div className="overflow-x-auto">
                  {results.events.length > 0 ? (
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="text-slate-400 border-b">
                        <tr><th className="py-3 font-semibold">Farm</th><th className="py-3 font-semibold">Turn ON Water</th><th className="py-3 font-semibold text-center">Duration</th><th className="py-3 text-right font-semibold">Min WB</th></tr>
                      </thead>
                      <tbody>
                        {results.events.map((ev, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-slate-50 transition">
                            <td className="py-4 font-bold text-slate-700">{ev.location}</td>
                            <td className="py-4 text-emerald-600 font-bold">{formatDate(ev.startWater)}</td>
                            <td className="py-4 text-center"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium">{ev.duration} hrs</span></td>
                            <td className="py-4 text-right font-black text-slate-900">{ev.minWetbulb.toFixed(1)}°F</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-12 text-center text-slate-400 italic">No freeze events forecasted for selected farms.</div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
                <h2 className="font-bold flex items-center gap-2 text-slate-800"><Activity size={18} className="text-emerald-600"/> 6-Day Trend View</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="timeStr" tick={{fontSize: 9, fill: '#94a3b8'}} tickMargin={10} minTickGap={50} />
                      <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} domain={['auto', 'auto']} tickFormatter={v => `${v}°`} />
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                      <Legend iconType="circle" wrapperStyle={{paddingTop: '20px', fontSize: '12px'}} />
                      <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="5 5" label={{position: 'insideTopLeft', value: 'Critical', fill: '#ef4444', fontSize: 10, fontWeight: 'bold'}} />
                      {results.summaries.map((s, i) => <Line key={s.location} type="monotone" dataKey={s.location} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2.5} activeDot={{r: 6}} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/50 text-slate-400 text-center p-8 space-y-4">
              <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100"><MapPin size={32} className="text-slate-200" /></div>
              <div>
                <p className="font-bold text-slate-500">No Forecast Loaded</p>
                <p className="text-sm max-w-xs">Select farms from the sidebar and click "Run Forecast" to see results.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
