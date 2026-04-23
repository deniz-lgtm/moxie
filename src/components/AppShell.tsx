"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

const PUBLIC_PREFIXES = ["/s/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <header className="lg:hidden bg-sidebar text-white h-14 flex items-center px-4 sticky top-0 z-40">
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
