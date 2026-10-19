import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NNT Studio — Client Portal",
  description: "A shared space for thoughtful projects. Briefs, milestones, files and feedback, from first idea to final delivery.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
