// Admin layout — dark champagne sidebar + topbar, separate from the customer
// Navbar/Footer. Wraps every /admin/* route. The <AdminRouteGuard/> child
// decides whether the requested admin page is actually reachable.

import React, { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut, Menu } from "lucide-react";

import { useAdmin } from "../lib/adminAuth.jsx";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/collection-tiles", label: "Collection Tiles" },
  { to: "/admin/paara-irl", label: "Paara IRL" },
  { to: "/admin/paara-story", label: "PAARA Story" },
  { to: "/admin/worn-by-you", label: "Worn by You" },
  { to: "/admin/coupons-loyalty", label: "Coupons & Loyalty" },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/customers", label: "Customers" },
  { to: "/admin/profile", label: "Profile" },
];

function AdminRouteGuard() {
  const { token, loginStep } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const isPasswordSetupRoute = loginStep === "password-change" && location.pathname.startsWith("/admin/profile");

  useEffect(() => {
    const lockedUrl = `${location.pathname}${location.search}${location.hash}`;
    window.history.pushState({ adminLock: true }, "", lockedUrl);
    const handlePopState = () => {
      if (!window.location.pathname.startsWith("/admin")) {
        window.history.pushState({ adminLock: true }, "", lockedUrl);
        navigate(lockedUrl, { replace: true });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [location.pathname, location.search, location.hash, navigate]);

  if (isPasswordSetupRoute) {
    return <Outlet />;
  }

  if (!token || loginStep !== "authenticated") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function Sidebar({ onClose }) {
  return (
    <aside className="flex h-full w-64 flex-col bg-shell text-cocoa font-body border-r border-gold/25">
      <div className="flex items-center gap-3 px-6 pt-7 pb-6 border-b border-gold/25">
        <div className="h-10 w-10 grid place-items-center rounded-full border border-gold/60 text-gold font-display text-xl">P</div>
        <div>
          <p className="font-display text-lg tracking-[.18em] text-cocoa">Paara.</p>
          <p className="text-[10px] uppercase tracking-[.28em] text-cocoa/60">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `block rounded-md px-4 py-3 text-sm tracking-[.12em] uppercase transition-colors ${
                isActive
                  ? "bg-gold text-sand"
                  : "text-cocoa/70 hover:text-cocoa hover:bg-sand"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 pb-6 pt-2 border-t border-gold/20 text-[10px] uppercase tracking-[.22em] text-cocoa/45">
        v1.0 · Internal
      </div>
    </aside>
  );
}

export default function AdminLayout() {
  const { admin, logout } = useAdmin();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-sand text-cocoa font-body">
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-cocoa/30"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0"
            >
              <Sidebar onClose={() => setDrawerOpen(false)} />
            </motion.div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-30 bg-sand/95 backdrop-blur border-b border-gold/25">
            <div className="flex items-center justify-between gap-4 px-5 md:px-10 py-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Open menu"
                  onClick={() => setDrawerOpen(true)}
                  className="md:hidden text-gold hover:text-cocoa"
                >
                  <Menu size={22} />
                </button>
                <Link to="/admin/dashboard" className="font-display text-xl tracking-[.16em] text-cocoa">
                  Paara. Admin
                </Link>
              </div>

              <div className="flex items-center gap-4">
                {admin && (
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full overflow-hidden border border-gold/40 bg-shell grid place-items-center text-xs text-gold">
                      {admin.profile_image_url ? (
                        <img src={admin.profile_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span>{(admin.name || admin.email || "A").slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="leading-tight">
                      <p className="text-sm text-cocoa">{admin.name || "Admin"}</p>
                      <p className="text-[10px] uppercase tracking-[.16em] text-cocoa/55">{admin.email}</p>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[.18em] text-cocoa border border-gold hover:bg-gold hover:text-sand transition-colors"
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-5 md:px-10 py-8 overflow-x-auto">
            <AdminRouteGuard />
          </main>
        </div>
      </div>
    </div>
  );
}