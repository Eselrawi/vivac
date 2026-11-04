import { createClient } from '@supabase/supabase-js'

// Valores públicos por diseño: la seguridad real está en las reglas RLS de la base de datos.
const URL = 'https://kyyteyjtzmerwrzrxtqi.supabase.co'
const KEY = 'sb_publishable_4HjjJgTi65LU2347jhX0dg_aKc308QY'

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const GROUP_KEY = 'vivac.group'
export const JOIN_KEY = 'vivac.join'
