import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import { Clock, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

export default function Journal() {
  const { devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const [sessions, setSessions] = useState([]);
  const [playingGames, setPlayingGames] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [ses, gs] = await Promise.all([svc.listAllSessions(), svc.listGames({ status: "Playing" })]);
        setSessions(ses); setPlayingGames(gs);
      } catch {}
    })();
  }, [svc]);

  const totalMin = sessions.reduce((a, s) => a + (s.duration_minutes || 0), 0);

  return (
    <div className="space-y-10" data-testid="journal-root">
      <div>
        <div className="gv-section-title mb-2">Gaming journal</div>
        <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tighter">Sessions & notes.</h1>
        <p className="text-[#8B9BB4] mt-2">{sessions.length} sessions · {(totalMin/60).toFixed(1)} hours total</p>
      </div>

      <section>
        <h2 className="font-heading font-bold text-2xl mb-4">Currently playing</h2>
        {playingGames.length === 0 ? (
          <div className="gv-card p-6 text-[#8B9BB4]">Mark a game as "Playing" to start logging sessions.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {playingGames.map((g) => (
              <Link to={`/games/${g.game_id}`} key={g.game_id} className="gv-card p-4 flex gap-3 items-center" data-testid={`playing-card-${g.game_id}`}>
                <img src={g.cover_url} alt="" className="w-14 h-20 object-cover rounded bg-[#1A1A1A]" />
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold line-clamp-1">{g.title}</div>
                  <div className="text-xs text-[#8B9BB4] mt-1">{g.platform}</div>
                  <div className="text-xs text-[#007AFF] mt-2 flex items-center gap-1"><BookOpen size={12} /> Open journal →</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading font-bold text-2xl mb-4">All sessions</h2>
        {sessions.length === 0 ? (
          <div className="gv-card p-6 text-[#8B9BB4]">No sessions logged yet.</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Link key={s.session_id} to={`/games/${s.game_id}`} className="gv-card p-4 flex items-center gap-4" data-testid={`session-row-${s.session_id}`}>
                <img src={s.game?.cover_url} alt="" className="w-12 h-16 object-cover rounded bg-[#1A1A1A]" />
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold line-clamp-1">{s.game?.title || "Unknown"}</div>
                  <div className="text-xs text-[#8B9BB4] mt-1 flex items-center gap-3">
                    <span>{new Date(s.date).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {s.duration_minutes} min</span>
                  </div>
                  {s.notes && <div className="text-sm mt-1 text-white/80 line-clamp-1">{s.notes}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
