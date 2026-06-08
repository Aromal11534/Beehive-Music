import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Beehive | Discord Music Control Panel",
  description: "Premium Discord music bot control panel with advanced playback controls, playlists, and server management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico?v=5" type="image/x-icon" sizes="any" />
      </head>
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        <AuthProvider>
          {children}
          <Toaster 
            theme="dark" 
            position="bottom-right" 
            toastOptions={{
              style: {
                background: 'rgba(24, 24, 27, 0.85)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
              },
              className: 'rounded-2xl shadow-2xl font-semibold tracking-tight text-sm',
            }} 
          />
        </AuthProvider>
      </body>
    </html>
  );
}
