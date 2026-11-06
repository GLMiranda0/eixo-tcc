import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_KEY as string

if (!url || !key) {
  throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_KEY no arquivo .env')
}

/**
 * Link de e-mail que abriu o app (convite, confirmação de conta, link de acesso).
 * O Supabase volta com #access_token=…&type=invite|signup|magiclink|recovery, ou com #error_description=…
 * quando o link expirou. Lido antes de criar o cliente, que limpa a URL ao consumir o token.
 */
export const linkEmail: { tipo: string | null; erro: string | null } = (() => {
  try {
    const h = new URLSearchParams(window.location.hash.slice(1))
    const q = new URLSearchParams(window.location.search)
    return { tipo: h.get('type'), erro: h.get('error_description') ?? q.get('error_description') }
  } catch {
    return { tipo: null, erro: null }
  }
})()

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
