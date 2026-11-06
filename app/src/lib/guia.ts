/**
 * Guia interativo: decisão do usuário (fazer / adiar / concluído) e progresso.
 * A decisão vai para os metadados do usuário no Supabase Auth (vale em qualquer dispositivo)
 * e, como reserva, para o localStorage. O progresso fica só no navegador.
 */
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Grandeza } from './types'

export type DecisaoGuia = 'iniciado' | 'concluido' | 'pulado'

const chaveDecisao = (uid: string | undefined) => 'eixo-guia-decisao-' + (uid ?? 'anon')
const chaveProgresso = (uid: string | undefined) => 'eixo-guia-progresso-' + (uid ?? 'anon')

/** Decisão já tomada pelo usuário, ou null quando ele ainda não foi perguntado. */
export function lerDecisaoGuia(session: Session | null): DecisaoGuia | null {
  const meta = (session?.user.user_metadata ?? {}) as { guia?: string }
  if (meta.guia === 'iniciado' || meta.guia === 'concluido' || meta.guia === 'pulado') return meta.guia
  try {
    const v = localStorage.getItem(chaveDecisao(session?.user.id))
    if (v === 'iniciado' || v === 'concluido' || v === 'pulado') return v
  } catch {
    /* sem storage */
  }
  return null
}

/** Grava a decisão. Dispara USER_UPDATED no Auth, então a sessão do app é atualizada sozinha. */
export async function salvarDecisaoGuia(uid: string | undefined, decisao: DecisaoGuia) {
  try {
    localStorage.setItem(chaveDecisao(uid), decisao)
  } catch {
    /* sem storage */
  }
  try {
    await supabase.auth.updateUser({ data: { guia: decisao, guia_em: new Date().toISOString() } })
  } catch {
    /* offline: fica só no navegador */
  }
}

export interface ConfigColetorGuia {
  tipo: 'eixo' | 'terceiro'
  protocolo: 'post' | 'mqtt'
  sensores: Record<Grandeza, boolean>
}

export interface ProgressoGuia {
  etapa: number
  feitas: number[]
  /** id do motor virtual (no modo demonstração, id local) */
  motorId: string | null
  /** true quando o motor vive só nesta sessão do navegador (perfil sem permissão de edição) */
  local: boolean
  config: ConfigColetorGuia | null
  /** ponto de instalação escolhido para cada sensor */
  montagem: Partial<Record<Grandeza, string>>
  /** chave já gerada para o coletor (a chave em si fica no sessionStorage) */
  chaveGerada: boolean
  conectou: boolean
  alertaTratado: boolean
}

export const PROGRESSO_VAZIO: ProgressoGuia = {
  etapa: 0,
  feitas: [],
  motorId: null,
  local: false,
  config: null,
  montagem: {},
  chaveGerada: false,
  conectou: false,
  alertaTratado: false,
}

export function lerProgresso(uid: string | undefined): ProgressoGuia | null {
  try {
    const raw = localStorage.getItem(chaveProgresso(uid))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<ProgressoGuia>
    return { ...PROGRESSO_VAZIO, ...p }
  } catch {
    return null
  }
}

export function salvarProgresso(uid: string | undefined, p: ProgressoGuia) {
  try {
    localStorage.setItem(chaveProgresso(uid), JSON.stringify(p))
  } catch {
    /* sem storage */
  }
}

export function limparProgresso(uid: string | undefined) {
  try {
    localStorage.removeItem(chaveProgresso(uid))
  } catch {
    /* sem storage */
  }
}
