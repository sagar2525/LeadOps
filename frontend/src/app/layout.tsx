import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export const metadata: Metadata = {
  title: "LeadOps Analytics Dashboard",
  description: "Next-gen BI view for leads and calls",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-[#18120e] text-[#231d18]">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden bg-[#f6f1e7]">
          <Topbar />
          <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(126,94,53,0.08),_transparent_30%),linear-gradient(180deg,_#f8f5ee_0%,_#f2ecdf_100%)]">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
