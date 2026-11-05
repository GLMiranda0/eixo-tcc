import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMotores } from '../lib/hooks'
import { novoToken, sha256Hex, supabase } from '../lib/supabase'

export function Motores() {
  const nav = useNavigate()
  const { perfil, podeEditar } = useAuth()
  const { motores, recarregar } = useMotores()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [f, setF] = useState({ tag: '', nome: '', fabricante: '', modelo: '', potencia_cv: '', tensao_nominal_v: '220', corrente_nominal_a: '', rpm_nominal: '1740', aplicacao: 'fixa', tipo: 'eixo', protocolo: 'post' })

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!podeEditar) {
      setErro('Seu papel não permite cadastrar motores.')
      return
    }
    if (!perfil?.conta_id) {
      setErro('Seu perfil ainda não está ligado a uma conta.')
      return
    }
    const { data: m, error } = await supabase
      .from('motores')
      .insert({
        conta_id: perfil.conta_id,
        tag: f.tag,
        nome: f.nome,
        fabricante: f.fabricante || null,
        modelo: f.modelo || null,
        potencia_cv: f.potencia_cv ? +f.potencia_cv.replace(',', '.') : null,
        tensao_nominal_v: f.tensao_nominal_v ? +f.tensao_nominal_v : null,
        corrente_nominal_a: f.corrente_nominal_a ? +f.corrente_nominal_a.replace(',', '.') : null,
        rpm_nominal: f.rpm_nominal ? +f.rpm_nominal : null,
        aplicacao: f.aplicacao,
      })
      .select()
      .single()
    if (error) {
      setErro(error.message)
      return
    }
    const token = novoToken()
    const { error: e2 } = await supabase.from('coletores').insert({
      motor_id: m.id,
      tipo: f.tipo,
      protocolo: f.protocolo,
      token_hash: await sha256Hex(token),
      mede_tens: f.tipo === 'terceiro',
      mede_rot: f.tipo === 'terceiro',
    })
    if (e2) {
      setErro(e2.message)
      return
    }
    try {
      sessionStorage.setItem('eixo-token-' + m.id, token)
    } catch {
      /* sem storage */
    }
    await recarregar()
    nav('/motores/' + m.id + '?novo=1')
  }

  const campo = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={'m-' + k}>{label}</label>
      <input id={'m-' + k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </div>
  )

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Motores</p>
          <h1>{motores.length} motores</h1>
        </div>
        {podeEditar ? (
          <button className="btn btn-primary" onClick={() => setAberto(!aberto)}>
            + Novo motor
          </button>
        ) : (
          <span className="pill">Somente visualização</span>
        )}
      </div>

      {aberto && podeEditar && (
        <form className="card" style={{ marginBottom: 14 }} onSubmit={salvar}>
          <h3 style={{ marginBottom: 10 }}>Dados de placa</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            A corrente nominal define os limites de 105 % e 115 % da fase 1. A rotação nominal é o que o modelo assume quando o coletor não mede rpm.
          </p>
          <div className="grid g3" style={{ marginBottom: 12 }}>
            {campo('tag', 'Tag (ex.: M-01)', { required: true })}
            {campo('nome', 'Nome', { required: true, placeholder: 'Bomba centrífuga · linha 2' })}
            {campo('fabricante', 'Fabricante', { placeholder: 'WEG' })}
            {campo('modelo', 'Modelo', { placeholder: 'W22' })}
            {campo('potencia_cv', 'Potência (cv)', { inputMode: 'decimal' })}
            {campo('corrente_nominal_a', 'Corrente nominal (A)', { inputMode: 'decimal', required: true })}
            {campo('tensao_nominal_v', 'Tensão (V)', { inputMode: 'numeric' })}
            {campo('rpm_nominal', 'Rotação nominal (rpm)', { inputMode: 'numeric' })}
            <div className="field">
              <label htmlFor="m-aplicacao">Aplicação</label>
              <select id="m-aplicacao" value={f.aplicacao} onChange={(e) => setF({ ...f, aplicacao: e.target.value })}>
                <option value="fixa">Velocidade fixa (partida direta / soft-starter)</option>
                <option value="multispeed">Multispeed (inversor de frequência)</option>
              </select>
            </div>
          </div>
          {f.aplicacao === 'multispeed' && f.tipo === 'eixo' && (
            <div className="banner">
              <div className="sev warn">!</div>
              <div>
                <b>Multispeed sem leitura de rotação.</b>{' '}
                <span className="muted">O coletor Eixo não mede rpm. O Eixo vai monitorar, mas avisa que a vibração pode variar com a velocidade. Se o inversor tiver saída de rotação, envie a chave "rot".</span>
              </div>
            </div>
          )}
          <h3 style={{ margin: '6px 0 10px' }}>Coletor</h3>
          <div className="grid g2" style={{ marginBottom: 12 }}>
            <label className={'opt ' + (f.tipo === 'eixo' ? 'on' : '')} onClick={() => setF({ ...f, tipo: 'eixo' })}>
              <span className="radio" />
              <div>
                <b>Coletor Eixo (ESP32)</b>
                <br />
                <span className="muted">Mede corrente, temperatura e vibração.</span>
              </div>
            </label>
            <label className={'opt ' + (f.tipo === 'terceiro' ? 'on' : '')} onClick={() => setF({ ...f, tipo: 'terceiro' })}>
              <span className="radio" />
              <div>
                <b>Coletor próprio ou de terceiro</b>
                <br />
                <span className="muted">Tudo que chegar no payload é computado.</span>
              </div>
            </label>
            <label className={'opt ' + (f.protocolo === 'post' ? 'on' : '')} onClick={() => setF({ ...f, protocolo: 'post' })}>
              <span className="radio" />
              <div>
                <b>POST HTTPS</b>
                <br />
                <span className="muted">Recomendado para começar.</span>
              </div>
            </label>
            <label className={'opt ' + (f.protocolo === 'mqtt' ? 'on' : '')} onClick={() => setF({ ...f, protocolo: 'mqtt' })}>
              <span className="radio" />
              <div>
                <b>MQTT</b>
                <br />
                <span className="muted">Broker Eixo (VPS) ou o seu. Em breve.</span>
              </div>
            </label>
          </div>
          {erro && <p className="err">{erro}</p>}
          <div className="row">
            <button className="btn btn-primary" type="submit">
              Salvar e gerar token do coletor
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {motores.length === 0 ? (
        <div className="empty">
          {podeEditar ? 'Nenhum motor ainda. Cadastre o primeiro acima ou use o Caminho de Tutorial.' : 'Nenhum motor cadastrado nesta empresa ainda.'}
        </div>
      ) : (
        <div className="grid g3">
          {motores.map((m) => (
            <Link key={m.id} to={'/motores/' + m.id} className="card" style={{ textDecoration: 'none' }}>
              <div className="card-h">
                <h3>{m.tag}</h3>
                {m.simulado && <span className="pill sim">simulado</span>}
              </div>
              <p>{m.nome}</p>
              <p className="muted" style={{ fontSize: 12 }}>
                {[m.fabricante, m.modelo, m.potencia_cv && m.potencia_cv + ' cv', m.corrente_nominal_a && m.corrente_nominal_a + ' A', m.rpm_nominal && m.rpm_nominal + ' rpm'].filter(Boolean).join(' · ')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
