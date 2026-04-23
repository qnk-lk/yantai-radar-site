import type { Metadata } from "next";
import "antd/dist/reset.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "烟台优先销售线索雷达",
  description: "面向烟台与胶东半岛的 MES / WMS / QMS 销售线索展示站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
