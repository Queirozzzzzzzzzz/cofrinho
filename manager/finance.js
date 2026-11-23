import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'data.json')
const RE = /^([+-])\s*(\d+(?:[.,]\d+)*)(?:\s+([\s\S]*))?$/

function parseValue(s) {
  const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (i === -1) return Number(s)
  const inteiro = s.slice(0, i).replace(/[.,]/g, '')
  return Number(`${inteiro}.${s.slice(i + 1)}`)
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} }
}

function save(data) {
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

// Retorna texto de resposta, ou null se a mensagem não for um registro.
export function registrar(m, text) {
  const match = RE.exec((text || '').trim())
  if (!match) return null

  const value = Math.round(parseValue(match[2]) * 100) / 100
  if (!Number.isFinite(value)) return null

  const type = match[1] === '+' ? 'entrada' : 'saida'
  const jid = m.key.participant || m.key.remoteJid
  const number = jid.split('@')[0].split(':')[0]
  const ts = Number(m.messageTimestamp) || Math.floor(Date.now() / 1000)

  let description = (match[3] || '').trim()
  let date = new Date(ts * 1000).toISOString()
  const dateMatch = /(?:^|\s)(\d{2})(\d{2})(\d{4})$/.exec(description)
  if (dateMatch) {
    const [, d, mo, y] = dateMatch
    const chk = new Date(Date.UTC(+y, +mo - 1, +d))
    if (chk.getUTCFullYear() === +y && chk.getUTCMonth() === +mo - 1 && chk.getUTCDate() === +d) {
      const hora = new Date(ts * 1000).toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23' })
      date = new Date(`${y}-${mo}-${d}T${hora}-03:00`).toISOString()
      description = description.slice(0, dateMatch.index).trim()
    }
  }

  const data = load()
  if (!data[number]) data[number] = []
  const id = data[number].reduce((a, x) => Math.max(a, x.id || 0), 0) + 1
  data[number].push({
    id,
    value,
    type,
    description,
    date,
  })
  save(data)

  return `✅ ${type === 'entrada' ? 'Entrada' : 'Saída'} de ${value.toFixed(2)} registrada (ID ${id})`
}
