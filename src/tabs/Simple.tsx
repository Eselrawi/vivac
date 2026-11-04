export function Empty({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-8 pt-32 text-center">
      <div className="text-6xl">{emoji}</div>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-2" style={{ color: 'var(--ink-soft)' }}>{text}</p>
    </div>
  )
}

export const Diario = () => <Empty emoji="📖" title="Vuestro diario" text="Cada noche que durmáis fuera aparecerá aquí, con fotos y recuerdos." />
