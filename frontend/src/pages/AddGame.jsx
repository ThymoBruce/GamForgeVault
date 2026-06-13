import React, { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import { useNavigate } from "react-router-dom";
import BarcodeScanner from "@/components/BarcodeScanner";
import { Camera, Search, Pencil, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const STATUSES = ["Backlog", "Playing", "Completed", "100% Completed", "Dropped"];

function ManualForm({ initial = {}, onSubmit, busy }) {
  const [f, setF] = useState({
    title: "", platform: "", release_year: "", genre: "", cover_url: "", status: "Backlog",
    ...initial,
  });
  const change = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      ...f,
      release_year: f.release_year ? Number(f.release_year) : null,
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="manual-form">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="gv-section-title">Title*</label>
          <input data-testid="manual-title" required value={f.title} onChange={e=>change('title', e.target.value)} className="gv-input mt-2" />
        </div>
        <div>
          <label className="gv-section-title">Platform*</label>
          <input data-testid="manual-platform" required value={f.platform} onChange={e=>change('platform', e.target.value)} placeholder="PS5, Switch, PC…" className="gv-input mt-2" />
        </div>
        <div>
          <label className="gv-section-title">Release Year</label>
          <input data-testid="manual-year" type="number" value={f.release_year} onChange={e=>change('release_year', e.target.value)} className="gv-input mt-2" />
        </div>
        <div>
          <label className="gv-section-title">Genre</label>
          <input data-testid="manual-genre" value={f.genre} onChange={e=>change('genre', e.target.value)} className="gv-input mt-2" />
        </div>
        <div className="md:col-span-2">
          <label className="gv-section-title">Cover Image URL</label>
          <input data-testid="manual-cover" value={f.cover_url} onChange={e=>change('cover_url', e.target.value)} placeholder="https://…" className="gv-input mt-2" />
        </div>
        <div>
          <label className="gv-section-title">Status</label>
          <select data-testid="manual-status" value={f.status} onChange={e=>change('status', e.target.value)} className="gv-input mt-2">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {f.cover_url && (
        <div className="flex gap-3">
          <img src={f.cover_url} alt="" className="w-24 h-32 object-cover rounded border border-white/10" onError={(e)=>e.currentTarget.style.display='none'} />
        </div>
      )}
      <button type="submit" data-testid="manual-submit" disabled={busy} className="gv-btn-primary">{busy ? "Saving…" : "Save to catalog"}</button>
    </form>
  );
}

export default function AddGame() {
  const { devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const navigate = useNavigate();
  const [tab, setTab] = useState("search");
  const [showScanner, setShowScanner] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState({});
  const [barcode, setBarcode] = useState("");

  const search = async (e) => {
    e.preventDefault();
    if (!query) return;
    setBusy(true);
    try { setResults(await svc.rawgSearch(query)); }
    catch { toast.error("Search failed"); }
    finally { setBusy(false); }
  };

  const onBarcode = async (code) => {
    setShowScanner(false);
    setBarcode(code);
    setBusy(true);
    try {
      const data = await svc.lookupBarcode(code);
      if (data.rawg_candidates?.length) {
        setResults(data.rawg_candidates);
        setTab("search");
        toast.success(`Found ${data.rawg_candidates.length} match(es)`);
      } else if (data.title_guess) {
        setQuery(data.title_guess);
        setResults(await svc.rawgSearch(data.title_guess));
        setTab("search");
      } else {
        toast.error("No data found for this barcode — fill in manually");
        setPrefill({ barcode: code });
        setTab("manual");
      }
    } catch {
      toast.error("Lookup failed — switching to manual entry");
      setPrefill({ barcode: code });
      setTab("manual");
    } finally { setBusy(false); }
  };

  const addFromRawg = async (g) => {
    setBusy(true);
    try {
      const game = await svc.createGame({
        title: g.title, platform: g.platform, release_year: g.release_year,
        genre: g.genre, cover_url: g.cover_url, status: "Backlog",
        rawg_id: g.rawg_id, barcode: barcode || null,
      });
      toast.success("Added to catalog");
      navigate(`/games/${game.game_id}`);
    } catch { toast.error("Failed to add"); }
    finally { setBusy(false); }
  };

  const addManual = async (data) => {
    setBusy(true);
    try {
      const game = await svc.createGame(data);
      toast.success("Added to catalog");
      navigate(`/games/${game.game_id}`);
    } catch { toast.error("Failed to add"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-8" data-testid="add-game-root">
      <div>
        <div className="gv-section-title mb-2">Add to vault</div>
        <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tighter">Catalog a new game.</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="bg-[#121212] border border-white/10 p-1 gap-1">
          <TabsTrigger value="search" data-testid="tab-search" className="data-[state=active]:bg-white/10 data-[state=active]:text-white"><Search size={14} className="mr-2" />Search</TabsTrigger>
          <TabsTrigger value="scan" data-testid="tab-scan" className="data-[state=active]:bg-white/10 data-[state=active]:text-white"><Camera size={14} className="mr-2" />Scan</TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual" className="data-[state=active]:bg-white/10 data-[state=active]:text-white"><Pencil size={14} className="mr-2" />Manual</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-5">
          <form onSubmit={search} className="flex gap-3">
            <input data-testid="rawg-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search RAWG (e.g. Elden Ring)" className="gv-input flex-1" />
            <button data-testid="rawg-search-button" type="submit" disabled={busy} className="gv-btn-primary">{busy ? <Loader2 className="animate-spin" size={16} /> : "Search"}</button>
          </form>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="rawg-results">
            {results.map((r) => (
              <div key={r.rawg_id || r.title} className="gv-card p-4 flex gap-4" data-testid={`rawg-result-${r.rawg_id}`}>
                <img src={r.cover_url || ""} alt="" className="w-20 h-28 object-cover rounded bg-[#1A1A1A]" onError={(e)=>e.currentTarget.style.display='none'} />
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-base line-clamp-1">{r.title}</div>
                  <div className="text-xs text-[#8B9BB4] mt-1 line-clamp-2">{r.platform}</div>
                  <div className="text-xs text-[#8B9BB4]">{r.release_year}</div>
                  <button onClick={() => addFromRawg(r)} disabled={busy} className="gv-btn-secondary mt-3 text-sm" data-testid={`rawg-add-${r.rawg_id}`}>Add</button>
                </div>
              </div>
            ))}
            {results.length === 0 && !busy && <div className="text-[#8B9BB4] col-span-full">Type a title and hit search.</div>}
          </div>
        </TabsContent>

        <TabsContent value="scan">
          <div className="gv-card p-8 text-center">
            <Camera size={32} className="mx-auto text-[#8B9BB4] mb-3" />
            <div className="font-heading font-bold text-xl mb-2">Scan a barcode</div>
            <div className="text-[#8B9BB4] mb-6 text-sm">Use your device camera to scan an EAN/UPC. We'll look it up via eandata + RAWG.</div>
            <button onClick={() => setShowScanner(true)} className="gv-btn-primary inline-flex" data-testid="open-scanner-button"><Camera size={16} /> Open scanner</button>
          </div>
        </TabsContent>

        <TabsContent value="manual">
          <ManualForm initial={prefill} onSubmit={addManual} busy={busy} />
        </TabsContent>
      </Tabs>

      {showScanner && <BarcodeScanner onDetected={onBarcode} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
