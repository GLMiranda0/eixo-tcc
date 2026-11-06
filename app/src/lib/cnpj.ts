/**
 * CNPJ numérico ou alfanumérico (IN RFB 2.229/2024, novos cadastros a partir de julho/2026):
 * 12 posições [0-9A-Z] + 2 dígitos verificadores em módulo 11, com valor do caractere = ASCII − 48.
 * Mesma regra de cnpj_valido() no banco (migração 004).
 */
export const normalizarCnpj = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14)

export function formatarCnpj(s: string | null | undefined) {
  const c = normalizarCnpj(s ?? '')
  const partes = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)]
  let out = partes[0]
  if (partes[1]) out += '.' + partes[1]
  if (partes[2]) out += '.' + partes[2]
  if (partes[3]) out += '/' + partes[3]
  if (partes[4]) out += '-' + partes[4]
  return out
}

function dv(base: string, pesos: number[]) {
  const soma = [...base].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * pesos[i], 0)
  const r = soma % 11
  return r < 2 ? 0 : 11 - r
}

export function cnpjValido(s: string) {
  const c = normalizarCnpj(s)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false
  const d1 = dv(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(c.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return Number(c[12]) === d1 && Number(c[13]) === d2
}
