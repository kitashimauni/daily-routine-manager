"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";

const navigation = [
  { href: "/", label: "Today", icon: "today" as const },
  { href: "/calendar", label: "Calendar", icon: "calendar" as const },
  { href: "/routines", label: "Routines", icon: "routines" as const },
  { href: "/stats", label: "Stats", icon: "stats" as const },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">R</span>
          <span>
            <span className="brand-name">routine</span>
            <span className="brand-subtitle">DAILY PRACTICE</span>
          </span>
        </Link>
        <nav className="side-nav" aria-label="メインナビゲーション">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={`side-nav-link ${isActive(pathname, item.href) ? "active" : ""}`}>
              <span className="side-nav-icon"><Icon name={item.icon} size={18} /></span>
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="side-bottom">small steps,<br />steady days.</p>
      </aside>
      <div className="main-area">
        <header className="mobile-header">
          <Link href="/" className="brand">
            <span className="brand-mark">R</span>
            <span><span className="brand-name">routine</span></span>
          </Link>
          <span className="brand-subtitle">DAILY PRACTICE</span>
        </header>
        <main>{children}</main>
        <nav className="mobile-nav" aria-label="メインナビゲーション">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={`mobile-nav-link ${isActive(pathname, item.href) ? "active" : ""}`}>
              <Icon name={item.icon} size={19} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
