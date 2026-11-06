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

export const nomePonto = (id: string | undefined) => PONTOS.find((p) => p.id === id)?.nome ?? '–'

const LETRA: Record<Grandeza, string> = { temp: 'T', corr: 'I', vib: 'V', rot: 'n', tens: 'U' }

export type StatusColetor = 'nenhum' | 'configurado' | 'conectando' | 'online' | 'erro'

interface Props {
  /** mostra os pontos clicáveis */
  pontos?: boolean
  pontoSelecionado?: string | null
  onEscolher?: (id: PontoId) => void
  /** sensor → ponto onde foi instalado */
  instalados?: Partial<Record<Grandeza, string>>
  coletor?: StatusColetor
  /** sensores habilitados (só para desenhar o coletor com as entradas certas) */
  sensores?: Partial<Record<Grandeza, boolean>>
  girando?: boolean
  alerta?: boolean
}

export function MotorSvg({ pontos = false, pontoSelecionado = null, onEscolher, instalados = {}, coletor = 'nenhum', girando = false, alerta = false }: Props) {
  const ledCor = coletor === 'online' ? 'var(--ok)' : coletor === 'erro' ? 'var(--crit)' : coletor === 'conectando' ? 'var(--warn)' : coletor === 'configurado' ? 'var(--accent)' : 'var(--border)'
  const pos = (id: string) => PONTOS.find((p) => p.id === id)
  const badges = (Object.entries(instalados) as [Grandeza, string][]).filter(([, p]) => p && pos(p))

  return (
    <svg className={'motor-svg' + (girando ? ' girando' : '') + (alerta ? ' alerta' : '')} viewBox="0 0 520 300" role="img" aria-label="Motor elétrico com pontos de instalação dos sensores">
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

      {/* coletor (gateway) */}
      <g>
        <rect x="436" y="198" width="72" height="52" rx="7" className="mg-painel" />
        <text x="472" y="222" textAnchor="middle" className="mg-txt">
          Coletor
        </text>
        <circle cx="500" cy="208" r="4" fill={ledCor} className={coletor === 'online' || coletor === 'conectando' ? 'mg-led on' : 'mg-led'} />
        <rect x="446" y="232" width="52" height="8" rx="2" fill="var(--muted)" opacity=".35" />
        {coletor !== 'nenhum' && badges.map(([g, p]) => {
          const pt = pos(p)!
          return <path key={g} d={`M${pt.x} ${pt.y} C ${pt.x} ${pt.y + 40}, 440 ${225 + 6 * badges.findIndex(([x]) => x === g)}, 440 ${226 + 4 * badges.findIndex(([x]) => x === g)}`} className="mg-fio" stroke={GRANDEZAS[g].cor} />
        })}
      </g>

      {/* sensores instalados */}
      {badges.map(([g, p]) => {
        const pt = pos(p)!
        return (
          <g key={g} className="mg-sensor">
            <circle cx={pt.x} cy={pt.y} r="11" fill={GRANDEZAS[g].cor} />
            <text x={pt.x} y={pt.y + 4} textAnchor="middle" className="mg-sensor-txt">
              {LETRA[g]}
            </text>
          </g>
        )
      })}

      {/* pontos clicáveis */}
      {pontos &&
        PONTOS.map((p, i) => {
          const ocupado = badges.some(([, pp]) => pp === p.id)
          return (
            <g
              key={p.id}
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
              <circle cx={p.x} cy={p.y} r="15" className="mg-ponto-halo" />
              <circle cx={p.x} cy={p.y} r="10" className="mg-ponto-circ" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="mg-ponto-txt">
                {i + 1}
              </text>
            </g>
          )
        })}
    </svg>
  )
}
