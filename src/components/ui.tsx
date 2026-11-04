import { compass } from '../lib/geo'
import { LEVEL_COLOR, type NightStats } from '../lib/score'
import type { PlaceKind } from '../lib/types'

/* ---------- Ilustración por tipo de sitio (nunca un hueco vacío) ---------- */
const SCENE: Record<string, [string, string, string]> = {
  refugio_libre: ['#16304a', '#e7a35f', '#1f4d3a'],
  refugio_pago: ['#23304f', '#f0b66c', '#7a4a1f'],
  parapeto: ['#1a2a44', '#c98d5c', '#4a4f57'],
  abrigo: ['#1b2c44', '#d9a066', '#5c4a3a'],
  vivac: ['#0e1b2c', '#f2a65a', '#1f4d3a'],
  deseo: ['#2a2a5a', '#ffd9a0', '#3a4a6a'],
  fuente: ['#12304a', '#8fc7e8', '#1f4d3a'],
  parking: ['#2b3f5e', '#c4bfb2', '#4a4f57'],
  cumbre: ['#1b2c44', '#ffd9a0', '#6b7280'],
}

export function Illustration({ kind, className = '' }: { kind: PlaceKind; className?: string }) {
  const [top, glow, ground] = SCENE[kind] ?? SCENE.vivac
  const id = `g-${kind}`
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={kind}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.75" stopColor={glow} />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${id})`} />
      <g fill="#fff" opacity=".8">
        <circle cx="60" cy="40" r="1.6" /><circle cx="140" cy="24" r="1.2" /><circle cx="230" cy="52" r="1.6" /><circle cx="330" cy="30" r="1.4" /><circle cx="290" cy="80" r="1" />
      </g>
      <circle cx="310" cy="120" r="26" fill="#fff6dd" opacity=".9" />
      <path d="M0 170 L90 100 L150 150 L240 80 L330 150 L400 110 V240 H0Z" fill="#46566e" opacity=".85" />
      <path d="M0 200 L110 140 L190 190 L290 130 L400 190 V240 H0Z" fill={ground} />
      <g transform="translate(80 0)">
      {(kind === 'refugio_libre' || kind === 'refugio_pago') && (
        <g><path d="M150 205 V165 L200 135 L250 165 V205Z" fill="#e9e2d3" /><path d="M140 168 L200 128 L260 168Z" fill="#6b3f26" /><rect x="188" y="180" width="24" height="25" fill="#3a2a1f" /></g>
      )}
      {kind === 'parapeto' && (
        <g fill="none" stroke="#c9c3b6" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"><path d="M150 170 V205 H250 V170" /></g>
      )}
      {kind === 'abrigo' && (
        <g><path d="M120 210 Q130 140 210 135 Q290 140 285 210Z" fill="#5a5148" /><path d="M165 210 Q175 170 210 168 Q245 170 250 210Z" fill="#14202e" /></g>
      )}
      {kind === 'vivac' && <g><path d="M200 140 L270 210 H130Z" fill="#f4efe6" /><path d="M200 170 L225 210 H175Z" fill="#14202e" /></g>}
      {kind === 'deseo' && <path d="M200 120 l14 32 35 4 -26 24 8 34 -31 -18 -31 18 8 -34 -26 -24 35 -4Z" fill="#ffd9a0" />}
      {kind === 'fuente' && <path d="M200 120 C230 160 240 175 200 205 C160 175 170 160 200 120Z" fill="#8fc7e8" />}
      </g>
    </svg>
  )
}

/* ---------- Puntuación ---------- */
export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const level = score >= 70 ? 'verde' : score >= 45 ? 'ambar' : 'rojo'
  const c = LEVEL_COLOR[level]
  const r = size / 2 - 5
  const len = 2 * Math.PI * r
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-label={`Puntuación ${score} de 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(len * score) / 100} ${len}`} />
      </svg>
      <span className="absolute font-display font-bold" style={{ fontSize: size * 0.36 }}>{score}</span>
    </div>
  )
}

export const Dot = ({ score, size = 8 }: { score: number | null; size?: number }) => (
  <span className="inline-block rounded-full" style={{ width: size, height: size, background: score == null ? 'var(--line)' : LEVEL_COLOR[score >= 70 ? 'verde' : score >= 45 ? 'ambar' : 'rojo'] }} />
)

/* ---------- Rosa de los vientos (8 sectores, se marca con un toque) ---------- */
const SECTORS = [0, 45, 90, 135, 180, 225, 270, 315]
export function WindRose({ sheltered, windFrom, onToggle, size = 148 }: { sheltered: number[]; windFrom?: number; onToggle?: (deg: number) => void; size?: number }) {
  const c = size / 2
  const R = c - 6
  const pt = (deg: number, r: number) => [c + r * Math.sin((deg * Math.PI) / 180), c - r * Math.cos((deg * Math.PI) / 180)]
  const wedge = (deg: number) => {
    const [x1, y1] = pt(deg - 22, R)
    const [x2, y2] = pt(deg + 22, R)
    return `M${c} ${c} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}Z`
  }
  return (
    <svg width={size} height={size} role="group" aria-label="Rosa de los vientos">
      {SECTORS.map((d) => {
        const on = sheltered.includes(d)
        return (
          <path key={d} d={wedge(d)} fill={on ? '#3f8a68' : 'var(--surface)'} stroke="var(--line)" strokeWidth="1.5" opacity={on ? 0.95 : 1} onClick={() => onToggle?.(d)} style={{ cursor: onToggle ? 'pointer' : 'default' }} />
        )
      })}
      {[['N', 0], ['E', 90], ['S', 180], ['O', 270]].map(([l, d]) => {
        const [x, y] = pt(d as number, R + 0)
        return <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)" pointerEvents="none" transform={`translate(${(c - x) * 0.22} ${(c - y) * 0.22})`}>{l}</text>
      })}
      {windFrom != null && (() => {
        const [x1, y1] = pt(windFrom, R + 2)
        const [x2, y2] = pt(windFrom, R * 0.35)
        return <g pointerEvents="none"><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d1553f" strokeWidth="3" strokeLinecap="round" /><circle cx={x2} cy={y2} r="4" fill="#d1553f" /></g>
      })()}
    </svg>
  )
}

/* ---------- Gráfica de la noche ---------- */
export function NightChart({ stats }: { stats: NightStats }) {
  const W = 320, H = 130, pl = 28, pr = 8, pt = 10, pb = 22
  const s = stats.series
  const t0 = s[0].t, t1 = s[s.length - 1].t
  const temps = s.map((x) => x.temp)
  const lo = Math.floor(Math.min(...temps) - 1), hi = Math.ceil(Math.max(...temps) + 1)
  const maxW = Math.max(40, ...s.map((x) => x.gust))
  const X = (t: number) => pl + ((t - t0) / (t1 - t0 || 1)) * (W - pl - pr)
  const YT = (v: number) => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb)
  const YW = (v: number) => H - pb - (v / maxW) * (H - pt - pb)
  const line = s.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)} ${YT(x.temp).toFixed(1)}`).join('')
  const bw = Math.max(3, (W - pl - pr) / s.length - 3)
  const hh = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Temperatura y viento durante la noche">
      {s.map((x) => <rect key={x.t} x={X(x.t) - bw / 2} y={YW(x.gust)} width={bw} height={H - pb - YW(x.gust)} rx="2" fill="#3a86c8" opacity=".28" />)}
      {s.map((x) => <rect key={'m' + x.t} x={X(x.t) - bw / 2} y={YW(x.wind)} width={bw} height={H - pb - YW(x.wind)} rx="2" fill="#3a86c8" opacity=".55" />)}
      <path d={`${line}L${X(t1)} ${H - pb}L${X(t0)} ${H - pb}Z`} fill="#e08a35" opacity=".12" />
      <path d={line} fill="none" stroke="#e08a35" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <text x="2" y={YT(hi) + 4} fontSize="10" fill="var(--ink-soft)">{hi}°</text>
      <text x="2" y={YT(lo) + 4} fontSize="10" fill="var(--ink-soft)">{lo}°</text>
      <text x={pl} y={H - 6} fontSize="10" fill="var(--ink-soft)">{hh(t0)}</text>
      <text x={W - pr} y={H - 6} fontSize="10" textAnchor="end" fill="var(--ink-soft)">{hh(t1)}</text>
    </svg>
  )
}

export const WindLabel = ({ dir, speed }: { dir: number; speed: number }) => <>{compass(dir)} {Math.round(speed)} km/h</>
