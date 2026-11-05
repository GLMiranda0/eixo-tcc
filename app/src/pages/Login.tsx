import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../lib/theme'

export function Login() {
  const nav = useNavigate()
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: FormEvent, destino = '/painel') {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { data: { nome } } })
        if (error) throw error
        if (!data.session) {
          setAviso('Conta criada. Confirme o e-mail que enviamos e depois entre.')
          setModo('entrar')
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      }
      nav(destino)
    } catch (err) {
      setErro((err as Error).message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : (err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

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
        <form className="card" onSubmit={enviar}>
          <h2>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h2>
          {modo === 'criar' && (
            <div className="field">
              <label htmlFor="l-nome">Seu nome</label>
              <input id="l-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label htmlFor="l-email">E-mail</label>
            <input id="l-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="l-pass">Senha</label>
            <input id="l-pass" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />
          </div>
          {erro && <p className="err">{erro}</p>}
          {aviso && <p className="muted">{aviso}</p>}
          <button className="btn btn-primary btn-hero" type="submit" disabled={ocupado}>
            {modo === 'entrar' ? 'Entrar na plataforma' : 'Criar conta'} →
          </button>
          <div className="divider">ou</div>
          <button className="btn btn-secondary" type="button" onClick={(e) => (modo === 'entrar' && email && senha ? enviar(e as unknown as FormEvent, '/tutorial') : setModo('criar'))} disabled={ocupado}>
            Explorar em modo simulação
          </button>
          <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            {modo === 'entrar' ? (
              <>
                Primeira vez?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setModo('criar') }}>
                  Crie uma conta
                </a>
                . O modo simulação não precisa de hardware.
              </>
            ) : (
              <>
                Já tem conta?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setModo('entrar') }}>
                  Entrar
                </a>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
