import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Gamepad2, ChromeIcon } from "lucide-react";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { Switch } from "@/components/ui/switch";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function googleLogin() {
  const redirectUrl = window.location.origin + "/auth/callback";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

export default function Login() {
  const { login, devMode, toggleDevMode } = useAuth();
  const [email, setEmail] = useState("admin@gamevault.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12 bg-[#0A0A0A]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#007AFF] flex items-center justify-center"><Gamepad2 size={22} className="text-white" /></div>
          <span className="font-heading font-black text-2xl tracking-tight">GameVault</span>
        </div>
        <div className="gv-card p-8" data-testid="login-card">
          <h1 className="font-heading font-black text-3xl tracking-tight">Welcome back.</h1>
          <p className="text-[#8B9BB4] text-sm mt-2 mb-8">Sign in to access your collection.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="gv-section-title">Email</label>
              <input data-testid="login-email-input" type="email" className="gv-input mt-2" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="gv-section-title">Password</label>
              <input data-testid="login-password-input" type="password" className="gv-input mt-2" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" data-testid="login-submit-button" disabled={loading} className="gv-btn-primary w-full">{loading ? "Signing in..." : "Sign in"}</button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-[#8B9BB4]">
            <div className="flex-1 h-px bg-white/10"></div><span>or</span><div className="flex-1 h-px bg-white/10"></div>
          </div>
          <button onClick={googleLogin} data-testid="google-login-button" className="gv-btn-secondary w-full">
            <ChromeIcon size={18} /> Continue with Google
          </button>
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/forgot-password" data-testid="forgot-password-link" className="text-[#8B9BB4] hover:text-white">Forgot password?</Link>
            <Link to="/register" data-testid="signup-link" className="text-[#007AFF] hover:text-[#3395FF]">Create account →</Link>
          </div>
          <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-[#8B9BB4]">Dev Mode</div>
              <div className="text-[10px] text-white/40">Skip auth · localStorage only</div>
            </div>
            <Switch checked={devMode} onCheckedChange={(v) => { toggleDevMode(v); if (v) navigate("/dashboard"); }} data-testid="login-dev-mode-toggle" />
          </div>
        </div>
      </div>
    </div>
  );
}
