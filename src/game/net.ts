import type { DataConnection, Peer as PeerType } from 'peerjs'
import type { NetMessage, PlayerInfo } from './types'

/**
 * Star topology over PeerJS: the host owns the room peer id `bladehop-<CODE>`,
 * every client connects to the host, and the host relays all messages.
 * Uses the free public PeerJS signalling server; gameplay data flows over WebRTC.
 */

const PREFIX = 'bladehop-v1-'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode() {
  let s = ''
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

export interface NetHandlers {
  onMessage: (msg: NetMessage, fromId: string) => void
  onReady: (myId: string, room: string) => void
  onError: (message: string) => void
  onPeerLeft: (id: string) => void
}

export class Net {
  peer: PeerType | null = null
  isHost = false
  myId = ''
  room = ''
  private host: DataConnection | null = null
  private clients = new Map<string, DataConnection>()
  /** host-only: roster of everyone in the room */
  roster = new Map<string, PlayerInfo>()
  private closed = false

  constructor(private handlers: NetHandlers) {}

  async hostRoom(me: { name: string; color: string }, code = makeRoomCode(), attempt = 0): Promise<void> {
    const { Peer } = await import('peerjs')
    this.isHost = true
    this.room = code
    const peer = new Peer(PREFIX + code, { debug: 0 })
    this.peer = peer
    peer.on('open', (id) => {
      this.myId = id
      this.roster.set(id, { id, name: me.name, color: me.color, kills: 0, deaths: 0 })
      this.handlers.onReady(id, code)
    })
    peer.on('connection', (conn) => this.acceptClient(conn))
    peer.on('error', (err: { type?: string; message?: string }) => {
      if (err.type === 'unavailable-id' && attempt < 4) {
        peer.destroy()
        void this.hostRoom(me, makeRoomCode(), attempt + 1)
        return
      }
      if (err.type === 'peer-unavailable') return // a client vanished mid-handshake
      this.handlers.onError(friendlyError(err))
    })
    peer.on('disconnected', () => {
      if (!this.closed) peer.reconnect()
    })
  }

  private acceptClient(conn: DataConnection) {
    conn.on('data', (raw) => {
      const msg = raw as NetMessage
      if (msg.t === 'hello') {
        const info: PlayerInfo = {
          id: conn.peer,
          name: String(msg.name).slice(0, 16) || 'Ronin',
          color: String(msg.color),
          kills: 0,
          deaths: 0,
        }
        this.clients.set(conn.peer, conn)
        this.roster.set(conn.peer, info)
        conn.send({ t: 'welcome', you: conn.peer, players: [...this.roster.values()] } satisfies NetMessage)
        const join: NetMessage = { t: 'join', player: info }
        this.relay(join, conn.peer)
        this.handlers.onMessage(join, conn.peer)
        return
      }
      if (!this.clients.has(conn.peer)) return
      // never trust a client to speak for someone else
      if ('id' in msg && msg.t !== 'leave' && msg.t !== 'death') (msg as { id: string }).id = conn.peer
      if (msg.t === 'hit') msg.from = conn.peer
      if (msg.t === 'death') {
        msg.id = conn.peer
        this.trackDeath(msg.id, msg.by)
      }
      this.relay(msg, conn.peer)
      this.handlers.onMessage(msg, conn.peer)
    })
    const drop = () => {
      if (!this.clients.has(conn.peer)) return
      this.clients.delete(conn.peer)
      this.roster.delete(conn.peer)
      const leave: NetMessage = { t: 'leave', id: conn.peer }
      this.relay(leave, conn.peer)
      this.handlers.onPeerLeft(conn.peer)
    }
    conn.on('close', drop)
    conn.on('error', drop)
  }

  private trackDeath(id: string, by: string) {
    const v = this.roster.get(id)
    if (v) v.deaths++
    const k = this.roster.get(by)
    if (k && by !== id) k.kills++
  }

  async joinRoom(code: string, me: { name: string; color: string }): Promise<void> {
    const { Peer } = await import('peerjs')
    this.isHost = false
    this.room = code.toUpperCase()
    const peer = new Peer({ debug: 0 })
    this.peer = peer
    let welcomed = false
    const timeout = setTimeout(() => {
      if (!welcomed && !this.closed) this.handlers.onError(`Couldn't reach room ${this.room}. Check the code and that the host is still online.`)
    }, 12000)
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + this.room, { reliable: true })
      this.host = conn
      conn.on('open', () => conn.send({ t: 'hello', name: me.name, color: me.color } satisfies NetMessage))
      conn.on('data', (raw) => {
        const msg = raw as NetMessage
        if (msg.t === 'welcome') {
          welcomed = true
          clearTimeout(timeout)
          this.myId = msg.you
          this.handlers.onReady(msg.you, this.room)
        }
        this.handlers.onMessage(msg, conn.peer)
      })
      conn.on('close', () => {
        if (!this.closed) this.handlers.onError('The host left — the room has closed.')
      })
    })
    peer.on('error', (err: { type?: string; message?: string }) => {
      clearTimeout(timeout)
      this.handlers.onError(
        err.type === 'peer-unavailable' ? `Room ${this.room} doesn't exist (or the host left).` : friendlyError(err),
      )
    })
  }

  send(msg: NetMessage) {
    if (this.isHost) {
      if (msg.t === 'death') this.trackDeath(msg.id, msg.by)
      this.relay(msg, null)
    } else if (this.host?.open) {
      this.host.send(msg)
    }
  }

  private relay(msg: NetMessage, except: string | null) {
    for (const [id, c] of this.clients) {
      if (id === except || !c.open) continue
      // hits only matter to the target
      if (msg.t === 'hit' && msg.to !== id) continue
      c.send(msg)
    }
  }

  close() {
    this.closed = true
    for (const c of this.clients.values()) c.close()
    this.host?.close()
    this.peer?.destroy()
  }
}

function friendlyError(err: { type?: string; message?: string }) {
  switch (err.type) {
    case 'browser-incompatible':
      return 'This browser does not support WebRTC peer connections.'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Lost connection to the matchmaking server. Try again in a moment.'
    default:
      return err.message || 'Connection error.'
  }
}
