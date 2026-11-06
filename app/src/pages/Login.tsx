import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../lib/theme'
import { useAuth } from '../lib/auth'

/**
 * 'codigo' = código de 6 dígitos (exige SMTP próprio com {{ .Token }}); 'nova' = chegou pelo link do e-mail;
 * 'enviado' = conta criada, aguardando a confirmação do e-mail; 'convite' = chegou pelo e-mail de convite.
 */
type Modo = 'entrar' | 'criar' | 'esqueci' | 'codigo' | 'nova' | 'enviado' | 'convite'

/**
 * Estado compartilhado com o roteador: enquanto a recuperação de senha está em andamento,
 * a rota /login não redireciona (o verifyOtp cria a sessão antes de a senha nova ser gravada).
 * `destino` define para onde ir depois de entrar (ex.: /guia, o Guia interativo, ao explorar em modo simulação).
 */
export const fluxoLogin = { recuperando: false, destino: '/painel' }

const REGRAS_SENHA: [string, (s: string) => boolean][] = [
  ['Pelo menos 8 caracteres', (s) => s.length >= 8],
  ['Uma letra maiúscula', (s) => /[A-Z]/.test(s)],
  ['Um número', (s) => /\d/.test(s)],
  ['Um caractere especial (!@#$…)', (s) => /[^A-Za-z0-9]/.test(s)],
]

const senhaValida = (s: string) => REGRAS_SENHA.every(([, ok]) => ok(s))

function traduzir(msg: string) {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail. Entre ou recupere a senha.'
  if (m.includes('token has expired') || m.includes('invalid token') || m.includes('otp')) return 'Código inválido ou expirado. Peça um novo código.'
  if (m.includes('different from the old password')) return 'A nova senha precisa ser diferente da atual.'
  // limite do servidor de e-mail do projeto inteiro (SMTP padrão do Supabase: poucos e-mails por hora)
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit'))
    return 'O servidor atingiu o limite de e-mails enviados por hora (vale para todo o site, não só para você). Tente de novo mais tarde.'
  // limite por e-mail: "For security purposes, you can only request this after 42 seconds."
  if (m.includes('for security purposes')) {
    const s = msg.match(/(\d+)\s*second/i)?.[1]
    return s ? `Por segurança, aguarde ${s} segundos antes de pedir outro e-mail.` : 'Por segurança, aguarde um minuto antes de pedir outro e-mail.'
  }
  if (m.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.'
  if (m.includes('password should be')) return 'A senha não atende aos requisitos mínimos.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'E-mail inválido.'
  if (m.includes('failed to fetch')) return 'Sem conexão com o servidor. Verifique a internet.'
  if (m.includes('expired') || m.includes('invalid or has expired')) return 'O link do e-mail expirou ou já foi usado. Entre com sua senha ou peça um novo e-mail.'
  return msg
}

function ChecklistSenha({ senha }: { senha: string }) {
  return (
    <ul
      aria-label="Requisitos da senha"
      style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px', fontSize: 12 }}
    >
      {REGRAS_SENHA.map(([txt, ok]) => {
        const v = ok(senha)
        return (
          <li key={txt} style={{ color: v ? 'var(--ok)' : 'var(--muted)' }}>
            {v ? '✓' : '○'} {txt}
          </li>
        )
      })}
    </ul>
  )
}

export function Login({ modoInicial = 'entrar' }: { modoInicial?: Modo }) {
  const nav = useNavigate()
  const { session, setRecuperandoSenha, setChegouPorConvite, recarregarPerfil, erroLink, limparErroLink } = useAuth()
  const meta = (session?.user.user_metadata ?? {}) as { nome?: string; empresa?: string; papel?: string; convidado_por?: string }
  const [modo, setModo] = useState<Modo>(modoInicial)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [nome, setNome] = useState(modoInicial === 'convite' ? meta.nome ?? '' : '')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(erroLink ? traduzir(erroLink) : null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  /** segundos até poder reenviar o e-mail de confirmação */
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (erroLink) limparErroLink()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function reenviarConfirmacao() {
    setErro(null)
    setAviso(null)
    setOcupado(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } })
    setOcupado(false)
    if (error) return setErro(traduzir(error.message))
    setEspera(60)
    setAviso('E-mail reenviado. Confira também a caixa de spam.')
  }

  function irPara(m: Modo) {
    setModo(m)
    setErro(null)
    setAviso(null)
    setSenha('')
    setSenha2('')
    if (m !== 'codigo') {
      setCodigo('')
      fluxoLogin.recuperando = false
    }
  }

  const link = (m: Modo, txt: string) => (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        irPara(m)
      }}
    >
      {txt}
    </a>
  )

  async function enviar(e: FormEvent, destino = '/painel') {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      if (modo === 'entrar') {
        fluxoLogin.destino = destino
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) {
          fluxoLogin.destino = '/painel'
          throw error
        }
        nav(destino)
      } else if (modo === 'criar') {
        if (!senhaValida(senha)) throw new Error('A senha não atende a todos os requisitos.')
        if (senha !== senha2) throw new Error('As senhas não conferem.')
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) {
          irPara('enviado')
          setEspera(60)
          return
        }
        nav('/painel')
      } else if (modo === 'convite') {
        if (nome.trim().length < 2) throw new Error('Informe seu nome.')
        if (!senhaValida(senha)) throw new Error('A senha não atende a todos os requisitos.')
        if (senha !== senha2) throw new Error('As senhas não conferem.')
        const { error } = await supabase.auth.updateUser({ password: senha, data: { nome: nome.trim() } })
        if (error) throw error
        const { error: e2 } = await supabase.rpc('vincular_convite', { p_nome: nome.trim() })
        if (e2) throw e2
        await recarregarPerfil()
        setChegouPorConvite(false)
        nav('/painel', { replace: true })
      } else if (modo === 'esqueci') {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        irPara('codigo')
        setAviso(`Se existir uma conta para ${email}, você vai receber um código de 6 dígitos por e-mail.`)
      } else if (modo === 'nova') {
        if (!senhaValida(senha)) throw new Error('A nova senha não atende a todos os requisitos.')
        if (senha !== senha2) throw new Error('As senhas não conferem.')
        const { error } = await supabase.auth.updateUser({ password: senha })
        if (error) throw error
        setRecuperandoSenha(false)
        nav('/painel', { replace: true })
      } else {
        if (!/^\d{6}$/.test(codigo)) throw new Error('Informe o código de 6 dígitos recebido por e-mail.')
        if (!senhaValida(senha)) throw new Error('A nova senha não atende a todos os requisitos.')
        if (senha !== senha2) throw new Error('As senhas não conferem.')
        fluxoLogin.recuperando = true
        const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'recovery' })
        if (error) throw error
        if (!data.session) throw new Error('Não foi possível validar o código. Peça um novo.')
        const { error: e2 } = await supabase.auth.updateUser({ password: senha })
        if (e2) throw e2
        fluxoLogin.recuperando = false
        nav('/painel', { replace: true })
      }
    } catch (err) {
      setErro(traduzir((err as Error).message))
    } finally {
      setOcupado(false)
    }
  }

  function simulacao(e: FormEvent) {
    if (modo === 'entrar' && email && senha) return enviar(e, '/guia')
    e.preventDefault()
    irPara('criar')
    setAviso('Crie uma conta (ou entre com a sua) para abrir o modo simulação. Ele não precisa de hardware.')
  }

  const titulo = {
    entrar: 'Entrar',
    criar: 'Criar conta',
    esqueci: 'Recuperar senha',
    codigo: 'Definir nova senha',
    nova: 'Definir nova senha',
    enviado: 'Conta criada!',
    convite: 'Bem-vindo à Eixo',
  }[modo]
  const botao = {
    entrar: 'Entrar na plataforma',
    criar: 'Criar conta',
    esqueci: 'Enviar código',
    codigo: 'Salvar nova senha',
    nova: 'Salvar nova senha',
    enviado: '',
    convite: 'Salvar e entrar',
  }[modo]
  const novaSenha = modo === 'criar' || modo === 'codigo' || modo === 'nova' || modo === 'convite'
  const bloqueado = ocupado || (novaSenha && (!senhaValida(senha) || senha !== senha2))

  return (
    <div className="login">
      <div className="hero">
        <div className="ring-bg" aria-hidden="true" />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="brand" style={{ padding: 0 }}>
            <Logo size={36} />
            <span className="word">eixo</span>
          </div>
          <ThemeToggle />
        </div>
        <div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Supervisão de motores elétricos
          </p>
          <h1>Seus motores, sob vigilância inteligente.</h1>
          <p className="muted" style={{ marginTop: 14, maxWidth: '46ch' }}>
            Corrente, temperatura e vibração em tempo real. O sistema aprende o normal de cada motor e avisa quando ele sai do padrão, com a ação corretiva
            sugerida. Funciona com o coletor Eixo (ESP32) ou com o coletor que você já tem.
          </p>
        </div>
        <div className="row muted" style={{ fontSize: 12 }}>
          <span>POST HTTPS</span>·<span>MQTT</span>·<span>ISO 10816 / IEC 60034</span>
        </div>
      </div>
      <div className="form">
        {modo === 'enviado' ? (
          <div className="card done-card" role="status">
            <div className="done-ico" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="56" height="56">
                <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" />
                <path d="M14 25l7 7 14-15" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>{titulo}</h2>
            <p className="muted">
              Falta só confirmar o seu e-mail. Enviamos um link para <b className="mono" style={{ color: 'var(--fg)' }}>{email}</b>.
            </p>
            <ol className="done-steps">
              <li>
                Abra o e-mail <b>“Confirme seu e-mail · Eixo”</b> (confira também o spam).
              </li>
              <li>
                Clique em <b>Confirmar e-mail</b>: você volta para a plataforma já conectado.
              </li>
              <li>Se você foi convidado, entra direto na empresa. Se não, cadastra a sua empresa (nome fantasia, razão social e CNPJ).</li>
            </ol>
            {erro && <p className="err">{erro}</p>}
            {aviso && <p className="muted">{aviso}</p>}
            <button className="btn btn-secondary" type="button" onClick={reenviarConfirmacao} disabled={ocupado || espera > 0}>
              {espera > 0 ? `Reenviar e-mail (${espera}s)` : ocupado ? 'Enviando…' : 'Reenviar e-mail'}
            </button>
            <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
              Já confirmou? {link('entrar', 'Entrar')} · E-mail errado? {link('criar', 'Criar de novo')}
            </p>
          </div>
        ) : (
        <form className="card" onSubmit={enviar}>
          <h2>{titulo}</h2>
          {modo === 'convite' && (
            <p className="muted">
              {meta.convidado_por ? <b style={{ color: 'var(--fg)' }}>{meta.convidado_por}</b> : 'O master da empresa'} convidou você
              {meta.empresa ? (
                <>
                  {' '}
                  para a empresa <b style={{ color: 'var(--fg)' }}>{meta.empresa}</b>
                </>
              ) : null}
              {meta.papel ? ` como ${meta.papel}` : ''}. Informe seu nome e crie uma senha para entrar.
            </p>
          )}
          {modo === 'esqueci' && <p className="muted">Informe o e-mail da sua conta. Você vai receber um e-mail com o link (ou o código de 6 dígitos) para definir uma senha nova.</p>}
          {modo === 'nova' && <p className="muted">Link de recuperação validado. Escolha a nova senha da sua conta.</p>}

          {(modo === 'criar' || modo === 'convite') && (
            <div className="field">
              <label htmlFor="l-nome">Seu nome</label>
              <input id="l-nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
            </div>
          )}

          {modo === 'convite' && (
            <div className="field">
              <label htmlFor="l-email">E-mail</label>
              <input id="l-email" type="email" value={session?.user.email ?? ''} readOnly autoComplete="username" />
            </div>
          )}

          {modo !== 'nova' && modo !== 'convite' && (
            <div className="field">
              <label htmlFor="l-email">E-mail</label>
              <input id="l-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" readOnly={modo === 'codigo'} />
              {modo === 'criar' && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Recebeu um convite? Use o mesmo e-mail: você entra direto na empresa que te convidou.
                </span>
              )}
            </div>
          )}

          {modo === 'codigo' && (
            <div className="field">
              <label htmlFor="l-codigo">Código recebido por e-mail</label>
              <input
                id="l-codigo"
                className="mono"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                required
                style={{ letterSpacing: '.3em' }}
              />
            </div>
          )}

          {modo !== 'esqueci' && (
            <div className="field">
              <label htmlFor="l-pass">{modo === 'codigo' ? 'Nova senha' : 'Senha'}</label>
              <input
                id="l-pass"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoComplete={novaSenha ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          {novaSenha && (
            <>
              <ChecklistSenha senha={senha} />
              <div className="field">
                <label htmlFor="l-pass2">Confirme a senha</label>
                <input id="l-pass2" type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} required autoComplete="new-password" />
                {senha2 && senha !== senha2 && <span className="err">As senhas não conferem.</span>}
              </div>
            </>
          )}

          {modo === 'entrar' && <p style={{ fontSize: 12, textAlign: 'right', marginTop: -6 }}>{link('esqueci', 'Esqueci a senha')}</p>}

          {erro && <p className="err">{erro}</p>}
          {aviso && <p className="muted">{aviso}</p>}

          <button className="btn btn-primary btn-hero" type="submit" disabled={bloqueado}>
            {ocupado ? 'Aguarde…' : botao} →
          </button>

          {(modo === 'entrar' || modo === 'criar') && (
            <>
              <div className="divider">ou</div>
              <button className="btn btn-secondary" type="button" onClick={(e) => simulacao(e as unknown as FormEvent)} disabled={ocupado}>
                Explorar em modo simulação
              </button>
            </>
          )}

          <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            {modo === 'entrar' ? (
              <>
                Primeira vez? {link('criar', 'Crie uma conta')}. O modo simulação não precisa de hardware.
              </>
            ) : modo === 'codigo' ? (
              <>
                Recebeu um link em vez de código? Basta abri-lo. · Não recebeu? {link('esqueci', 'Enviar de novo')} · {link('entrar', 'Voltar para entrar')}
              </>
            ) : modo === 'nova' ? (
              <>Mudou de ideia? {link('entrar', 'Voltar para entrar')}</>
            ) : modo === 'convite' ? (
              <>Depois de salvar, você entra direto na empresa.</>
            ) : (
              <>
                {modo === 'criar' ? 'Já tem conta? ' : 'Lembrou a senha? '}
                {link('entrar', 'Entrar')}
              </>
            )}
          </p>
        </form>
        )}
      </div>
    </div>
  )
}
