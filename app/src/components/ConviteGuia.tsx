import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { lerDecisaoGuia, salvarDecisaoGuia } from '../lib/guia'

/** Segundos até o botão "Agora não" ficar disponível. */
const ESPERA_S = 10

const ETAPAS: { titulo: string; icone: ReactNode }[] = [
  {
    titulo: 'Cadastrar um motor virtual',
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
  },
  {
    titulo: 'Configurar e instalar o coletor',
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="7" width="14" height="10" rx="2" />
        <path d="M9 7V4M15 7V4M9 20v-3M15 20v-3" />
      </svg>
    ),
  },
  {
    titulo: 'Acompanhar leituras em tempo real',
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12h4l2-5 4 10 2-5h6" />
      </svg>
    ),
  },
  {
    titulo: 'Provocar e tratar um alerta',
    icone: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
    ),
  },
]

/**
 * Convite de primeiro acesso para o Guia interativo. Aparece uma única vez, até o usuário
 * escolher "Começar o guia" ou "Agora não" (a decisão vai para os metadados do Auth).
 * Só fecha pelos botões; "Agora não" fica bloqueado nos primeiros segundos.
 */
export function ConviteGuia() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { session, perfil, papel, podeEditar, carregandoPerfil } = useAuth()
  const [respondido, setRespondido] = useState(false)
  const [restante, setRestante] = useState(ESPERA_S)
  const primario = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)

  const naRotaDoGuia = pathname === '/guia' || pathname.startsWith('/guia/')
  const aberto =
    !respondido && !!session && !carregandoPerfil && !!perfil && papel !== null && papel !== 'dev' && lerDecisaoGuia(session) === null && !naRotaDoGuia

  useEffect(() => {
    if (!aberto) return
    setRestante(ESPERA_S)
    primario.current?.focus()
    const t = window.setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          window.clearInterval(t)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [aberto])

  if (!aberto) return null

  const uid = session?.user.id
  const primeiroNome = (perfil?.nome ?? '').trim().split(/\s+/)[0]

  function comecar() {
    setRespondido(true)
    void salvarDecisaoGuia(uid, 'iniciado')
    nav('/guia')
  }

  function agoraNao() {
    if (restante > 0) return
    setRespondido(true)
    void salvarDecisaoGuia(uid, 'pulado')
  }

  /** Mantém o foco dentro do diálogo; Esc não fecha. */
  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      return
    }
    if (e.key !== 'Tab' || !card.current) return
    const focaveis = Array.from(card.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'))
    if (!focaveis.length) return
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  return (
    <div className="convite-guia-overlay">
      <div
        ref={card}
        className="card convite-guia"
        role="dialog"
        aria-modal="true"
        aria-labelledby="convite-guia-titulo"
        aria-describedby="convite-guia-desc"
        onKeyDown={teclado}
      >
        <p className="eyebrow">Primeiro acesso</p>
        <h2 id="convite-guia-titulo">{primeiroNome ? `Bem-vindo à Eixo, ${primeiroNome}` : 'Bem-vindo à Eixo'}</h2>
        <p id="convite-guia-desc" className="convite-guia-texto">
          Que tal conhecer a plataforma na prática? O guia interativo leva cerca de 5 minutos: você cadastra um motor virtual, configura e
          instala um coletor, acompanha as leituras em tempo real, provoca um alerta e faz a tratativa, sem nenhum hardware.
        </p>
        <ol className="convite-guia-etapas">
          {ETAPAS.map((et, i) => (
            <li key={et.titulo}>
              <span className="ic">{et.icone}</span>
              <span>
                <span className="muted num">{i + 1}.</span> {et.titulo}
              </span>
            </li>
          ))}
        </ol>
        {!podeEditar && (
          <p className="convite-guia-nota muted">Como seu perfil é de visualização, o guia roda em modo demonstração: nada é gravado na sua empresa.</p>
        )}
        <div className="convite-guia-acoes">
          <button ref={primario} type="button" className="btn btn-primary btn-hero" onClick={comecar}>
            Começar o guia
          </button>
          <button type="button" className="btn btn-secondary" onClick={agoraNao} disabled={restante > 0}>
            {restante > 0 ? `Agora não (${restante} s)` : 'Agora não'}
          </button>
        </div>
        <p className="convite-guia-rodape muted">Você pode abrir o guia depois, pelo menu ou pelo botão “Guia interativo” na Visão geral.</p>
      </div>
    </div>
  )
}
