import { Moon, Map, BookOpen, Backpack } from 'lucide-react'

export type Tab = 'dormir' | 'mapa' | 'diario' | 'mochila'
const TABS = [
  { id: 'dormir', label: 'Dormir', Icon: Moon },
  { id: 'mapa', label: 'Mapa', Icon: Map },
  { id: 'diario', label: 'Diario', Icon: BookOpen },
  { id: 'mochila', label: 'Mochila', Icon: Backpack },
] as const

export default function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl"
      style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)', borderColor: 'var(--line)', paddingBottom: 'var(--safe-b)' }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id
          return (
            <li key={id}>
              <button
                onClick={() => onChange(id)}
                aria-current={on ? 'page' : undefined}
                className="tap flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors"
                style={{ color: on ? 'var(--accent)' : 'var(--ink-soft)' }}
              >
                <Icon size={24} strokeWidth={on ? 2.4 : 1.8} />
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
