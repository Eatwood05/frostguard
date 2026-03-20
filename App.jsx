import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer 
} from 'recharts';
import { 
  ThermometerSnowflake, Droplets, MapPin, Settings2, AlertTriangle, 
  Activity, Clock, ChevronDown, ChevronUp, Check, X, Download, Plus, Sparkles, Bot
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

const CHART_COLORS = ["#059669", "#2563eb", "#dc2626", "#d97706", "#7c3aed", "#db2777"];

const fetchGemini = async (prompt) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
};

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
  const [extraLocations, setExtraLocations] = useState([]);
  const [newFarmName, setNewFarmName] = useState("");
  const [newFarmLat, setNewFarmLat] = useState("");
  const [newFarmLon, setNewFarmLon] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [aiErrorResponses, setAiErrorResponses] = useState({});
  const [aiErrorLoading, setAiErrorLoading] = useState({});
  const [aiStrategy, setAiStrategy] = useState("");
  const [aiStrategyLoading, setAiStrategyLoading] = useState(false);

  const runForecast = async () => {
    setLoading(true); setError(""); setResults(null); setAiStrategy("");
    try {
      let locs = selectedFarms.map(name => ({ name, ...parseLatLon(FARMS[name]) }));
      locs.push(...extraLocations);
      if (locs.length === 0) throw new Error("Select a farm or add a custom location.");

      const allData = []; const summaries = []; const allEvents = []; const failedLocs = [];
      let chartDataMap = {};
      const now = new Date(); const cutoff = new Date(now.getTime() + (6 * 24 * 60 * 60 * 1000));

      for (const loc of locs) {
        try {
          const pointsRes = await fetch(`https://api.weather.gov/points/${loc.lat},${loc.lon}`);
          if (!pointsRes.ok) throw new Error("Gridpoint not found. Check if coordinates are in the US.");
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
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex items-center gap-3 border-b pb-6">
        <ThermometerSnowflake className="text-emerald-600 h-8 w-8" />
        <h1 className="text-2xl font-bold tracking-tight">FrostGuard <span className="text-slate-400 font-normal">| Wet-Bulb</span></h1>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <aside className="space-y-6 bg-white p-6 rounded-2xl border shadow-sm h-fit">
          <div className="space-y-4">
            <label className="block text-sm font-semibold">Critical Threshold (°F)</label>
            <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" />
            
            <div className="pt-4 border-t">
              <span className="text-sm font-semibold mb-2 block">Select Farms</span>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(FARMS).map(f => (
                  <button key={f} onClick={() => setSelectedFarms(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                    className={`text-xs p-2 rounded-lg border transition ${selectedFarms.includes(f) ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white text-slate-500'}`}>{f}</button>
                ))}
              </div>
            </div>

            <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-slate-400 flex items-center gap-1">Advanced Options {showAdvanced ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}</button>
            {showAdvanced && (
              <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-dashed">
                <input placeholder="Farm Name" value={newFarmName} onChange={e => setNewFarmName(e.target.value)} className="w-full p-2 text-xs border rounded" />
                <div className="flex gap-2">
                  <input placeholder="Lat" type="number" value={newFarmLat} onChange={e => setNewFarmLat(e.target.value)} className="w-1/2 p-2 text-xs border rounded" />
                  <input placeholder="Lon" type="number" value={newFarmLon} onChange={e => setNewFarmLon(e.target.value)} className="w-1/2 p-2 text-xs border rounded" />
                </div>
                <button onClick={() => { setExtraLocations([...extraLocations, {name: newFarmName || 'Custom', lat: newFarmLat, lon: newFarmLon}]); setNewFarmName(""); setNewFarmLat(""); setNewFarmLon(""); }} 
                  className="w-full py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold">+ Add Location</button>
              </div>
            )}
          </div>
          <button onClick={runForecast} disabled={loading} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition disabled:opacity-50">
            {loading ? "Calculating..." : "Run 6-Day Forecast"}
          </button>
        </aside>

        <section className="lg:col-span-2 space-y-6">
          {results ? (
            <>
              <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <h2 className="font-bold mb-4 flex items-center gap-2"><Clock size={18}/> Upcoming Critical Events</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-slate-400 border-b">
                      <tr><th className="py-3">Farm</th><th className="py-3">Turn ON</th><th className="py-3">Duration</th><th className="py-3 text-right">Min WB</th></tr>
                    </thead>
                    <tbody>
                      {results.events.map((ev, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-4 font-semibold">{ev.location}</td>
                          <td className="py-4 text-emerald-600 font-medium">{formatDate(ev.startWater)}</td>
                          <td className="py-4">{ev.duration} hrs</td>
                          <td className="py-4 text-right font-bold">{ev.minWetbulb.toFixed(1)}°F</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="h-80 bg-white p-6 rounded-2xl border shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timeStr" tick={{fontSize: 10}} />
                    <YAxis tick={{fontSize: 10}} domain={['auto', 'auto']} />
                    <Tooltip />
                    <ReferenceLine y={threshold} stroke="red" strokeDasharray="3 3" />
                    {results.summaries.map((s, i) => <Line key={s.location} type="monotone" dataKey={s.location} stroke={CHART_COLORS[i % 6]} dot={false} strokeWidth={2} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <div className="h-full flex items-center justify-center border-2 border-dashed rounded-3xl text-slate-300 font-medium">Select your farms to begin</div>}
        </section>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
