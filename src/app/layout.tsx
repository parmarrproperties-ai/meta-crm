import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/ClientLayout";
import { Agentation } from "agentation";

import { Suspense } from "react";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meta Ads Dashboard",
  description: "Monitor, analyze and report your Meta Ads performance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accountsJson = process.env.META_AD_ACCOUNTS || "[]";
  const accounts: { id: string; name: string }[] = JSON.parse(accountsJson);
  const projects = accounts.map(a => a.name);

  return (
    <html lang="en" className="light">
      <body className={`${geist.className} bg-slate-50 text-slate-900 min-h-screen`}>
        <Suspense fallback={<div>Loading...</div>}>
          <ClientLayout projects={projects}>
            {children}
          </ClientLayout>
        </Suspense>
        <Agentation />
      </body>
    </html>
  );
}
