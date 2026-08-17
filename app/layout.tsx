import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { RoutineProvider } from "@/lib/routine-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Routine — 毎日のルーティーン",
  description: "毎日やりたいことを、無理なく記録する。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <RoutineProvider>
          <AppShell>{children}</AppShell>
        </RoutineProvider>
      </body>
    </html>
  );
}
