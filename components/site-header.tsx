"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, LayoutDashboard, Inbox, FilePlus2, FileSpreadsheet, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Home", icon: Bot },
  { href: "/submit", label: "Submit", icon: FilePlus2 },
  { href: "/triage", label: "Triage", icon: Sparkles },
  { href: "/bulk", label: "Bulk Upload", icon: FileSpreadsheet },
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/queue", label: "Review Queue", icon: Inbox },
]

export function SiteHeader() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Sentinel</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">/ AI Support Agent</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
