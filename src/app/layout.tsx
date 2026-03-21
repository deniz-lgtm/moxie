import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moxie Management",
  description: "Property management tools for USC off-campus student housing",
};

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/unit-turns", label: "Unit Turns" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/leasing", label: "Leasing" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen flex flex-col">
          {/* Top Nav */}
          <header className="bg-[#9d1535] text-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <Link href="/" className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                    <span className="text-[#9d1535] font-bold text-sm">M</span>
                  </div>
                  <span className="text-lg font-semibold tracking-tight">
                    Moxie Management
                  </span>
                </Link>
                <nav className="flex items-center gap-1">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-border py-4">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <p className="text-sm text-muted-foreground text-center">
                Moxie Management &mdash; USC Off-Campus Student Housing
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
