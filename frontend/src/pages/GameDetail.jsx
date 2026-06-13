import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { makeService } from "@/lib/service";
import { ArrowLeft, Trash2, Save, Upload, Plus, Clock } from "lucide-react";
import StarRating from "@/components/StarRating";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["Backlog", "Playing", "Completed", "100% Completed", "Dropped"];

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devMode } = useAuth();
  const svc = useMemo(() => makeService(devMode), [devMode]);
  const [game, setGame] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sessionForm, setSessionForm] = useState({ date: new Date().toISOString().slice(0, 10), duration_minutes: 60, notes: "" });

  const load = async () => {
    try {
      const g = await svc.getGame(id);
      setGame(g);
      const s = await svc.listSessions(id);
      setSessions(s);
    } catch { toast.error("Failed to load game"); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, devMode]);

  const update = async (patch) => {
    setSaving(true);
    try {
      const u = await svc.updateGame(id, patch);
      setGame(u);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm("Delete this game?")) return;
    await svc.deleteGame(id);
    toast.success("Deleted");
    navigate("/catalog");
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const r = await svc.uploadFile(file);
      const gallery = [...(game.gallery || []), r.url];
      await update({ gallery });
    } catch { toast.error("Upload failed"); }
  };

  const addSession = async (e) => {
    e.preventDefault();
    try {
      await svc.addSession(id, sessionForm);
      setSessionForm({ date: new Date().toISOString().slice(0, 10), duration_minutes: 60, notes: "" });
      setSessions(await svc.listSessions(id));
      toast.success("Session logged");
    } catch { toast.error("Failed to log session"); }
  };

  if (!game) return <div className="text-[#8B9BB4]">Loading…</div>;

  return (
    <div className="space-y-10" data-testid="game-detail-root">
      <Link to="/catalog" className="gv-btn-ghost" data-testid="back-to-catalog"><ArrowLeft size={16} />Back to catalog</Link>
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <div className="aspect-[3/4] gv-card overflow-hidden">
            <img src={game.cover_url || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80"} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="md:col-span-2 space-y-6">
          <div>
            <div className="gv-section-title mb-2">{game.platform} · {game.release_year || "?"}</div>
            <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tighter" data-testid="game-title">{game.title}</h1>
            <div className="text-[#8B9BB4] mt-2">{game.genre}</div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px]">
              <label className="gv-section-title">Status</label>
              <Select value={game.status} onValueChange={(v) => update({ status: v })}>
                <SelectTrigger data-testid="status-select" className="bg-[#0A0A0A] border-white/10 mt-2"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#121212] border-white/10 text-white">{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="gv-section-title">Rating</label>
              <div className="mt-2"><StarRating value={game.rating || 0} onChange={(v) => update({ rating: v })} /></div>
            </div>
            <button onClick={remove} data-testid="delete-game-button" className="gv-btn-ghost text-[#FF3B30] hover:text-[#FF3B30] ml-auto"><Trash2 size={16} /> Delete</button>
          </div>

          <div>
            <label className="gv-section-title">Review / Notes</label>
            <textarea data-testid="review-textarea" defaultValue={game.review || ""} onBlur={(e) => update({ review: e.target.value })} rows={4} className="gv-input mt-2" placeholder="Write your thoughts..." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="gv-section-title">Gallery</label>
              <label className="gv-btn-secondary cursor-pointer" data-testid="upload-photo-label">
                <Upload size={14} /> Upload
                <input data-testid="upload-photo-input" type="file" accept="image/*" className="hidden" onChange={onUpload} />
              </label>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {(game.gallery || []).map((url, i) => (
                <div key={i} className="aspect-square bg-[#1A1A1A] rounded-lg overflow-hidden border border-white/10">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {(game.gallery || []).length === 0 && <div className="col-span-full text-[#8B9BB4] text-sm">No photos yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {game.status === "Playing" && (
        <section className="border-t border-white/10 pt-10">
          <h2 className="font-heading font-bold text-2xl tracking-tight mb-4">Log a session</h2>
          <form onSubmit={addSession} className="gv-card p-5 grid md:grid-cols-4 gap-3 items-end" data-testid="session-form">
            <div>
              <label className="gv-section-title">Date</label>
              <input data-testid="session-date" type="date" value={sessionForm.date} onChange={e => setSessionForm({...sessionForm, date: e.target.value})} className="gv-input mt-2" required />
            </div>
            <div>
              <label className="gv-section-title">Duration (min)</label>
              <input data-testid="session-duration" type="number" min={1} value={sessionForm.duration_minutes} onChange={e => setSessionForm({...sessionForm, duration_minutes: Number(e.target.value)})} className="gv-input mt-2" required />
            </div>
            <div className="md:col-span-2">
              <label className="gv-section-title">Notes</label>
              <input data-testid="session-notes" value={sessionForm.notes} onChange={e => setSessionForm({...sessionForm, notes: e.target.value})} placeholder="What did you accomplish?" className="gv-input mt-2" />
            </div>
            <button type="submit" data-testid="session-submit" className="gv-btn-primary md:col-span-4 md:w-auto"><Plus size={16} /> Log session</button>
          </form>
          <div className="mt-6 space-y-3">
            {sessions.map((s) => (
              <div key={s.session_id} className="gv-card p-4 flex items-start gap-4">
                <div className="text-center pr-4 border-r border-white/10">
                  <div className="text-xs uppercase tracking-wider text-[#8B9BB4]">{new Date(s.date).toLocaleDateString(undefined, { month: "short" })}</div>
                  <div className="font-heading font-black text-2xl leading-none">{new Date(s.date).getDate()}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[#8B9BB4] text-sm"><Clock size={14} /> {s.duration_minutes} min</div>
                  {s.notes && <div className="mt-1 text-sm">{s.notes}</div>}
                </div>
              </div>
            ))}
            {sessions.length === 0 && <div className="text-[#8B9BB4] text-sm">No sessions yet.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
