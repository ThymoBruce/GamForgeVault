import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, logout, devMode } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate("/login"); };
  return (
    <div className="space-y-8 max-w-2xl" data-testid="profile-root">
      <div>
        <div className="gv-section-title mb-2">Account</div>
        <h1 className="font-heading font-black text-4xl tracking-tighter">Profile</h1>
      </div>
      <div className="gv-card p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center overflow-hidden">
          {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover" /> : <User size={24} />}
        </div>
        <div className="flex-1">
          <div className="font-heading font-bold text-xl" data-testid="profile-name">{user?.name || "—"}</div>
          <div className="text-sm text-[#8B9BB4]" data-testid="profile-email">{user?.email}</div>
          {devMode && <div className="mt-2 gv-badge gv-status-Playing">Dev Mode</div>}
        </div>
      </div>
      <button onClick={handleLogout} data-testid="profile-logout-button" className="gv-btn-secondary text-[#FF3B30] hover:text-[#FF3B30]"><LogOut size={16} /> Sign out</button>
    </div>
  );
}
