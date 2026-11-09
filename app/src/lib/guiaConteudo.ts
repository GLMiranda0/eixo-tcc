/**
 * Conteúdo técnico do guia interativo: o que cada sensor detecta, a cobertura de diagnóstico
 * que resulta da combinação escolhida e a avaliação dos pontos de instalação.
 */
import type { PontoId } from '../components/MotorSvg'
import type { Grandeza } from './types'

export interface InfoSensor {
  g: Grandeza
  nome: string
  chave: string
  detecta: string
  instalacao: string
  /** sensor fixo do coletor Eixo (sempre ligado) */
  padraoEixo: boolean
}

export const SENSORES: InfoSensor[] = [
  { g: 'corr', nome: 'Corrente', chave: 'corr', detecta: 'Sobrecarga, perda de fase e partidas pesadas. Base dos limites de 105 % e 115 % da corrente nominal.', instalacao: 'Transformador de corrente (alicate) em um único condutor de fase.', padraoEixo: true },
  { g: 'temp', nome: 'Temperatura', chave: 'temp', detecta: 'Sobreaquecimento, ventilação deficiente e perda de isolação (classe F: 70 °C atenção, 85 °C crítico).', instalacao: 'Sensor de contato fixado na carcaça, sobre o pacote de chapas.', padraoEixo: true },
  { g: 'vib', nome: 'Vibração', chave: 'vib', detecta: 'Desbalanceamento, desalinhamento e falha de rolamento (zonas A a D da ISO 10816-3).', instalacao: 'Acelerômetro no mancal do lado acoplado, na direção radial.', padraoEixo: true },
  { g: 'rot', nome: 'Rotação', chave: 'rot', detecta: 'Velocidade real do eixo. Separa a linha de base por faixa de rotação em aplicações com inversor.', instalacao: 'Sensor Hall ou óptico na ponta de eixo, ou a saída de velocidade do inversor.', padraoEixo: false },
  { g: 'tens', nome: 'Tensão', chave: 'tens', detecta: 'Subtensão, sobretensão e desequilíbrio de alimentação.', instalacao: 'Medição nos bornes da caixa de ligação ou na saída do painel.', padraoEixo: false },
]

export type Nivel = 'ok' | 'warn' | 'crit' | 'info'

export interface ItemCobertura {
  titulo: string
  nivel: Nivel
  texto: string
}

/** Cobertura de diagnóstico para a combinação de sensores e o tipo de aplicação. */
export function cobertura(s: Partial<Record<Grandeza, boolean>>, aplicacao: 'fixa' | 'multispeed'): { itens: ItemCobertura[]; cobertos: number; total: number; recomendado: boolean } {
  const itens: ItemCobertura[] = []

  if (s.corr && s.vib) itens.push({ titulo: 'Sobrecarga mecânica', nivel: 'ok', texto: 'Corrente e vibração sobem juntas: o padrão é reconhecido e a ação corretiva é sugerida.' })
  else if (s.corr || s.vib) itens.push({ titulo: 'Sobrecarga mecânica', nivel: 'warn', texto: `Só ${s.corr ? 'a corrente' : 'a vibração'} é medida: a sobrecarga é detectada, mas sem a confirmação cruzada que separa causa elétrica de mecânica.` })
  else itens.push({ titulo: 'Sobrecarga mecânica', nivel: 'crit', texto: 'Sem corrente nem vibração a sobrecarga passa despercebida.' })

  if (s.vib) itens.push({ titulo: 'Rolamento, desalinhamento e desbalanceamento', nivel: 'ok', texto: 'Vibração RMS comparada às zonas da ISO 10816-3 e, depois, à linha de base aprendida.' })
  else itens.push({ titulo: 'Rolamento, desalinhamento e desbalanceamento', nivel: 'crit', texto: 'Sem vibração, falhas mecânicas só aparecem quando já elevam corrente ou temperatura, tarde demais.' })

  if (s.temp) itens.push({ titulo: 'Sobreaquecimento e ventilação', nivel: 'ok', texto: 'Temperatura da carcaça contra a classe de isolação; tendência lenta indica ventilação deficiente.' })
  else itens.push({ titulo: 'Sobreaquecimento e ventilação', nivel: 'crit', texto: 'Sem temperatura, a degradação da isolação não é supervisionada.' })

  if (s.rot) itens.push({ titulo: 'Variação de velocidade', nivel: 'ok', texto: 'Rotação medida: a linha de base é aprendida por faixa de velocidade. Recomendado para inversor de frequência.' })
  else if (aplicacao === 'multispeed')
    itens.push({
      titulo: 'Variação de velocidade',
      nivel: 'crit',
      texto: 'Não recomendado para aplicação multispeed sem rotação: o modelo assume a velocidade nominal. Ao mudar a velocidade, a vibração muda e gera alertas falsos ou mascara falhas. Ligue um sensor Hall, encoder ou a saída do inversor na chave "rot".',
    })
  else itens.push({ titulo: 'Variação de velocidade', nivel: 'info', texto: 'Velocidade nominal assumida. Adequado para partida direta ou soft-starter; se um dia este motor passar a inversor, acrescente a rotação.' })

  if (s.tens) itens.push({ titulo: 'Qualidade da alimentação', nivel: 'ok', texto: 'Sub e sobretensão detectadas (105 % e 110 % da nominal).' })
  else itens.push({ titulo: 'Qualidade da alimentação', nivel: 'info', texto: 'Opcional. Sem tensão, um afundamento de rede aparece só como corrente alta.' })

  const cobertos = itens.filter((i) => i.nivel === 'ok').length
  return { itens, cobertos, total: itens.length, recomendado: !itens.some((i) => i.nivel === 'crit') }
}

export interface Veredito {
  ok: boolean
  texto: string
}

/** Avalia o ponto escolhido para instalar um sensor. */
export function avaliarPonto(g: Grandeza, ponto: PontoId, aplicacao: 'fixa' | 'multispeed'): Veredito {
  const regras: Record<Grandeza, Partial<Record<PontoId, Veredito>>> = {
    vib: {
      mancal_la: { ok: true, texto: 'Correto. O mancal do lado acoplado recebe a carga: é onde a vibração de rolamento e desalinhamento aparece primeiro. Fixe o acelerômetro na direção radial, com parafuso ou base magnética limpa.' },
      mancal_loa: { ok: true, texto: 'Aceitável. O mancal oposto também transmite bem a vibração, mas prefira o lado acoplado, onde a carga chega. Em motores com ventilador grande, este lado pode somar a vibração do próprio ventilador.' },
      carcaca: { ok: false, texto: 'Sinal atenuado. As aletas e a chapa da carcaça amortecem a vibração que vem dos rolamentos. Instale no mancal.' },
      ventilador: { ok: false, texto: 'Errado. A tampa do ventilador é fina e vibra por conta própria: você mediria a tampa, não o motor.' },
      caixa: { ok: false, texto: 'Errado. A caixa de ligação é solta da estrutura e não transmite a vibração dos mancais.' },
      eixo: { ok: false, texto: 'Impossível: o eixo gira. Acelerômetros de contato vão em partes fixas, junto ao mancal.' },
      base: { ok: false, texto: 'Você mediria a fundação. Serve para diagnosticar a base, não o motor.' },
      cabos_juntos: { ok: false, texto: 'Cabos não transmitem vibração mecânica do motor.' },
      cabo_fase: { ok: false, texto: 'Cabos não transmitem vibração mecânica do motor.' },
      inversor: { ok: false, texto: 'O painel não vibra com o motor.' },
    },
    temp: {
      carcaca: { ok: true, texto: 'Correto. Sobre o pacote de chapas a carcaça acompanha a temperatura do enrolamento, que é o que a classe de isolação limita. Use pasta térmica e fixe entre duas aletas.' },
      mancal_la: { ok: true, texto: 'Aceitável. Aqui você mede a temperatura do mancal, útil para lubrificação, mas menos sensível ao aquecimento do enrolamento. O ideal é a carcaça.' },
      mancal_loa: { ok: true, texto: 'Aceitável. Temperatura de mancal, menos sensível ao enrolamento. O ideal é a carcaça sobre o pacote de chapas.' },
      caixa: { ok: false, texto: 'Errado. Você mediria o ar da caixa e os terminais, que esquentam por outro motivo (contato frouxo).' },
      ventilador: { ok: false, texto: 'Errado. A tampa recebe o ar frio de entrada: a leitura fica sempre baixa.' },
      eixo: { ok: false, texto: 'O eixo gira e não aceita sensor de contato.' },
      base: { ok: false, texto: 'A base dissipa calor para o piso: não representa o motor.' },
      cabos_juntos: { ok: false, texto: 'A temperatura do cabo diz respeito ao condutor, não ao motor.' },
      cabo_fase: { ok: false, texto: 'A temperatura do cabo diz respeito ao condutor, não ao motor.' },
      inversor: { ok: false, texto: 'O painel tem a própria temperatura, sem relação com o enrolamento.' },
    },
    corr: {
      cabo_fase: { ok: true, texto: 'Correto. O transformador de corrente envolve um único condutor de fase. Feche o núcleo até ouvir o clique e mantenha a seta no sentido painel → motor.' },
      caixa: { ok: true, texto: 'Aceitável. Dentro da caixa de ligação, desde que o alicate envolva um único condutor de fase (nunca os três). Com o motor desligado e o painel bloqueado.' },
      cabos_juntos: { ok: false, texto: 'Errado. Envolvendo as três fases, os campos magnéticos se cancelam e a leitura fica perto de zero.' },
      inversor: { ok: true, texto: 'Aceitável. Na saída do painel, em uma fase. Em inversores, a forma de onda é chaveada: use um transformador de corrente True RMS.' },
      mancal_la: { ok: false, texto: 'Corrente se mede no condutor, não na estrutura.' },
      mancal_loa: { ok: false, texto: 'Corrente se mede no condutor, não na estrutura.' },
      carcaca: { ok: false, texto: 'Corrente se mede no condutor, não na carcaça.' },
      ventilador: { ok: false, texto: 'Corrente se mede no condutor, não na tampa.' },
      eixo: { ok: false, texto: 'Corrente se mede no condutor de alimentação.' },
      base: { ok: false, texto: 'Corrente se mede no condutor de alimentação.' },
    },
    rot: {
      eixo: { ok: true, texto: 'Correto. Sensor Hall ou óptico apontado para um alvo na ponta de eixo ou no acoplamento: um pulso por volta.' },
      ventilador: { ok: true, texto: 'Aceitável. Um tacômetro óptico pelo furo da tampa lê a ventoinha, que gira com o eixo. Fica exposto a poeira.' },
      inversor: aplicacao === 'multispeed' ? { ok: true, texto: 'Correto. A saída analógica ou Modbus do inversor informa a velocidade sem sensor no motor.' } : { ok: false, texto: 'Este motor é de velocidade fixa (sem inversor). Use um sensor na ponta de eixo.' },
      mancal_la: { ok: false, texto: 'O mancal não gira. A rotação é lida de uma parte girante (eixo, acoplamento ou ventoinha).' },
      mancal_loa: { ok: false, texto: 'O mancal não gira. A rotação é lida de uma parte girante.' },
      carcaca: { ok: false, texto: 'A carcaça não gira.' },
      caixa: { ok: false, texto: 'A caixa de ligação não informa rotação.' },
      base: { ok: false, texto: 'A base não gira.' },
      cabos_juntos: { ok: false, texto: 'Os cabos não informam rotação (a frequência da corrente não é a velocidade do eixo).' },
      cabo_fase: { ok: false, texto: 'Os cabos não informam rotação.' },
    },
    tens: {
      caixa: { ok: true, texto: 'Correto. A tensão é medida por contato nos bornes da caixa de ligação, entre fases. Serviço com o painel bloqueado.' },
      inversor: { ok: true, texto: 'Correto. Na saída do painel, entre fases. Em inversor, só com medidor True RMS.' },
      cabo_fase: { ok: false, texto: 'Tensão exige contato elétrico: um alicate em volta do cabo mede corrente, não tensão.' },
      cabos_juntos: { ok: false, texto: 'Tensão exige contato elétrico nos bornes, não no isolamento do cabo.' },
      mancal_la: { ok: false, texto: 'Não há tensão na estrutura (e se houver, é falha de aterramento).' },
      mancal_loa: { ok: false, texto: 'Não há tensão na estrutura.' },
      carcaca: { ok: false, texto: 'Não há tensão na carcaça.' },
      ventilador: { ok: false, texto: 'Não há tensão na tampa.' },
      eixo: { ok: false, texto: 'Não há tensão no eixo.' },
      base: { ok: false, texto: 'Não há tensão na base.' },
    },
  }
  return regras[g][ponto] ?? { ok: false, texto: 'Este ponto não serve para esta grandeza.' }
}

/** Avalia o ponto escolhido para fixar o coletor: é eletrônica, precisa de cabos curtos, alimentação e pouco calor. */
export function avaliarColetor(ponto: PontoId): Veredito {
  const regras: Partial<Record<PontoId, Veredito>> = {
    caixa: { ok: true, texto: 'Correto. Ao lado da caixa de ligação os cabos dos sensores ficam curtos, a alimentação sai dos próprios bornes e o coletor fica fora do fluxo de ar quente. Os cabos dos sensores são ligados nas entradas dele.' },
    inversor: { ok: true, texto: 'Aceitável. Dentro do painel o coletor fica protegido e alimentado, mas os cabos dos sensores ficam longos: use cabo blindado e passe-o separado dos cabos de potência.' },
    base: { ok: true, texto: 'Aceitável. Na base o coletor fica longe do calor, mas exposto a água e óleo de lavagem: use caixa IP65 e deixe folga nos cabos dos sensores.' },
    carcaca: { ok: false, texto: 'Errado. A carcaça chega a 70 °C e vibra: a eletrônica do coletor não aguenta. Ele vai perto do motor, não nele.' },
    mancal_la: { ok: false, texto: 'Errado. O mancal vibra e aquece. Aqui vai o sensor de vibração, não o coletor.' },
    mancal_loa: { ok: false, texto: 'Errado. O mancal vibra e aquece. O coletor é eletrônica e fica fora do motor.' },
    ventilador: { ok: false, texto: 'Errado. A tampa do ventilador vibra e o coletor bloquearia a entrada de ar de refrigeração.' },
    eixo: { ok: false, texto: 'Impossível: o eixo gira.' },
    cabos_juntos: { ok: false, texto: 'Errado. Pendurado nos cabos de potência o coletor recebe interferência e balança com eles.' },
    cabo_fase: { ok: false, texto: 'Errado. Pendurado nos cabos de potência o coletor recebe interferência e balança com eles.' },
  }
  return regras[ponto] ?? { ok: false, texto: 'Este ponto não serve para o coletor.' }
}

export const ZONAS_VIB = [
  ['A', '< 1,8 mm/s', 'motor novo'],
  ['B', '1,8 a 2,8 mm/s', 'operação normal'],
  ['C', '2,8 a 4,5 mm/s', 'atenção: restrito a curta duração'],
  ['D', '≥ 4,5 mm/s', 'crítico: risco de dano'],
] as const
