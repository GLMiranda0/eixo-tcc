import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAlertas, useMotores } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import type { AcaoCorretiva, Alerta } from '../lib/types'

function padraoDe(a: Alerta) {
  const t = a.titulo.toLowerCase()
  if (t.startsWith('vib') || t.startsWith('corr')) return 'sobrecarga'
  if (t.startsWith('temp')) return 'ventilacao'
  return 'sensor'
}

export function Alertas() {
  const [sp, setSp] = useSearchParams()
  const { session, podeEditar } = useAuth()
  const [filtro, setFiltro] = useState<'ativos' | 'todos'>('ativos')
  const { alertas, recarregar } = useAlertas(filtro === 'ativos')
  const { motores } = useMotores()
  const [acoes, setAcoes] = useState<AcaoCorretiva[]>([])
  const [acaoTxt, setAcaoTxt] = useState('')
  const sel = alertas.find((a) => a.id === sp.get('sel')) ?? alertas[0] ?? null

  useEffect(() => {
    supabase.from('acoes_corretivas').select('*').order('ordem').then(({ data }) => setAcoes((data as AcaoCorretiva[]) ?? []))
  }, [])

  async function reconhecer() {
    if (!sel || !podeEditar) return
    await supabase
      .from('alertas')
      .update({ status: 'reconhecido', reconhecido_por: session?.user.id, reconhecido_em: new Date().toISOString(), acao_registrada: acaoTxt || null })
      .eq('id', sel.id)
    setAcaoTxt('')
    recarregar()
  }
  async function silenciar() {
    if (!sel || !podeEditar) return
    await supabase.from('alertas').update({ status: 'silenciado' }).eq('id', sel.id)
    recarregar()
  }

  const motorDe = (id: string) => motores.find((m) => m.id === id)
  const lista = acoes.filter((a) => sel && a.padrao === padraoDe(sel))

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Alertas</p>
          <h1>{filtro === 'ativos' ? `${alertas.length} alertas ativos` : 'Histórico de alertas'}</h1>
        </div>
        <div className="seg">
          <button className={filtro === 'ativos' ? 'on' : ''} onClick={() => setFiltro('ativos')}>
            Ativos
          </button>
          <button className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>
            Todos
          </button>
        </div>
      </div>
      {alertas.length === 0 ? (
        <div className="empty">Nenhum alerta {filtro === 'ativos' ? 'ativo' : 'registrado'}. Os motores estão dentro do esperado.</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
          <div className="steps">
            {alertas.map((a) => (
              <div key={a.id} className={'alert-item ' + (sel?.id === a.id ? 'sel' : '')} onClick={() => setSp({ sel: a.id })} style={{ opacity: a.status === 'ativo' ? 1 : 0.65 }}>
                <div className={'sev ' + (a.status !== 'ativo' ? 'ok' : a.severidade === 'critico' ? 'crit' : 'warn')}>{a.status !== 'ativo' ? '✓' : '!'}</div>
                <div>
                  <b>{a.titulo}</b>
                  <br />
                  <span className="muted">
                    {motorDe(a.motor_id)?.tag ?? '?'} · {new Date(a.criado_em).toLocaleString('pt-BR')}
                  </span>
                </div>
                <span className={'pill ' + (a.status !== 'ativo' ? 'ok' : a.severidade === 'critico' ? 'crit' : 'warn')}>{a.status === 'ativo' ? (a.severidade === 'critico' ? 'Crítico' : 'Atenção') : a.status}</span>
              </div>
            ))}
          </div>
          {sel && (
            <div className={'card stripe ' + (sel.severidade === 'critico' ? 'crit' : 'warn')}>
              <p className="eyebrow">Diagnóstico · {motorDe(sel.motor_id)?.tag}</p>
              <h2 style={{ margin: '4px 0 10px' }}>{sel.titulo}</h2>
              <p className="muted" style={{ marginBottom: 14 }}>
                {sel.mensagem}
                {padraoDe(sel) === 'sobrecarga' && ' Padrão mais provável: sobrecarga mecânica. '}
                {!motorDe(sel.motor_id) || motorDe(sel.motor_id)?.aplicacao === 'multispeed' ? 'Rotação não medida: variação de velocidade não pode ser descartada.' : ''}
              </p>
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                Ação corretiva sugerida
              </p>
              <div className="steps" style={{ marginBottom: 14 }}>
                {lista.map((ac, i) => (
                  <div key={ac.id} className={'step ' + (i === 0 ? 'cur' : '')}>
                    <span className="n">{ac.ordem}</span>
                    <div>
                      <b>{ac.titulo}</b>
                      <br />
                      <span className="muted">{ac.descricao}</span>
                    </div>
                  </div>
                ))}
              </div>
              {sel.status === 'ativo' && !podeEditar ? (
                <p className="muted">
                  <span className="pill">Somente visualização</span> Um admin ou o master da empresa reconhece o alerta e registra a ação.
                </p>
              ) : sel.status === 'ativo' ? (
                <>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="acao">O que foi feito</label>
                    <input id="acao" value={acaoTxt} onChange={(e) => setAcaoTxt(e.target.value)} placeholder="Ex.: carga reduzida para 40 %, vibração voltou a 2,1 mm/s" />
                  </div>
                  <div className="row">
                    <button className="btn btn-primary btn-hero" onClick={reconhecer}>
                      ✓ Reconhecer e registrar ação
                    </button>
                    <button className="btn btn-ghost" onClick={silenciar}>
                      Silenciar
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">
                  {sel.status} {sel.reconhecido_em && 'em ' + new Date(sel.reconhecido_em).toLocaleString('pt-BR')}
                  {sel.acao_registrada && <> · ação: {sel.acao_registrada}</>}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
