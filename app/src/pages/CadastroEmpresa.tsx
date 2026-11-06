import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { cnpjValido, formatarCnpj, normalizarCnpj } from '../lib/cnpj'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../lib/theme'

/**
 * Último passo do cadastro: aparece no primeiro acesso de quem não tem convite pendente.
 * Cria a empresa (nome fantasia, razão social e CNPJ) e torna o usuário master dela.
 */
export function CadastroEmpresa() {
  const { session, perfil, recarregarPerfil, sair, emailConfirmado } = useAuth()
  const [fantasia, setFantasia] = useState('')
  const [razao, setRazao] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cnpjCompleto = normalizarCnpj(cnpj).length === 14
  const cnpjOk = cnpjValido(cnpj)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!cnpjOk) return setErro('CNPJ inválido. Confira os números.')
    setOcupado(true)
    const { error } = await supabase.rpc('cadastrar_empresa', {
      p_nome_fantasia: fantasia.trim(),
      p_razao_social: razao.trim(),
      p_cnpj: normalizarCnpj(cnpj),
    })
    if (error) {
      setOcupado(false)
      return setErro(error.message.includes('Failed to fetch') ? 'Sem conexão com o servidor. Verifique a internet.' : error.message)
    }
    await recarregarPerfil()
  }

  const passo = (n: number, txt: string, feito: boolean) => (
    <li className={'onb-step' + (feito ? ' done' : ' now')}>
      <span className="n">{feito ? '✓' : n}</span>
      {txt}
    </li>
  )

  return (
    <div className="onb">
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <div className="brand" style={{ padding: 0 }}>
          <Logo size={32} />
          <span className="word">eixo</span>
        </div>
        <div className="row">
          <ThemeToggle />
          <button className="btn btn-ghost btn-sm" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      <form className="card onb-card" onSubmit={enviar}>
        <ol className="onb-steps" aria-label="Etapas do cadastro">
          {passo(1, 'Conta criada', true)}
          {passo(2, 'E-mail confirmado', true)}
          {passo(3, 'Dados da empresa', false)}
        </ol>

        <div>
          {emailConfirmado && (
            <p className="pill ok" style={{ marginBottom: 10 }}>
              ✓ E-mail confirmado
            </p>
          )}
          <h2>Cadastre sua empresa</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {perfil?.nome ? `${perfil.nome.split(' ')[0]}, n` : 'N'}ão encontramos convite para <b className="mono">{session?.user.email}</b>. Cadastre a sua
            empresa: você será o <b>master</b> dela e poderá convidar sua equipe.
          </p>
        </div>

        <div className="field">
          <label htmlFor="em-fantasia">Nome fantasia</label>
          <input id="em-fantasia" value={fantasia} onChange={(e) => setFantasia(e.target.value)} required minLength={2} placeholder="Ex.: Metalúrgica Exemplo" autoComplete="organization" />
          <span className="muted" style={{ fontSize: 12 }}>
            É o nome que aparece para a equipe na plataforma.
          </span>
        </div>

        <div className="field">
          <label htmlFor="em-razao">Razão social</label>
          <input id="em-razao" value={razao} onChange={(e) => setRazao(e.target.value)} required minLength={3} placeholder="Ex.: Metalúrgica Exemplo Indústria e Comércio Ltda." />
        </div>

        <div className="field">
          <label htmlFor="em-cnpj">CNPJ</label>
          <input
            id="em-cnpj"
            className="mono"
            value={formatarCnpj(cnpj)}
            onChange={(e) => setCnpj(normalizarCnpj(e.target.value))}
            required
            inputMode="text"
            placeholder="00.000.000/0000-00"
            aria-invalid={cnpjCompleto && !cnpjOk}
          />
          {cnpjCompleto && !cnpjOk && <span className="err">CNPJ inválido: os dígitos verificadores não conferem.</span>}
          {cnpjOk && <span style={{ color: 'var(--ok)', fontSize: 12 }}>✓ CNPJ válido</span>}
        </div>

        {erro && <p className="err">{erro}</p>}

        <button className="btn btn-primary btn-hero" type="submit" disabled={ocupado || !cnpjOk || fantasia.trim().length < 2 || razao.trim().length < 3}>
          {ocupado ? 'Cadastrando…' : 'Cadastrar empresa e começar'} →
        </button>

        <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
          Sua empresa já usa a Eixo? Peça ao master dela um convite para este e-mail e entre de novo: você cai direto na empresa.
        </p>
      </form>
    </div>
  )
}
