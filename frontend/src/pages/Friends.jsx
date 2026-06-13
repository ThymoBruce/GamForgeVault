import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import { Link } from "react-router-dom";
import { UserPlus, Check, X, Search, Users } from "lucide-react";
import { toast } from "sonner";

export default function Friends() {
  const { devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState({ incoming: [], outgoing: [] });

  const load = async () => {
    if (devMode) return;
    try {
      const [fr, pe] = await Promise.all([svc.listFriends(), svc.listPending()]);
      setFriends(fr); setPending(pe);
    } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [devMode]);

  if (devMode) {
    return (
      <div className="space-y-6" data-testid="friends-root">
        <div>
          <div className="gv-section-title mb-2">Social</div>
          <h1 className="font-heading font-black text-4xl tracking-tighter">Friends</h1>
        </div>
        <div className="gv-card p-8 text-center text-[#8B9BB4]">Friends are disabled in Dev Mode. Switch to live mode to connect with other gamers.</div>
      </div>
    );
  }

  const search = async (e) => {
    e?.preventDefault();
    if (!q) return;
    try { setResults(await svc.searchUsers(q)); } catch {}
  };

  const sendReq = async (uid) => {
    try { await svc.sendFriendRequest(uid); toast.success("Request sent"); load(); }
    catch (err) { toast.error(err.response?.data?.detail || "Request failed"); }
  };

  return (
    <div className="space-y-10" data-testid="friends-root">
      <div>
        <div className="gv-section-title mb-2">Social</div>
        <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tighter">Friends</h1>
      </div>

      <section>
        <form onSubmit={search} className="flex gap-2">
          <input data-testid="friends-search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by email or name" className="gv-input flex-1" />
          <button data-testid="friends-search-button" className="gv-btn-primary"><Search size={16} /></button>
        </form>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map(u => (
            <div key={u.user_id} className="gv-card p-4 flex items-center justify-between" data-testid={`search-user-${u.user_id}`}>
              <div className="min-w-0">
                <div className="font-heading font-bold line-clamp-1">{u.name || u.email}</div>
                <div className="text-xs text-[#8B9BB4] line-clamp-1">{u.email}</div>
              </div>
              <button onClick={() => sendReq(u.user_id)} className="gv-btn-secondary" data-testid={`send-request-${u.user_id}`}><UserPlus size={14} /></button>
            </div>
          ))}
        </div>
      </section>

      {pending.incoming.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-2xl mb-3">Pending requests</h2>
          <div className="space-y-2">
            {pending.incoming.map(r => (
              <div key={r.request_id} className="gv-card p-4 flex items-center justify-between">
                <div>
                  <div className="font-heading font-bold">{r.from_user?.name || r.from_user?.email}</div>
                  <div className="text-xs text-[#8B9BB4]">{r.from_user?.email}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => { await svc.acceptRequest(r.request_id); toast.success("Friend added"); load(); }} className="gv-btn-primary" data-testid={`accept-${r.request_id}`}><Check size={14} /></button>
                  <button onClick={async () => { await svc.declineRequest(r.request_id); load(); }} className="gv-btn-secondary" data-testid={`decline-${r.request_id}`}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-heading font-bold text-2xl mb-3 flex items-center gap-2"><Users size={20} /> Your friends</h2>
        {friends.length === 0 ? (
          <div className="gv-card p-6 text-[#8B9BB4]">No friends yet — search above to connect.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {friends.map(f => (
              <Link to={`/friends/${f.user_id}`} key={f.user_id} className="gv-card p-4 flex items-center gap-3" data-testid={`friend-card-${f.user_id}`}>
                <div className="w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center overflow-hidden">
                  {f.picture ? <img src={f.picture} alt="" className="w-full h-full object-cover" /> : <Users size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold line-clamp-1">{f.name || f.email}</div>
                  <div className="text-xs text-[#8B9BB4] line-clamp-1">View catalog →</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
