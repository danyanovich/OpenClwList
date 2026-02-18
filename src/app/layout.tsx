import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawProject - OpenClaw Task Manager",
  description: "Управление задачами и проектами для OpenClaw AI-агентов. Канбан-доска, лог действий, статусы и фитбек. Создавай задачи, согласовывай контент, отслеживай работу агентов.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
