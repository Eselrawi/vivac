import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.error('Vivac:', e) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid h-full place-items-center p-8 text-center" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <div>
          <p className="text-5xl">🏔️</p>
          <h1 className="mt-4 text-2xl font-semibold">Algo no ha ido bien</h1>
          <p className="mt-2" style={{ color: 'var(--ink-soft)' }}>Tus vivacs y tu material están a salvo en el móvil. Vuelve a abrir la app.</p>
          <button onClick={() => location.reload()} className="tap mt-6 rounded-2xl px-6 py-3 text-lg font-bold text-white" style={{ background: 'var(--accent)' }}>Reintentar</button>
        </div>
      </div>
    )
  }
}
