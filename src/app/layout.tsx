import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthGate } from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "Moxie Management",
  description: "Property management tools for USC off-campus student housing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <AuthGate>
            <div className="min-h-screen flex">
              <Sidebar />

              {/* Main Content */}
              <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
                {/* Top bar (mobile) */}
                <header className="lg:hidden bg-sidebar text-white h-14 flex items-center px-4 sticky top-0 z-40">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 hero-gradient rounded-lg flex items-center justify-center shadow-md">
                      <span className="text-white font-bold text-sm">M</span>
                    </div>
                    <span className="text-base font-semibold tracking-tight">Moxie</span>
                  </div>
                </header>

                <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
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
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
