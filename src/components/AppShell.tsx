"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

const PUBLIC_PREFIXES = ["/s/"];
const COLLAPSED_KEY = "moxie:sidebar-collapsed";

function readCollapsedPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Initializer reads from localStorage so the saved preference applies on
  // first paint. Server-side this falls back to `false`; the client may
  // briefly render expanded before swapping if the user had it collapsed.
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedPref);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore (private mode, etc.)
    }
  }, [collapsed]);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className={`flex-1 flex flex-col min-h-screen transition-[margin] duration-200 ${
          collapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        <header className="lg:hidden bg-sidebar text-white h-14 flex items-center px-4 sticky top-0 z-30 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 -ml-1.5 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 hero-gradient rounded-lg flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-base font-semibold tracking-tight">Moxie</span>
          </div>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 py-3 sm:py-6 lg:py-8">
          {children}
        </main>
        <footer className="border-t border-border py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
            <p className="text-xs text-muted-foreground text-center">
              Moxie Management &mdash; USC Off-Campus Student Housing
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
