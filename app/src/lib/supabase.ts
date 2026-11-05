import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_KEY as string

if (!url || !key) {
  throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_KEY no arquivo .env')
}

export const supabase = createClient(url, key)

/** Chama a função de ingestão do mesmo jeito que o ESP32 (POST /rest/v1/rpc/ingest). */
export async function ingest(token: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('ingest', { p_token: token, p: payload })
  if (error) throw error
  return data as number
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function novoToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return 'eixo_dev_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
