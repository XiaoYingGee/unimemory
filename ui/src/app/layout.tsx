import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniMemory",
  description: "AI Agent 统一记忆管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
