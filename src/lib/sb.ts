// Supabase se carga bajo demanda: pesa mucho y no hace falta para pintar la primera pantalla.
export const GROUP_KEY = 'vivac.group'
export const JOIN_KEY = 'vivac.join'

export const getSb = () => import('./supabase').then((m) => m.supabase)
