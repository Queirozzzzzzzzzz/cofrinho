import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'data.json')
const RE = /^!(saldo|extrato|remover)(?:\s+(\d+))?\s*$/i

const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = iso => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
})

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} }
}

function save(data) {
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

// Retorna texto de resposta, ou null se não for um comando.
export function comando(m, text) {
  const match = RE.exec((text || '').trim())
  if (!match) return null

  const jid = m.key.participant || m.key.remoteJid
  const number = jid.split('@')[0].split(':')[0]
  const all = load()
  const list = all[number] || []
  if (!list.length) return 'Nenhum registro ainda.'

  if (match[1].toLowerCase() === 'remover') {
    if (!match[2]) return 'Use: !remover ID'
    const id = Number(match[2])
    const i = list.findIndex(x => x.id === id)
    if (i === -1) return 'ID ' + id + ' não encontrado.'
    const r = list[i]
    if (r.disabled) return 'ID ' + id + ' já está desabilitado.'
    r.disabled = true
    r.disabledAt = new Date().toISOString()
    save(all)
    return '🗑️ Desabilitado #' + id + ': ' + brl(r.value) + (r.description ? ' (' + r.description + ')' : '')
  }

  if (match[1].toLowerCase() === 'saldo') {
    const sum = t => list.filter(x => !x.disabled && x.type === t).reduce((a, x) => a + x.value, 0)
    const entradas = sum('entrada')
    const saidas = sum('saida')
    return '💰 Saldo: ' + brl(entradas - saidas) +
      '\n⬆️ Entradas: ' + brl(entradas) +
      '\n⬇️ Saídas: ' + brl(saidas)
  }

  const n = Math.min(Math.max(Number(match[2]) || 10, 1), 50)
  const linhas = list.filter(x => !x.disabled).slice(-n).map(x =>
    '#' + x.id + ' ' + (x.type === 'entrada' ? '➕ ' : '➖ ') + brl(x.value) + ' | ' + fmtDate(x.date) +
    (x.description ? '\n    ' + x.description : ''))
  return '📋 Últimos ' + linhas.length + ':\n\n' + linhas.join('\n')
}
