import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Gamepad2 } from "lucide-react";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form.email, form.password, form.name);
      toast.success("Account created!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Sign-up failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12 bg-[#0A0A0A]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#007AFF] flex items-center justify-center"><Gamepad2 size={22} className="text-white" /></div>
          <span className="font-heading font-black text-2xl tracking-tight">GameVault</span>
        </div>
        <div className="gv-card p-8" data-testid="signup-card">
          <h1 className="font-heading font-black text-3xl tracking-tight">Start your collection.</h1>
          <p className="text-[#8B9BB4] text-sm mt-2 mb-8">Create your account in seconds.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="gv-section-title">Name</label>
              <input data-testid="signup-name-input" className="gv-input mt-2" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div>
              <label className="gv-section-title">Email</label>
              <input data-testid="signup-email-input" type="email" className="gv-input mt-2" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
            </div>
            <div>
              <label className="gv-section-title">Password</label>
              <input data-testid="signup-password-input" type="password" minLength={6} className="gv-input mt-2" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
            </div>
            <button type="submit" data-testid="signup-submit-button" disabled={loading} className="gv-btn-primary w-full">{loading ? "Creating..." : "Create account"}</button>
          </form>
          <div className="mt-6 text-sm text-[#8B9BB4] text-center">
            Already have an account? <Link to="/login" data-testid="back-to-login" className="text-[#007AFF] hover:text-[#3395FF]">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
