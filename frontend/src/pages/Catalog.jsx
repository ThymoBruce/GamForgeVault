import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import GameCard from "@/components/GameCard";
import { Link } from "react-router-dom";
import { Plus, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["Backlog", "Playing", "Completed", "100% Completed", "Dropped"];
const SORTS = [
  { value: "created_desc", label: "Recently added" },
  { value: "alpha_asc", label: "Title A–Z" },
  { value: "alpha_desc", label: "Title Z–A" },
  { value: "year_desc", label: "Newest year" },
  { value: "year_asc", label: "Oldest year" },
];

export default function Catalog() {
  const { devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const [games, setGames] = useState([]);
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const params = {};
      if (status !== "all") params.status = status;
      if (platform) params.platform = platform;
      if (year) params.year = Number(year);
      params.sort = sort;
      try { setGames(await svc.listGames(params)); } finally { setLoading(false); }
    })();
  }, [svc, status, platform, year, sort]);

  return (
    <div className="space-y-8" data-testid="catalog-root">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="gv-section-title mb-2">Library</div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tighter">My Catalog</h1>
          <p className="text-[#8B9BB4] mt-2">{games.length} {games.length === 1 ? "title" : "titles"}</p>
        </div>
        <Link to="/add" className="gv-btn-primary self-start" data-testid="catalog-add-game"><Plus size={16} /> Add Game</Link>
      </div>

      <div className="gv-card p-5 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="catalog-filters">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="filter-status" className="bg-[#0A0A0A] border-white/10"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent className="bg-[#121212] border-white/10 text-white">
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <input data-testid="filter-platform" value={platform} onChange={e => setPlatform(e.target.value)} placeholder="Platform" className="gv-input" />
        <input data-testid="filter-year" type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="Year" className="gv-input" />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger data-testid="filter-sort" className="bg-[#0A0A0A] border-white/10"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#121212] border-white/10 text-white">
            {SORTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-[#8B9BB4]">Loading…</div>
      ) : games.length === 0 ? (
        <div className="gv-card p-12 text-center">
          <Filter size={32} className="mx-auto text-[#8B9BB4] mb-3" />
          <div className="font-heading font-bold text-xl mb-2">Empty shelf</div>
          <div className="text-[#8B9BB4] mb-6">Add your first game to get started.</div>
          <Link to="/add" className="gv-btn-primary inline-flex" data-testid="empty-state-add"><Plus size={16} /> Add Game</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" data-testid="catalog-grid">
          {games.map(g => <GameCard key={g.game_id} game={g} />)}
        </div>
      )}
    </div>
  );
}
