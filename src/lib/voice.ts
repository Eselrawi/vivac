// Voz del navegador (gratis y sin conexión en casi todos los móviles).
let muted = false
let voice: SpeechSynthesisVoice | null = null

export const voiceAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window
export const isMuted = () => muted
export function setMuted(m: boolean) { muted = m; if (m && voiceAvailable()) window.speechSynthesis.cancel() }

function pick() {
  if (voice) return voice
  const vs = window.speechSynthesis.getVoices()
  voice = vs.find((v) => v.lang === 'es-ES') ?? vs.find((v) => v.lang.startsWith('es')) ?? null
  return voice
}

export function speak(text: string) {
  if (muted || !voiceAvailable()) return
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-ES'
    const v = pick()
    if (v) u.voice = v
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* sin voz */ }
}
