import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

export function lerJson(nome) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, nome), 'utf8')) } catch { return {} }
}

export function gravarJson(nome, data) {
  const file = path.join(DIR, nome)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

export const lerConfig = () => lerJson('config.json')
export const gravarConfig = d => gravarJson('config.json', d)

// Aceita "1.000,50", "1,000.50", "500,5" e "500.5"
export function parseValor(s) {
  const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (i === -1) return Number(s)
  const inteiro = s.slice(0, i).replace(/[.,]/g, '')
  return Number(`${inteiro}.${s.slice(i + 1)}`)
}
