import { GRANDEZAS, type Grandeza } from '../lib/types'

/** Pontos de instalação no desenho (id, nome e posição no viewBox 0 0 520 300). */
export const PONTOS = [
  { id: 'eixo', nome: 'Ponta de eixo / acoplamento', x: 72, y: 150 },
  { id: 'mancal_la', nome: 'Mancal lado acoplado', x: 123, y: 150 },
  { id: 'carcaca', nome: 'Carcaça (aletas)', x: 258, y: 168 },
  { id: 'mancal_loa', nome: 'Mancal lado oposto', x: 386, y: 150 },
  { id: 'ventilador', nome: 'Tampa do ventilador', x: 420, y: 150 },
  { id: 'caixa', nome: 'Caixa de ligação (bornes)', x: 265, y: 68 },
  { id: 'cabos_juntos', nome: 'Cabos de alimentação (as três fases juntas)', x: 338, y: 58 },
  { id: 'cabo_fase', nome: 'Cabo de uma fase, separado', x: 418, y: 36 },
  { id: 'inversor', nome: 'Painel / inversor de frequência', x: 478, y: 52 },
  { id: 'base', nome: 'Base / fundação', x: 258, y: 240 },
] as const

export type PontoId = (typeof PONTOS)[number]['id']

export const nomePonto = (id: string | undefined | null) => PONTOS.find((p) => p.id === id)?.nome ?? '–'

export const LETRA: Record<Grandeza, string> = { temp: 'T', corr: 'I', vib: 'V', rot: 'n', tens: 'U' }

export type StatusColetor = 'nenhum' | 'configurado' | 'conectando' | 'online' | 'erro'

/** Onde a caixa do coletor é desenhada conforme o ponto em que foi fixada. */
function posColetor(ponto: string | null | undefined) {
  if (ponto === 'caixa') return { x: 150, y: 20, entrada: 'baixo' as const }
  if (ponto === 'base') return { x: 300, y: 246, entrada: 'cima' as const }
  return { x: 436, y: 198, entrada: 'esquerda' as const }
}

interface Props {
  /** mostra os pontos clicáveis (modo instalação) */
  pontos?: boolean
  /** ponto em destaque: o que está sob o item arrastado, ou o escolhido pelo teclado */
  pontoSelecionado?: string | null
  /** há um item sendo arrastado sobre o desenho: todos os pontos viram alvos visíveis */
  arrastando?: boolean
  onEscolher?: (id: PontoId) => void
  /** sensor → ponto onde foi instalado */
  instalados?: Partial<Record<Grandeza, string>>
  /** ponto onde o coletor foi fixado; no modo instalação, sem ele o coletor não é desenhado */
  coletorPonto?: string | null
  coletor?: StatusColetor
  girando?: boolean
  alerta?: boolean
}

export function MotorSvg({ pontos = false, pontoSelecionado = null, arrastando = false, onEscolher, instalados = {}, coletorPonto = null, coletor = 'nenhum', girando = false, alerta = false }: Props) {
  const ledCor = coletor === 'online' ? 'var(--ok)' : coletor === 'erro' ? 'var(--crit)' : coletor === 'conectando' ? 'var(--warn)' : coletor === 'configurado' ? 'var(--accent)' : 'var(--border)'
  const pos = (id: string) => PONTOS.find((p) => p.id === id)
  const badges = (Object.entries(instalados) as [Grandeza, string][]).filter(([, p]) => p && pos(p))
  // sensores no mesmo ponto ficam lado a lado
  const desloc = (g: Grandeza, p: string) => {
    const juntos = badges.filter(([, pp]) => pp === p)
    const i = juntos.findIndex(([x]) => x === g)
    return (i - (juntos.length - 1) / 2) * 18
  }
  const mostrarColetor = !pontos || !!coletorPonto
  const cp = posColetor(coletorPonto)
  const fios = mostrarColetor && coletor !== 'nenhum'

  const fio = (g: Grandeza, p: string, i: number) => {
    const pt = pos(p)!
    const px = pt.x + desloc(g, p)
    const py = pt.y
    if (cp.entrada === 'baixo') {
      const ex = cp.x + 40 + 6 * i
      const ey = cp.y + 52
      return `M${px} ${py} C ${px} ${py - 30}, ${ex} ${ey + 24}, ${ex} ${ey}`
    }
    if (cp.entrada === 'cima') {
      const ex = cp.x + 30 + 6 * i
      const ey = cp.y
      return `M${px} ${py} C ${px} ${py + 30}, ${ex} ${ey - 24}, ${ex} ${ey}`
    }
    const ex = cp.x + 4
    const ey = cp.y + 26 + 4 * i
    return `M${px} ${py} C ${px} ${py + 40}, ${ex} ${ey}, ${ex} ${ey}`
  }

  const sel = pontoSelecionado ? pos(pontoSelecionado) : null

  return (
    <svg className={'motor-svg' + (girando ? ' girando' : '') + (alerta ? ' alerta' : '') + (arrastando ? ' drop' : '')} viewBox="0 0 520 300" role="img" aria-label="Motor elétrico com pontos de instalação dos sensores">
      <defs>
        <linearGradient id="mg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--surface-2)" />
          <stop offset="1" stopColor="var(--border)" />
        </linearGradient>
      </defs>

      {/* base */}
      <rect x="150" y="212" width="60" height="18" rx="3" className="mg-metal" />
      <rect x="300" y="212" width="60" height="18" rx="3" className="mg-metal" />
      <rect x="110" y="228" width="300" height="10" rx="3" className="mg-metal-dark" />

      {/* alimentação: caixa → painel */}
      <path d="M300 66 C 320 60, 340 58, 360 56" className="mg-cabo-grosso" />
      <path d="M360 56 C 390 50, 420 44, 445 44" className="mg-cabo" />
      <path d="M360 56 C 390 54, 420 52, 445 52" className="mg-cabo" />
      <path d="M360 56 C 390 58, 420 60, 445 60" className="mg-cabo" />
      <path d="M400 44 C 408 32, 428 30, 436 44" className="mg-cabo" />
      <rect x="446" y="24" width="62" height="58" rx="6" className="mg-painel" />
      <text x="477" y="46" textAnchor="middle" className="mg-txt">
        Painel /
      </text>
      <text x="477" y="60" textAnchor="middle" className="mg-txt">
        inversor
      </text>
      <rect x="456" y="66" width="42" height="8" rx="2" fill="var(--accent)" opacity=".55" />

      {/* caixa de ligação */}
      <rect x="230" y="48" width="70" height="44" rx="5" className="mg-metal" />
      <rect x="238" y="56" width="54" height="28" rx="3" className="mg-metal-dark" opacity=".55" />

      {/* carcaça com aletas */}
      <rect x="132" y="92" width="250" height="118" rx="14" fill="url(#mg-body)" stroke="var(--muted)" strokeWidth="1.5" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1="140" x2="374" y1={104 + i * 12} y2={104 + i * 12} className="mg-aleta" />
      ))}
      <text x="258" y="150" textAnchor="middle" className="mg-marca">
        eixo
      </text>

      {/* tampa dianteira (lado acoplado) e eixo */}
      <rect x="108" y="100" width="28" height="102" rx="8" className="mg-metal" />
      <circle cx="123" cy="150" r="16" className="mg-metal-dark" />
      <rect x="44" y="143" width="66" height="14" rx="3" className="mg-eixo" />
      <rect x="58" y="134" width="24" height="32" rx="4" className="mg-metal-dark" />

      {/* tampa traseira e ventilador */}
      <rect x="378" y="100" width="22" height="102" rx="6" className="mg-metal" />
      <circle cx="386" cy="150" r="13" className="mg-metal-dark" />
      <rect x="398" y="108" width="36" height="86" rx="10" className="mg-metal" />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={406 + i * 5} x2={406 + i * 5} y1="116" y2="186" className="mg-grade" />
      ))}
      <g className="mg-ventoinha" style={{ transformOrigin: '416px 150px' }}>
        <circle cx="416" cy="150" r="22" fill="none" stroke="var(--muted)" strokeWidth="1" opacity=".5" />
        {[0, 60, 120].map((a) => (
          <line key={a} x1="416" y1="150" x2={416 + 20 * Math.cos((a * Math.PI) / 180)} y2={150 + 20 * Math.sin((a * Math.PI) / 180)} stroke="var(--muted)" strokeWidth="2" opacity=".6" />
        ))}
      </g>

      {/* fios dos sensores até o coletor */}
      {fios && badges.map(([g, p], i) => <path key={g} d={fio(g, p, i)} className="mg-fio" stroke={GRANDEZAS[g].cor} />)}

      {/* coletor (gateway) */}
      {mostrarColetor && (
        <g className="mg-coletor" key={cp.x + ':' + cp.y}>
          <rect x={cp.x} y={cp.y} width="72" height="52" rx="7" className="mg-painel" />
          <text x={cp.x + 36} y={cp.y + 24} textAnchor="middle" className="mg-txt">
            Coletor
          </text>
          <circle cx={cp.x + 64} cy={cp.y + 10} r="4" fill={ledCor} className={coletor === 'online' || coletor === 'conectando' ? 'mg-led on' : 'mg-led'} />
          <rect x={cp.x + 10} y={cp.y + 34} width="52" height="8" rx="2" fill="var(--muted)" opacity=".35" />
          {fios &&
            badges.map(([g], i) => (
              <rect key={g} x={cp.x + 12 + i * 9} y={cp.y + 35} width="6" height="6" rx="1" fill={GRANDEZAS[g].cor} />
            ))}
        </g>
      )}

      {/* sensores instalados */}
      {badges.map(([g, p]) => {
        const pt = pos(p)!
        const dx = desloc(g, p)
        return (
          <g key={g + ':' + p} className="mg-sensor" style={{ transformOrigin: `${pt.x + dx}px ${pt.y}px` }}>
            <circle cx={pt.x + dx} cy={pt.y} r="11" fill={GRANDEZAS[g].cor} />
            <text x={pt.x + dx} y={pt.y + 4} textAnchor="middle" className="mg-sensor-txt">
              {LETRA[g]}
            </text>
          </g>
        )
      })}

      {/* pontos de instalação (alvos de clique e de soltura) */}
      {pontos &&
        PONTOS.map((p, i) => {
          const ocupado = badges.some(([, pp]) => pp === p.id)
          return (
            <g
              key={p.id}
              data-ponto={p.id}
              className={'mg-ponto' + (pontoSelecionado === p.id ? ' sel' : '') + (ocupado ? ' ocupado' : '')}
              onClick={() => onEscolher?.(p.id)}
              role="button"
              tabIndex={0}
              aria-label={p.nome}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onEscolher?.(p.id)
                }
              }}
            >
              <circle cx={p.x} cy={p.y} r="17" className="mg-ponto-halo" />
              <circle cx={p.x} cy={p.y} r="10" className="mg-ponto-circ" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="mg-ponto-txt">
                {i + 1}
              </text>
            </g>
          )
        })}

      {/* nome do ponto sob o item arrastado */}
      {pontos && arrastando && sel && (
        <g className="mg-rotulo" pointerEvents="none">
          <rect x={Math.min(Math.max(8, sel.x - 80), 520 - 168)} y={sel.y - 40} width="160" height="20" rx="6" />
          <text x={Math.min(Math.max(8, sel.x - 80), 520 - 168) + 80} y={sel.y - 26} textAnchor="middle">
            {sel.nome.length > 30 ? sel.nome.slice(0, 29) + '…' : sel.nome}
          </text>
        </g>
      )}
    </svg>
  )
}
