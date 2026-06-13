import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Gamepad2 } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
      toast.success("If the account exists, an email was sent.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12 bg-[#0A0A0A]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#007AFF] flex items-center justify-center"><Gamepad2 size={22} /></div>
          <span className="font-heading font-black text-2xl">GameVault</span>
        </div>
        <div className="gv-card p-8" data-testid="forgot-card">
          <h1 className="font-heading font-black text-3xl tracking-tight">Reset password.</h1>
          <p className="text-[#8B9BB4] text-sm mt-2 mb-6">We'll send you a recovery link.</p>
          {sent ? (
            <div className="text-sm text-[#34C759]" data-testid="forgot-success">Check your email (and server logs in dev) for the reset link.</div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <input data-testid="forgot-email-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="gv-input" />
              <button type="submit" data-testid="forgot-submit-button" className="gv-btn-primary w-full">Send reset link</button>
            </form>
          )}
          <div className="mt-6 text-sm text-[#8B9BB4]"><Link to="/login" className="hover:text-white">← Back to sign in</Link></div>
        </div>
      </div>
    </div>
  );
}
