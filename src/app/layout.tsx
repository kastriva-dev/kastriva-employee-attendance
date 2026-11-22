import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Kastriva Employee Attendance", template: "%s | Kastriva Attendance" }, description: "Smart Attendance • Better Together", applicationName: "Kastriva Employee Attendance", icons: { icon: "/icon.svg", apple: "/apple-icon.svg" } };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="id"><body>{children}</body></html>; }
