import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { linkEmail, supabase } from './supabase'
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
  /** usuário logado sem empresa e sem convite pendente: o app pede o cadastro da empresa */
  precisaEmpresa: boolean
  /** chegou pelo link do e-mail de convite: falta definir nome e senha */
  chegouPorConvite: boolean
  setChegouPorConvite: (v: boolean) => void
  /** chegou pelo link de confirmação de conta */
  emailConfirmado: boolean
  /** o link do e-mail expirou ou já foi usado */
  erroLink: string | null
  limparErroLink: () => void
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
  precisaEmpresa: false,
  chegouPorConvite: false,
  setChegouPorConvite: () => {},
  emailConfirmado: false,
  erroLink: null,
  limparErroLink: () => {},
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
  const [precisaEmpresa, setPrecisaEmpresa] = useState(false)
  const [chegouPorConvite, setChegouPorConvite] = useState(linkEmail.tipo === 'invite')
  const [erroLink, setErroLink] = useState<string | null>(linkEmail.erro)
  const emailConfirmado = linkEmail.tipo === 'signup' || linkEmail.tipo === 'email'

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
    const ler = async () => (await supabase.from('perfis').select('*').eq('id', uid).maybeSingle()).data as Perfil | null
    let p = await ler()
    let semEmpresa = false
    // sem empresa: primeiro procura um convite pendente para o e-mail (migração 004)
    if (!p || (p.papel !== 'dev' && !p.conta_id)) {
      const { data: r, error } = await supabase.rpc('vincular_convite')
      if (!error) {
        if (r !== 'vinculado' || !p) p = await ler()
        semEmpresa = r === 'sem_empresa'
      }
    }
    setPerfil(p)
    setPrecisaEmpresa(semEmpresa)
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
        precisaEmpresa: !!uid && precisaEmpresa,
        chegouPorConvite: !!uid && chegouPorConvite,
        setChegouPorConvite,
        emailConfirmado,
        erroLink,
        limparErroLink: () => setErroLink(null),
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
