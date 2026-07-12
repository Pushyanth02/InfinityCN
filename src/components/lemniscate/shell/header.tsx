'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfinityMark } from '../logo'
import { useLemniscate } from '../store'
import { useTheme } from 'next-themes'
import { Moon, Sun, Library, Settings, Wifi, WifiOff, ShieldCheck, Home } from 'lucide-react'

export function AppHeader({ workerOnline }: { workerOnline: boolean }) {
  const { theme, setTheme } = useTheme()
  const view = useLemniscate((s) => s.view)
  const openLanding = useLemniscate((s) => s.openLanding)
  const openLibrary = useLemniscate((s) => s.openLibrary)
  const openSettings = useLemniscate((s) => s.openSettings)

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="divider-gold" />
      <div className="bg-midnight/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <motion.button
            onClick={openLanding}
            className="group flex items-center gap-3"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            aria-label="Lemniscate home"
          >
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-amber/20 bg-linear-to-br from-plum/40 to-midnight text-amber shadow-cinema transition-colors group-hover:border-amber/40">
              <InfinityMark className="h-5 w-5" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-serif text-lg font-medium tracking-wide text-ivory">
                Lemniscate
              </span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-amber/60">
                Living Narratives
              </span>
            </span>
          </motion.button>

          <nav className="ml-4 flex items-center gap-0.5">
            <NavButton active={view === 'landing'} onClick={openLanding} icon={<Home className="h-4 w-4" />} label="Home" />
            <NavButton active={view === 'library'} onClick={openLibrary} icon={<Library className="h-4 w-4" />} label="Library" />
            <NavButton active={view === 'settings'} onClick={openSettings} icon={<Settings className="h-4 w-4" />} label="Settings" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden gap-1.5 border-amber/20 bg-amber/5 text-amber md:flex"
            >
              <ShieldCheck className="h-3 w-3" />
              Offline
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1.5 ${workerOnline ? 'border-calm/30 text-calm' : 'border-slate/30 text-slate'}`}
            >
              {workerOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span className="hidden sm:inline">{workerOnline ? 'Live' : 'Poll'}</span>
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-amber/70 hover:text-amber"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ y: 0 }}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? 'text-amber' : 'text-slate hover:text-ivory'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute inset-0 -z-10 rounded-lg bg-amber/10"
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      )}
    </motion.button>
  )
}
