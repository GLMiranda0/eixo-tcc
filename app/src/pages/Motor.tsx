import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Gauge, NaoMedido } from '../components/Gauge'
import { LineChart } from '../components/LineChart'
import { useAuth } from '../lib/auth'
import { useLeituras, useMotor } from '../lib/hooks'
import { novoToken, sha256Hex, supabase } from '../lib/supabase'
import { GRANDEZAS, SEV_LABEL, fmt, pior, severidade, type Grandeza } from '../lib/types'

const URL_INGEST = (import.meta.env.VITE_SUPABASE_URL as string) + '/rest/v1/rpc/ingest'

export function Motor() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { podeEditar } = useAuth()
  const { motor, coletor, regras, status, recarregar } = useMotor(id)
  const leituras = useLeituras(id, 120)
  const [histS, setHistS] = useState<Grandeza>('corr')
  const [token, setToken] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!id) return
    try {
      setToken(sessionStorage.getItem('eixo-token-' + id))
    } catch {
      /* sem storage */
    }
  }, [id])

  const medidas = useMemo<Grandeza[]>(() => {
    if (!coletor) return ['temp', 'corr', 'vib']
    return (['temp', 'corr', 'vib', 'rot', 'tens'] as Grandeza[]).filter((g) => coletor[('mede_' + g) as keyof typeof coletor])
  }, [coletor])

  const ultima = leituras[leituras.length - 1] ?? null
  const sev = pior(regras, ultima, medidas)
  const online = coletor?.ultimo_contato ? Date.now() - new Date(coletor.ultimo_contato).getTime() < 15000 : false
  const avisoMs = motor?.aplicacao === 'multispeed' && !medidas.includes('rot')

  async function rotacionar() {
    if (!coletor || !podeEditar) return
    const t = novoToken()
    const { error } = await supabase.from('coletores').update({ token_hash: await sha256Hex(t) }).eq('id', coletor.id)
    if (error) return alert(error.message)
    try {
      sessionStorage.setItem('eixo-token-' + id, t)
    } catch {
      /* sem storage */
    }
    setToken(t)
  }

  async function alternar(campo: string, valor: boolean) {
    if (!coletor || !podeEditar) return
    await supabase.from('coletores').update({ [campo]: valor }).eq('id', coletor.id)
    recarregar()
  }

  async function mudarAplicacao(v: 'fixa' | 'multispeed') {
    if (!motor || !podeEditar) return
    await supabase.from('motores').update({ aplicacao: v }).eq('id', motor.id)
    recarregar()
  }

  function copiar(txt: string) {
    navigator.clipboard?.writeText(txt).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  if (!motor) return <p className="muted">Carregando…</p>

  const exemplo = JSON.stringify(
    Object.fromEntries([['motor', motor.tag], ['ts', new Date().toISOString()], ...medidas.map((g) => [g, ultima?.[g] ?? 0])]),
    null,
    2,
  )
  const regra = regras.find((r) => r.grandeza === histS)

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">
            <Link to="/motores">Motores</Link> › {motor.tag}
          </p>
          <h1>{motor.nome}</h1>
          <p className="muted">
            {[motor.fabricante, motor.modelo, motor.potencia_cv && motor.potencia_cv + ' cv', motor.tensao_nominal_v && motor.tensao_nominal_v + ' V', motor.corrente_nominal_a && 'In ' + motor.corrente_nominal_a + ' A', motor.rpm_nominal && motor.rpm_nominal + ' rpm nominal'].filter(Boolean).join(' · ')}
            {' · coletor '}
            {coletor?.tipo === 'terceiro' ? 'próprio' : 'Eixo'} / {coletor?.protocolo?.toUpperCase()}
          </p>
        </div>
        <span className={'pill ' + sev}>{ultima ? SEV_LABEL[sev] : 'Sem dados'}</span>
        <span className={'pill ' + (online ? 'ok' : '')}>
          {online && <span className="dot" />}
          {online ? 'Coletor online' : 'Coletor offline'}
        </span>
        {podeEditar ? (
          <div className="seg" title="Tipo de aplicação">
            <button className={motor.aplicacao === 'fixa' ? 'on' : ''} onClick={() => mudarAplicacao('fixa')}>
              Velocidade fixa
            </button>
            <button className={motor.aplicacao === 'multispeed' ? 'on' : ''} onClick={() => mudarAplicacao('multispeed')}>
              Multispeed
            </button>
          </div>
        ) : (
          <span className="pill" title="Tipo de aplicação">
            {motor.aplicacao === 'multispeed' ? 'Multispeed' : 'Velocidade fixa'} · somente visualização
          </span>
        )}
      </div>

      {sp.get('novo') && token && podeEditar && (
        <div className="banner info">
          <div className="sev ok">✓</div>
          <div>
            <b>Motor cadastrado. Guarde o token do coletor agora:</b> ele não é mostrado de novo. <span className="mono">{token}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => copiar(token)}>
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}

      {avisoMs && (
        <div className="banner">
          <div className="sev warn">!</div>
          <div>
            <b>Aplicação multispeed sem leitura de rotação.</b>
            <br />
            <span className="muted">
              O modelo assume velocidade nominal ({motor.rpm_nominal ?? '–'} rpm). Ao variar a velocidade, a vibração muda e pode gerar alertas falsos ou mascarar falhas. Envie a chave{' '}
              <span className="mono">"rot"</span> no payload (sensor Hall, encoder ou saída do inversor) e o Eixo passa a aprender uma linha de base por faixa de velocidade.
            </span>
          </div>
          {podeEditar && (
            <a href="#coletor" className="btn btn-secondary btn-sm">
              Configurar rotação
            </a>
          )}
        </div>
      )}
      {medidas.includes('rot') && (
        <div className="banner info">
          <div className="sev ok">✓</div>
          <div>
            <b>Rotação recebida do coletor.</b> <span className="muted">A linha de base é separada por faixa de velocidade.</span>
          </div>
          <span className="pill ok">Multispeed suportado</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <h3>Tempo real</h3>
          <span className="muted num">{ultima ? 'última leitura ' + new Date(ultima.ts).toLocaleTimeString('pt-BR') : 'aguardando o coletor'}</span>
        </div>
        <div className="grid g5">
          {(['temp', 'corr', 'vib', 'rot', 'tens'] as Grandeza[]).map((g) => (medidas.includes(g) ? <Gauge key={g} g={g} valor={ultima?.[g]} sev={severidade(regras, g, ultima?.[g])} /> : <NaoMedido key={g} g={g} />))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <h3>Últimas {leituras.length} leituras</h3>
          <div className="seg">
            {medidas.map((g) => (
              <button key={g} className={histS === g ? 'on' : ''} onClick={() => setHistS(g)}>
                {GRANDEZAS[g].nome}
              </button>
            ))}
          </div>
        </div>
        <LineChart
          series={[{ nome: GRANDEZAS[histS].nome, cor: GRANDEZAS[histS].cor, valores: leituras.map((l) => l[histS]) }]}
          limite={regra?.limite_critico}
          casas={GRANDEZAS[histS].casas}
          rotulosX={leituras.length ? [new Date(leituras[0].ts).toLocaleTimeString('pt-BR'), 'agora'] : []}
          ariaLabel={'Histórico de ' + GRANDEZAS[histS].nome}
        />
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Tracejado vermelho = limite crítico da fase 1. A faixa de "normal aprendido" aparece quando o motor completar 14 dias de dados.
        </p>
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h">
            <h3>Motor de diagnóstico</h3>
            <span className="muted num">{status?.dias ?? 0} de 14 dias · {status?.n_leituras ?? 0} leituras</span>
          </div>
          <div className="progress" style={{ marginBottom: 12 }}>
            <i style={{ width: Math.min(100, ((status?.dias ?? 0) / 14) * 100) + '%' }} />
          </div>
          <div className="steps">
            {[
              ['Limites fixos', 'ISO 10816-3, % da corrente nominal, classe de isolação; alerta após leituras seguidas acima do limite.', 1],
              ['Linha de base aprendida', 'Média e desvio por hora e dia da semana; alerta ao sair do envelope ±2σ.', 2],
              ['Diagnóstico por padrão', 'Combina os desvios em um padrão nomeado e sugere a ação.', 3],
            ].map(([t, d, f]) => (
              <div key={t as string} className={'step ' + ((status?.fase ?? 1) === f ? 'cur' : (status?.fase ?? 1) > (f as number) ? 'done' : '')}>
                <span className="n">{f as number}</span>
                <div>
                  <b>{t as string}</b>
                  {(status?.fase ?? 1) === f && <span className="pill warn" style={{ marginLeft: 6 }}>ativo agora</span>}
                  <br />
                  <span className="muted">{d as string}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Limites da fase 1</h3>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Grandeza</th>
                  <th>Atenção</th>
                  <th>Crítico</th>
                  <th title="Leituras válidas seguidas acima do limite crítico para abrir o alerta">Persistência</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {regras
                  .filter((r) => medidas.includes(r.grandeza))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{GRANDEZAS[r.grandeza].nome}</td>
                      <td className="num">
                        ≥ {fmt(r.grandeza, r.limite_atencao)} {GRANDEZAS[r.grandeza].unidade}
                      </td>
                      <td className="num">
                        ≥ {fmt(r.grandeza, r.limite_critico)} {GRANDEZAS[r.grandeza].unidade}
                      </td>
                      <td className="num">{r.persistencia ?? 1} leitura{(r.persistencia ?? 1) > 1 ? 's' : ''}</td>
                      <td className="muted">{r.origem}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" id="coletor">
        <div className="card-h">
          <h3>Coletor</h3>
          {!podeEditar && <span className="pill">Somente visualização</span>}
          <span className="muted">{coletor?.ultimo_contato ? 'último contato ' + new Date(coletor.ultimo_contato).toLocaleString('pt-BR') : 'nunca se conectou'}</span>
        </div>
        <div className="grid g2">
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Indicadores
            </p>
            <div className="steps">
              {(['temp', 'corr', 'vib', 'rot', 'tens'] as Grandeza[]).map((g) => {
                const padraoEixo = ['temp', 'corr', 'vib'].includes(g)
                const campo = 'mede_' + g
                const on = coletor ? (coletor[campo as keyof typeof coletor] as boolean) : padraoEixo
                return (
                  <div key={g} className="ind-row">
                    <span className="sw" style={{ background: GRANDEZAS[g].cor }} />
                    <div className="t">
                      <b>{GRANDEZAS[g].nome}</b> {coletor?.tipo === 'eixo' && (padraoEixo ? <span className="pill ok" style={{ fontSize: 11 }}>padrão Eixo</span> : <span className="pill" style={{ fontSize: 11 }}>fonte externa</span>)}
                      <small>
                        chave <span className="mono">"{g}"</span>
                      </small>
                    </div>
                    {podeEditar ? (
                      <button className={'switch ' + (on ? 'on' : '')} aria-label={'Ativar ' + GRANDEZAS[g].nome} disabled={coletor?.tipo === 'eixo' && padraoEixo} onClick={() => alternar(campo, !on)} />
                    ) : (
                      <span className={'pill ' + (on ? 'ok' : '')}>{on ? 'medido' : 'não medido'}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Endpoint (POST)</label>
              <div className="row">
                <input readOnly value={URL_INGEST} className="mono" style={{ fontSize: 12, flex: 1 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => copiar(URL_INGEST)}>
                  Copiar
                </button>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Token do dispositivo</label>
              <div className="row">
                <input readOnly value={podeEditar && token ? token : '•••••••• (guardado só como hash)'} className="mono" style={{ fontSize: 12, flex: 1 }} />
                {podeEditar && (
                  <button className="btn btn-secondary btn-sm" onClick={rotacionar}>
                    Rotacionar
                  </button>
                )}
              </div>
            </div>
            <p className="eyebrow" style={{ margin: '8px 0 6px' }}>
              Exemplo de mensagem
            </p>
            <pre className="code">{`POST ${URL_INGEST}
apikey: <chave publicável>
Content-Type: application/json

{"p_token": "<token>", "p": ${exemplo.replace(/\n/g, '\n  ')}}`}</pre>
          </div>
        </div>
      </div>
    </>
  )
}
