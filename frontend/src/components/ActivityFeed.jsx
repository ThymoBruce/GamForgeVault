import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Plus, BookOpen, Activity, User } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityFeed({ devMode }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (devMode) { setLoading(false); return; }
    (async () => {
      try { const { data } = await api.get("/activity/feed", { params: { limit: 12 } }); setEvents(data); }
      catch {}
      finally { setLoading(false); }
    })();
  }, [devMode]);

  if (devMode) {
    return (
      <div className="gv-card p-6 text-sm text-[#8B9BB4]" data-testid="activity-dev-disabled">
        Activity feed is disabled in Dev Mode (no friends).
      </div>
    );
  }
  if (loading) return <div className="text-[#8B9BB4] text-sm">Loading activity…</div>;
  if (events.length === 0) {
    return (
      <div className="gv-card p-6 text-center" data-testid="activity-empty">
        <Activity size={24} className="mx-auto text-[#8B9BB4] mb-2" />
        <div className="text-sm text-[#8B9BB4]">No friend activity yet. Connect with friends to see their moves here.</div>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="activity-feed">
      {events.map((e, idx) => {
        const u = e.user || {};
        const g = e.game || {};
        return (
          <div key={idx} className="gv-card p-3 flex items-center gap-3" data-testid={`activity-${idx}`}>
            <div className="w-9 h-9 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
              {u.picture ? <img src={u.picture} alt="" className="w-full h-full object-cover" /> : <User size={14} />}
            </div>
            {g.cover_url ? (
              <Link to={`/friends/${u.user_id}`} className="shrink-0">
                <img src={g.cover_url} alt="" className="w-10 h-14 object-cover rounded bg-[#1A1A1A]" />
              </Link>
            ) : null}
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <span className="font-semibold">{u.name || u.email || "Someone"}</span>{" "}
                {e.type === "added" ? (
                  <span className="text-[#8B9BB4]">added <span className="text-white">{g.title}</span> to their catalog</span>
                ) : (
                  <span className="text-[#8B9BB4]">logged {Math.round((e.session?.duration_minutes || 0) / 60 * 10) / 10}h on <span className="text-white">{g.title || "a game"}</span></span>
                )}
              </div>
              <div className="text-xs text-[#8B9BB4] mt-1 flex items-center gap-2">
                {e.type === "added" ? <Plus size={12} /> : <BookOpen size={12} />}
                {timeAgo(e.ts)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
