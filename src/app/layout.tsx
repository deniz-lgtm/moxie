import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";
import "./admin-theme.css";
import { Sidebar } from "@/components/Sidebar";

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
        <div className="min-h-screen flex">
          <Sidebar />

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
            {/* Top bar (mobile) */}
            <header className="lg:hidden bg-sidebar text-white h-16 flex items-center justify-center px-4 sticky top-0 z-40 border-b border-white/10">
              <Image 
                src="/moxie-logo.png" 
                alt="Moxie Management" 
                width={48} 
                height={48}
                className="w-12 h-12 object-contain"
              />
            </header>

            <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 py-6 sm:py-8">
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
      </body>
    </html>
  );
}
