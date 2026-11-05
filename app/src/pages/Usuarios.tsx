import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { LIMITES_PAPEL, PAPEL_LABEL, type Convite, type Perfil } from '../lib/types'

const data = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR') : '–')

export function Usuarios() {
  const { perfil, session } = useAuth()
  const contaId = perfil?.conta_id ?? null
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [papelConvite, setPapelConvite] = useState<'admin' | 'comum'>('comum')

  const recarregar = useCallback(async () => {
    if (!contaId) return
    const [p, c] = await Promise.all([
      supabase.from('perfis').select('*').eq('conta_id', contaId).order('criado_em'),
      supabase.from('convites').select('*').eq('conta_id', contaId).is('aceito_em', null).order('criado_em', { ascending: false }),
    ])
    if (p.error) setErro(p.error.message)
    setPerfis((p.data as Perfil[]) ?? [])
    setConvites((c.data as Convite[]) ?? [])
    setCarregando(false)
  }, [contaId])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  async function executar(chave: string, fn: () => PromiseLike<{ error: { message: string } | null }>, sucesso: string) {
    setErro(null)
    setOk(null)
    setOcupado(chave)
    const { error } = await fn()
    setOcupado(null)
    if (error) {
      setErro(error.message)
      return false
    }
    setOk(sucesso)
    recarregar()
    return true
  }

  const mudarPapel = (p: Perfil, papel: 'admin' | 'comum') =>
    executar('papel-' + p.id, () => supabase.from('perfis').update({ papel }).eq('id', p.id), `${p.nome || p.email} agora é ${PAPEL_LABEL[papel]}.`)

  const alternarAtivo = (p: Perfil) =>
    executar(
      'ativo-' + p.id,
      () => supabase.from('perfis').update({ ativo: !p.ativo }).eq('id', p.id),
      p.ativo ? `${p.nome || p.email} foi desativado.` : `${p.nome || p.email} foi reativado.`,
    )

  const cancelarConvite = (c: Convite) =>
    executar('conv-' + c.id, () => supabase.from('convites').delete().eq('id', c.id), `Convite para ${c.email} cancelado.`)

  async function convidar(e: FormEvent) {
    e.preventDefault()
    setOk(null)
    if (!contaId) return setErro('Seu perfil ainda não está ligado a uma empresa.')
    const alvo = email.trim().toLowerCase()
    if (perfis.some((p) => p.email?.toLowerCase() === alvo)) return setErro('Este e-mail já é usuário da empresa.')
    const feito = await executar(
      'convidar',
      () => supabase.from('convites').insert({ conta_id: contaId, email: alvo, papel: papelConvite, criado_por: session?.user.id }),
      `Convite criado. Peça para ${alvo} criar a conta com este e-mail: ele entra direto como ${PAPEL_LABEL[papelConvite]}.`,
    )
    if (feito) setEmail('')
  }

  const ativos = perfis.filter((p) => p.ativo)
  const conta = (papel: 'master' | 'admin' | 'comum') => ativos.filter((p) => p.papel === papel).length
  const pendentes = (papel: 'admin' | 'comum') => convites.filter((c) => c.papel === papel).length
  const lotado = (papel: 'admin' | 'comum') => conta(papel) + pendentes(papel) >= LIMITES_PAPEL[papel]

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Usuários</p>
          <h1>Equipe da empresa</h1>
          <p className="muted num">
            Master {conta('master')}/{LIMITES_PAPEL.master} · Admin {conta('admin')}/{LIMITES_PAPEL.admin} · Comum {conta('comum')}/{LIMITES_PAPEL.comum}
            {convites.length > 0 && ` · ${convites.length} convite(s) pendente(s)`}
          </p>
        </div>
      </div>

      {erro && (
        <div className="banner">
          <div className="sev warn">!</div>
          <div>
            <b>Não foi possível concluir.</b> <span className="muted">{erro}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setErro(null)}>
            Fechar
          </button>
        </div>
      )}
      {ok && (
        <div className="banner info">
          <div className="sev ok">✓</div>
          <div>{ok}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setOk(null)}>
            Fechar
          </button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="card pad0">
          {carregando ? (
            <p className="muted" style={{ padding: 20 }}>
              Carregando…
            </p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Papel</th>
                    <th>Situação</th>
                    <th>Desde</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((p) => {
                    const eu = p.id === session?.user.id
                    return (
                      <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.6 }}>
                        <td>
                          <b>{p.nome || '–'}</b>
                          {eu && <span className="muted"> (você)</span>}
                          <br />
                          <span className="muted mono" style={{ fontSize: 12 }}>
                            {p.email ?? '–'}
                          </span>
                        </td>
                        <td>
                          {p.papel === 'master' || eu ? (
                            <span className={'pill ' + (p.papel === 'master' ? 'ok' : '')}>{PAPEL_LABEL[p.papel]}</span>
                          ) : (
                            <select
                              aria-label={'Papel de ' + (p.nome || p.email)}
                              value={p.papel}
                              disabled={ocupado === 'papel-' + p.id}
                              onChange={(e) => mudarPapel(p, e.target.value as 'admin' | 'comum')}
                              style={{ width: 'auto', padding: '5px 8px' }}
                            >
                              <option value="admin">Admin</option>
                              <option value="comum">Comum</option>
                            </select>
                          )}
                        </td>
                        <td>
                          <span className={'pill ' + (p.ativo ? 'ok' : 'crit')}>{p.ativo ? 'Ativo' : 'Desativado'}</span>
                        </td>
                        <td className="num muted">{data(p.criado_em)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {!eu && p.papel !== 'master' && (
                            <button
                              className={'btn btn-sm ' + (p.ativo ? 'btn-danger' : 'btn-ok')}
                              disabled={ocupado === 'ativo-' + p.id}
                              onClick={() => alternarAtivo(p)}
                            >
                              {p.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="steps" style={{ gap: 14 }}>
          <form className="card" onSubmit={convidar}>
            <h3 style={{ marginBottom: 6 }}>Convidar usuário</h3>
            <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
              A pessoa cria a conta com o e-mail convidado e entra direto nesta empresa, com o papel escolhido. Admin edita motores e trata alertas; comum só
              acompanha.
            </p>
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="cv-email">E-mail</label>
              <input id="cv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="pessoa@empresa.com.br" />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="cv-papel">Papel</label>
              <select id="cv-papel" value={papelConvite} onChange={(e) => setPapelConvite(e.target.value as 'admin' | 'comum')}>
                <option value="admin">
                  Admin ({conta('admin') + pendentes('admin')}/{LIMITES_PAPEL.admin} com convites)
                </option>
                <option value="comum">
                  Comum ({conta('comum') + pendentes('comum')}/{LIMITES_PAPEL.comum} com convites)
                </option>
              </select>
            </div>
            {lotado(papelConvite) && (
              <p className="err" style={{ marginBottom: 10 }}>
                Limite de {PAPEL_LABEL[papelConvite]} atingido. Desative alguém ou cancele um convite.
              </p>
            )}
            <button className="btn btn-primary" type="submit" disabled={ocupado === 'convidar' || lotado(papelConvite)}>
              Enviar convite
            </button>
          </form>

          <div className="card">
            <div className="card-h">
              <h3>Convites pendentes</h3>
              <span className="muted num">{convites.length}</span>
            </div>
            {convites.length === 0 ? (
              <p className="muted">Nenhum convite aguardando cadastro.</p>
            ) : (
              <div className="steps">
                {convites.map((c) => (
                  <div key={c.id} className="ind-row">
                    <div className="t">
                      <b className="mono" style={{ fontSize: 12 }}>
                        {c.email}
                      </b>
                      <small>
                        {PAPEL_LABEL[c.papel]} · convidado em {data(c.criado_em)}
                      </small>
                    </div>
                    <button className="btn btn-ghost btn-sm" disabled={ocupado === 'conv-' + c.id} onClick={() => cancelarConvite(c)}>
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
