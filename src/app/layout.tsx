import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthGate } from "@/components/AuthGate";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Moxie Management",
  description: "Property management tools for USC off-campus student housing",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Moxie",
  },
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
            <AppShell>
              {children}
            </AppShell>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
