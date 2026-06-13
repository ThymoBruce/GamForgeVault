import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import GameCard from "@/components/GameCard";
import { Library, PlayCircle, Trophy, Clock, BookOpen, Plus } from "lucide-react";

const StatCard = ({ icon: Icon, label, value, sub, testId }) => (
  <div className="gv-card p-6" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="gv-section-title">{label}</span>
      <Icon size={18} className="text-[#8B9BB4]" />
    </div>
    <div className="mt-3 font-heading font-black text-4xl tracking-tight">{value}</div>
    {sub ? <div className="text-xs text-[#8B9BB4] mt-1">{sub}</div> : null}
  </div>
);

export default function Dashboard() {
  const { user, devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState({ total_games: 0, by_status: {}, total_play_minutes: 0, total_sessions: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [gs, st] = await Promise.all([svc.listGames(), svc.stats()]);
        setGames(gs); setStats(st);
      } catch {}
    })();
  }, [svc]);

  const playing = games.filter(g => g.status === "Playing").slice(0, 6);
  const recent = games.slice(0, 8);
  const hours = Math.round((stats.total_play_minutes || 0) / 60);

  return (
    <div className="space-y-10" data-testid="dashboard-root">
      <div>
        <div className="gv-section-title mb-2">Hello, {user?.name || "gamer"}</div>
        <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tighter leading-none">Your collection at a glance.</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard icon={Library} label="Total Games" value={stats.total_games} testId="stat-total" />
        <StatCard icon={PlayCircle} label="Playing" value={stats.by_status?.Playing || 0} testId="stat-playing" />
        <StatCard icon={Trophy} label="Completed" value={(stats.by_status?.Completed || 0) + (stats.by_status?.["100% Completed"] || 0)} testId="stat-completed" />
        <StatCard icon={Clock} label="Hours Played" value={hours} sub={`${stats.total_sessions} sessions`} testId="stat-hours" />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-2xl tracking-tight">Currently playing</h2>
          <Link to="/journal" className="gv-btn-ghost" data-testid="journal-link"><BookOpen size={16} /> Open journal</Link>
        </div>
        {playing.length === 0 ? (
          <div className="gv-card p-8 text-center">
            <div className="text-[#8B9BB4] mb-4">You aren't playing anything yet.</div>
            <Link to="/add" className="gv-btn-primary inline-flex" data-testid="empty-add-link"><Plus size={16} /> Add a game</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {playing.map((g) => <GameCard key={g.game_id} game={g} />)}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-2xl tracking-tight">Recently added</h2>
          <Link to="/catalog" className="gv-btn-ghost" data-testid="catalog-link">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="gv-card p-8 text-center text-[#8B9BB4]">No games yet. Time to start your vault.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recent.map((g) => <GameCard key={g.game_id} game={g} />)}
          </div>
        )}
      </section>
    </div>
  );
}
