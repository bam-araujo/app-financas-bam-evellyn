/**
 * Saudação personalizada por horário e nome. Pura — recebe o nome + um Date
 * (default = agora) e devolve string + emoji.
 *
 * Faixas:
 *  - 05–11h: bom dia ☀️
 *  - 12–17h: boa tarde 🌤️
 *  - 18–23h: boa noite 🌙
 *  - 00–04h: ainda acordada(o) 🦉
 */
export function greeting(nome: string, now: Date = new Date()): string {
  const h = now.getHours()
  if (h >= 5 && h < 12) return `Bom dia, ${nome} ☀️`
  if (h >= 12 && h < 18) return `Boa tarde, ${nome} 🌤️`
  if (h >= 18 && h < 24) return `Boa noite, ${nome} 🌙`
  return `Ainda acordada(o), ${nome}? 🦉`
}
