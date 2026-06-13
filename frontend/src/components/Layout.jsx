import React, { useState } from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Gamepad2, LayoutDashboard, Library, Plus, BookOpen, Users, LogOut, User, Menu } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", testId: "nav-dashboard" },
  { to: "/catalog", icon: Library, label: "My Catalog", testId: "nav-catalog" },
  { to: "/add", icon: Plus, label: "Add Game", testId: "nav-add" },
  { to: "/journal", icon: BookOpen, label: "Journal", testId: "nav-journal" },
  { to: "/friends", icon: Users, label: "Friends", testId: "nav-friends" },
  { to: "/profile", icon: User, label: "Profile", testId: "nav-profile" },
];

const NavItem = ({ to, icon: Icon, label, testId, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    data-testid={testId}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm ${
        isActive ? "bg-white/10 text-white" : "text-[#8B9BB4] hover:text-white hover:bg-white/5"
      }`
    }
  >
    <Icon size={18} strokeWidth={2} />
    <span className="font-medium">{label}</span>
  </NavLink>
);

function SidebarContent({ onNavigate }) {
  const { user, logout, devMode, toggleDevMode } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate("/login"); onNavigate?.(); };

  return (
    <div className="flex flex-col h-full">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2 px-3 mb-8" data-testid="logo-link">
        <div className="w-9 h-9 rounded-lg bg-[#007AFF] flex items-center justify-center">
          <Gamepad2 size={20} className="text-white" />
        </div>
        <span className="font-heading font-black text-xl tracking-tight">GameVault</span>
      </Link>
      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((n) => <NavItem key={n.to} {...n} onClick={onNavigate} />)}
      </nav>
      <div className="flex flex-col gap-3 mt-6 px-3 py-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#8B9BB4]">Dev Mode</div>
            <div className="text-[10px] text-white/40">LocalStorage only</div>
          </div>
          <Switch checked={devMode} onCheckedChange={toggleDevMode} data-testid="dev-mode-toggle" />
        </div>
        {user && (
          <div className="flex items-center gap-3 mt-2">
            <div className="w-9 h-9 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center overflow-hidden">
              {user.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover" /> : <User size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate" data-testid="navbar-username">{user.name || user.email}</div>
              <button onClick={handleLogout} data-testid="logout-button" className="text-xs text-[#8B9BB4] hover:text-white flex items-center gap-1">
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const currentNav = NAV_ITEMS.find((n) => location.pathname.startsWith(n.to));

  return (
    <div className="min-h-screen flex bg-[#0A0A0A]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:min-h-screen border-r border-white/10 bg-[#0A0A0A] md:sticky md:top-0 md:h-screen flex-col px-3 py-8 overflow-y-auto">
        <SidebarContent />
      </aside>

      {/* Mobile content */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0A]/80 border-b border-white/10 px-4 py-3 flex items-center justify-between" data-testid="mobile-topbar">
          <Link to="/dashboard" className="flex items-center gap-2" data-testid="mobile-logo">
            <div className="w-8 h-8 rounded-lg bg-[#007AFF] flex items-center justify-center">
              <Gamepad2 size={16} className="text-white" />
            </div>
            <span className="font-heading font-black text-lg tracking-tight">GameVault</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="gv-badge text-[10px]">{currentNav?.label || ""}</span>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button data-testid="mobile-menu-button" aria-label="Open menu" className="w-10 h-10 rounded-lg bg-[#1A1A1A] border border-white/10 flex items-center justify-center hover:bg-white/5 transition-colors">
                  <Menu size={18} />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-[#0A0A0A] border-l border-white/10 text-white w-72 p-4" data-testid="mobile-menu-drawer">
                <SidebarContent onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-5 md:px-10 py-6 md:py-12">{children}</div>
      </main>
    </div>
  );
}
