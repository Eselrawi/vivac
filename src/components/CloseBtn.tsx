import { X } from 'lucide-react'

/** Botón grande de cerrar para los paneles: con guantes y a una mano es más fiable que arrastrar. */
export default function CloseBtn({ onClick, right = 12 }: { onClick: () => void; right?: number }) {
  return (
    <button
      type="button"
      aria-label="Cerrar"
      onClick={onClick}
      className="tap absolute top-3 z-20 grid h-11 w-11 place-items-center rounded-full shadow-md active:scale-95"
      style={{ right, background: 'var(--surface)', color: 'var(--ink)' }}
    >
      <X size={22} />
    </button>
  )
}
