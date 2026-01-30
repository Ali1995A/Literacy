import type { Metadata } from "next";
import type { Viewport } from "next";
import { Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "识字小公主",
  description: "粉色风格的 5 岁识字小游戏：拼音 + 朗读 + 选择题"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={notoSansSC.className}>{children}</body>
    </html>
  );
}
