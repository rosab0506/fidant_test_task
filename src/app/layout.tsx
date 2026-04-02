import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fidant.AI – Usage Analytics",
  description: "Daily usage statistics for Fidant.AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
