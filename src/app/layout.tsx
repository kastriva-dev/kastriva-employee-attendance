import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./PwaRegister";
export const metadata: Metadata = {
  title: { default: "Kastriva Employee Attendance", template: "%s | Kastriva Attendance" },
  description: "Smart Attendance • Better Together",
  applicationName: "Kastriva Employee Attendance",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kastriva Absensi" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.svg" },
  formatDetection: { telephone: false }
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="id"><body><PwaRegister />{children}</body></html>;
}
