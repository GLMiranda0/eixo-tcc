import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Papel, Perfil } from './types'

export interface ContaVisualizada {
  id: string
  nome: string
}

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  carregando: boolean
  /** true enquanto a sessão existe mas o perfil ainda não chegou */
  carregandoPerfil: boolean
  papel: Papel | null
  podeEditar: boolean
  isMaster: boolean
  isDev: boolean
  /** empresa que o dev está inspecionando (somente leitura) */
  contaVisualizada: ContaVisualizada | null
  setContaVisualizada: (c: ContaVisualizada | null) => void
  recarregarPerfil: () => Promise<void>
  sair: () => Promise<void>
  /** true quando o usuário chegou pelo link de recuperação de senha do e-mail */
  recuperandoSenha: boolean
  setRecuperandoSenha: (v: boolean) => void
}

const CHAVE_CONTA_VIS = 'eixo-conta-vis'

const Ctx = createContext<AuthState>({
  session: null,
  perfil: null,
  carregando: true,
  carregandoPerfil: false,
  papel: null,
  podeEditar: false,
  isMaster: false,
  isDev: false,
  contaVisualizada: null,
  setContaVisualizada: () => {},
  recarregarPerfil: async () => {},
  sair: async () => {},
  recuperandoSenha: false,
  setRecuperandoSenha: () => {},
})

function lerContaVis(): ContaVisualizada | null {
  try {
    const raw = sessionStorage.getItem(CHAVE_CONTA_VIS)
    return raw ? (JSON.parse(raw) as ContaVisualizada) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [perfilUid, setPerfilUid] = useState<string | null>(null)
  const [contaVisualizada, setContaVisState] = useState<ContaVisualizada | null>(lerContaVis)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      // link "Redefinir senha" do e-mail: o Supabase cria a sessão e avisa com este evento
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null

  const recarregarPerfil = useCallback(async () => {
    if (!uid) {
      setPerfil(null)
      setPerfilUid(null)
      return
    }
    const { data } = await supabase.from('perfis').select('*').eq('id', uid).maybeSingle()
    setPerfil(data as Perfil | null)
    setPerfilUid(uid)
  }, [uid])

  const carregandoPerfil = !!uid && perfilUid !== uid

  useEffect(() => {
    recarregarPerfil()
  }, [recarregarPerfil])

  const setContaVisualizada = useCallback((c: ContaVisualizada | null) => {
    setContaVisState(c)
    try {
      if (c) sessionStorage.setItem(CHAVE_CONTA_VIS, JSON.stringify(c))
      else sessionStorage.removeItem(CHAVE_CONTA_VIS)
    } catch {
      /* sem storage */
    }
  }, [])

  const sair = async () => {
    setContaVisualizada(null)
    await supabase.auth.signOut()
  }

  const papel = perfil && perfil.ativo !== false ? perfil.papel : null
  const isDev = papel === 'dev'

  return (
    <Ctx.Provider
      value={{
        session,
        perfil,
        carregando,
        carregandoPerfil,
        papel,
        podeEditar: papel === 'master' || papel === 'admin',
        isMaster: papel === 'master',
        isDev,
        contaVisualizada: isDev ? contaVisualizada : null,
        setContaVisualizada,
        recarregarPerfil,
        sair,
        recuperandoSenha,
        setRecuperandoSenha,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)

/**
 * conta_id efetivo para as consultas:
 * usuários normais → conta do perfil; dev → empresa em visualização (ou null).
 */
export function useContaAtiva(): {
  contaId: string | null
  isDev: boolean
  /** perfil já carregado (as consultas podem rodar) */
  pronto: boolean
  /** dev sem empresa selecionada: as listas ficam vazias */
  semEmpresa: boolean
} {
  const { perfil, isDev, contaVisualizada, carregandoPerfil } = useAuth()
  if (isDev) return { contaId: contaVisualizada?.id ?? null, isDev, pronto: true, semEmpresa: !contaVisualizada }
  return { contaId: perfil?.conta_id ?? null, isDev: false, pronto: !carregandoPerfil, semEmpresa: false }
}
