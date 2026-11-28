import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { registrar } from '../manager/finance.js'
import { comando } from '../manager/commands.js'
import { iniciarRelatorio } from '../manager/report.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const AUTH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'auth')

// ---- Trava de instância única: impede duas cópias do bot na mesma sessão ----
const LOCK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bot.lock')

function outraInstancia() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'))
    if (!pid || pid === process.pid) return 0
    try { process.kill(pid, 0); return pid } catch (e) { return e.code === 'EPERM' ? pid : 0 }
  } catch { return 0 }
}

// espera até 5 s (o pm2 pode estar encerrando a cópia anterior)
for (let i = 0; i < 10 && outraInstancia(); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
const outra = outraInstancia()
if (outra) {
  console.error('Já existe outra instância do bot rodando (PID ' + outra + '). Encerrando.')
  process.exit(1)
}
fs.writeFileSync(LOCK, String(process.pid))
process.on('exit', () => {
  try { if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK) } catch {}
})
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(0))
process.on('unhandledRejection', e => console.error('Erro não tratado:', e))

// ---- Ignora mensagens reentregues (reconexão) ----
const vistas = new Set()
function jaProcessada(m) {
  const id = m.key.id
  if (!id) return false
  const chave = m.key.remoteJid + '|' + id
  if (vistas.has(chave)) return true
  vistas.add(chave)
  if (vistas.size > 2000) vistas.delete(vistas.values().next().value)
  return false
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH)
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === 'open') {
      console.log('Conectado')
      iniciarRelatorio(sock)
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.connectionReplaced) {
        console.error('Sessão assumida por outra instância do bot. Encerrando.')
        process.exit(1)
      } else if (code !== DisconnectReason.loggedOut) setTimeout(start, 3000)
      else console.log('Sessão encerrada. Apague a pasta auth e escaneie de novo.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      if (m.key.fromMe) continue
      const chat = m.key.remoteJid || ''
      if (!chat.endsWith('@s.whatsapp.net') && !chat.endsWith('@lid') && !chat.endsWith('@g.us')) continue // privadas e grupos
      const destino = chat.endsWith('@g.us') ? m.key.participant : chat // em grupo, responde no privado de quem enviou
      if (!destino) continue
      if (jaProcessada(m)) continue
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text
      if (text === '!ping') await sock.sendMessage(m.key.remoteJid, { text: 'pong' })
      let resp = null
      try { resp = registrar(m, text) ?? comando(m, text) } catch (e) {
        console.error('Erro ao processar mensagem:', e)
        resp = '⚠️ Erro interno ao processar. Tente de novo.'
      }
      if (resp) {
        try { await sock.sendMessage(destino, { text: resp }) } catch (e) {
          console.error('Falha ao responder ' + destino + ': ' + e.message)
        }
      }
    }
  })
}
start()
