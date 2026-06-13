import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Gamepad2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) toast.error("Reset token missing from URL.");
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. Please sign in.");
      navigate("/login");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Reset failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12 bg-[#0A0A0A]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#007AFF] flex items-center justify-center"><Gamepad2 size={22} /></div>
          <span className="font-heading font-black text-2xl">GameVault</span>
        </div>
        <div className="gv-card p-8" data-testid="reset-card">
          <h1 className="font-heading font-black text-3xl tracking-tight">Set a new password.</h1>
          <p className="text-[#8B9BB4] text-sm mt-2 mb-6">Choose something memorable.</p>
          {!token ? (
            <div className="text-sm text-[#FF3B30]" data-testid="reset-no-token">
              Reset token missing. Click the link from your email.
              <div className="mt-4"><Link to="/forgot-password" className="text-[#007AFF] hover:text-[#3395FF]">← Request a new link</Link></div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="gv-section-title">New password</label>
                <input data-testid="reset-password-input" type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="gv-input mt-2" required />
              </div>
              <div>
                <label className="gv-section-title">Confirm password</label>
                <input data-testid="reset-confirm-input" type="password" minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)} className="gv-input mt-2" required />
              </div>
              <button data-testid="reset-submit-button" disabled={loading} className="gv-btn-primary w-full">{loading ? "Saving…" : "Reset password"}</button>
            </form>
          )}
          <div className="mt-6 text-sm text-[#8B9BB4]"><Link to="/login" className="hover:text-white">← Back to sign in</Link></div>
        </div>
      </div>
    </div>
  );
}
