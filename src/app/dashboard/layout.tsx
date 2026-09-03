'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: '💬' },
  { href: '/dashboard/automation', label: 'Automation', icon: '⚡' },
  { href: '/dashboard/logs', label: 'Logs', icon: '📋' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-bold text-slate-950">
              E
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              Emote<span className="text-emerald-400"> Platform</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 ring-2 ring-emerald-400/20" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-0 px-4 py-6 sm:px-6 lg:px-8">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/5'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Nav */}
        <div className="mb-4 flex gap-1 overflow-x-auto lg:hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Main Content */}
        <main className="min-w-0 flex-1 lg:pl-8">{children}</main>
      </div>
    </div>
  );
}
