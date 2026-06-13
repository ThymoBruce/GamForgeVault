import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import GameCard from "@/components/GameCard";
import { ArrowLeft } from "lucide-react";

export default function FriendCatalog() {
  const { id } = useParams();
  const { devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const [data, setData] = useState({ user: null, games: [] });

  useEffect(() => { (async () => { try { setData(await svc.friendGames(id)); } catch {} })(); }, [svc, id]);

  return (
    <div className="space-y-8" data-testid="friend-catalog-root">
      <Link to="/friends" className="gv-btn-ghost"><ArrowLeft size={16} /> Back to friends</Link>
      <div>
        <div className="gv-section-title mb-2">Friend's catalog</div>
        <h1 className="font-heading font-black text-4xl tracking-tighter">{data.user?.name || data.user?.email || "—"}</h1>
        <p className="text-[#8B9BB4] mt-1">{data.games.length} titles</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {data.games.map(g => <GameCard key={g.game_id} game={g} />)}
      </div>
    </div>
  );
}
