import type { DataConnection, Peer as PeerType } from 'peerjs'
import type { NetMessage, PlayerInfo } from './types'

/**
 * Star topology over PeerJS: the host owns a well-known peer id, every client
 * connects to the host, and the host relays all messages.
 *
 * - Custom rooms use `bladeline-v1-<CODE>`.
 * - Matchmaking uses numbered public slots per mode (`bladeline-v1-mm-<mode>-<n>`):
 *   a queueing player joins the first slot that has room, or hosts the first
 *   empty one. Bots fill the rest of the lobby and are swapped out as humans join.
 *
 * Uses the free public PeerJS signalling server; gameplay data flows over WebRTC.
 */

const PREFIX = 'bladeline-v1-'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode() {
  let s = ''
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

export const roomPeerId = (code: string) => PREFIX + code.toUpperCase()
export const slotPeerId = (mode: string, slot: number) => `${PREFIX}mm-${mode}-${slot}`

export interface NetHandlers {
  onMessage: (msg: NetMessage, fromId: string) => void
  onError: (message: string) => void
  onPeerLeft: (id: string) => void
  onReady?: (myId: string, room: string) => void
  /** host only: decide whether a newcomer may join (and on which team). Return null when full. */
  admit?: (info: PlayerInfo) => PlayerInfo | null
}

export type HostResult = 'ok' | 'taken' | 'error'
export type JoinResult = 'ok' | 'missing' | 'full' | 'error'

export class Net {
  peer: PeerType | null = null
  isHost = false
  myId = ''
  room = ''
  private host: DataConnection | null = null
  private clients = new Map<string, DataConnection>()
  /** host-only: roster of everyone in the room (including host-run bots) */
  roster = new Map<string, PlayerInfo>()
  private closed = false
  private ready = false
  lastError = ''

  constructor(private handlers: NetHandlers) {}

  /** Try to claim a peer id and act as host. */
  async hostAs(peerId: string, room: string): Promise<HostResult> {
    const { Peer } = await import('peerjs')
    if (this.closed) return 'error'
    this.isHost = true
    this.room = room
    return new Promise<HostResult>((resolve) => {
      let settled = false
      const settle = (r: HostResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(r)
      }
      const timer = setTimeout(() => {
        this.lastError = 'The matchmaking server did not answer.'
        peer.destroy()
        settle('error')
      }, 10000)
      const peer = new Peer(peerId, { debug: 0 })
      this.peer = peer
      peer.on('open', (id) => {
        this.myId = id
        this.ready = true
        settle('ok')
      })
      peer.on('connection', (conn) => this.acceptClient(conn))
      peer.on('error', (err: { type?: string; message?: string }) => {
        if (!settled) {
          peer.destroy()
          if (err.type === 'unavailable-id') settle('taken')
          else {
            this.lastError = friendlyError(err)
            settle('error')
          }
          return
        }
        if (err.type === 'peer-unavailable') return // a client vanished mid-handshake
        if (!this.closed) this.handlers.onError(friendlyError(err))
      })
      peer.on('disconnected', () => {
        if (!this.closed && this.ready) peer.reconnect()
      })
    })
  }

  private acceptClient(conn: DataConnection) {
    conn.on('data', (raw) => {
      const msg = raw as NetMessage
      if (!msg || typeof msg !== 'object') return
      if (msg.t === 'hello') {
        if (this.clients.has(conn.peer)) return
        const proposed: PlayerInfo = {
          id: conn.peer,
          name: String(msg.name).slice(0, 16) || 'Ronin',
          color: String(msg.color).slice(0, 9),
          kills: 0,
          deaths: 0,
        }
        const info = this.handlers.admit ? this.handlers.admit(proposed) : proposed
        if (!info) {
          conn.send({ t: 'full' } satisfies NetMessage)
          setTimeout(() => conn.close(), 400)
          return
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
      // only the host may speak for bots or run the clock
      if (msg.t === 'match' || msg.t === 'welcome' || msg.t === 'join' || msg.t === 'full') return
      // never trust a client to speak for someone else
      if (msg.t === 'leave') return
      if (msg.t === 'state' || msg.t === 'chat') msg.id = conn.peer
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

  /** Try to join a host by peer id. */
  async joinAs(peerId: string, room: string, me: { name: string; color: string }): Promise<JoinResult> {
    const { Peer } = await import('peerjs')
    if (this.closed) return 'error'
    this.isHost = false
    this.room = room
    return new Promise<JoinResult>((resolve) => {
      let settled = false
      const settle = (r: JoinResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (r !== 'ok') peer.destroy()
        resolve(r)
      }
      const timer = setTimeout(() => {
        this.lastError = `Couldn't reach the room. Check the code and that the host is still online.`
        settle('error')
      }, 12000)
      const peer = new Peer({ debug: 0 })
      this.peer = peer
      peer.on('open', () => {
        const conn = peer.connect(peerId, { reliable: true })
        this.host = conn
        conn.on('open', () => conn.send({ t: 'hello', name: me.name, color: me.color } satisfies NetMessage))
        conn.on('data', (raw) => {
          const msg = raw as NetMessage
          if (msg.t === 'full') {
            settle('full')
            return
          }
          if (msg.t === 'welcome') {
            this.myId = msg.you
            this.ready = true
            settle('ok')
          }
          if (this.ready) this.handlers.onMessage(msg, conn.peer)
        })
        conn.on('close', () => {
          if (!this.closed && this.ready) this.handlers.onError('The host left, so the match has closed.')
        })
      })
      peer.on('error', (err: { type?: string; message?: string }) => {
        if (!settled) {
          if (err.type === 'peer-unavailable') settle('missing')
          else {
            this.lastError = friendlyError(err)
            settle('error')
          }
          return
        }
        if (!this.closed) this.handlers.onError(friendlyError(err))
      })
    })
  }

  /** Host a custom room with a random code (retries on collisions). */
  async hostRoom(me: { name: string; color: string }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeRoomCode()
      const r = await this.hostAs(roomPeerId(code), code)
      if (r === 'ok') {
        this.roster.set(this.myId, { id: this.myId, name: me.name, color: me.color, kills: 0, deaths: 0 })
        this.handlers.onReady?.(this.myId, code)
        return
      }
      if (r === 'error') break
    }
    this.handlers.onError(this.lastError || 'Could not open a room.')
  }

  /** Join a custom room by its 5-letter code. */
  async joinRoom(code: string, me: { name: string; color: string }) {
    const room = code.toUpperCase()
    const r = await this.joinAs(roomPeerId(room), room, me)
    if (r === 'ok') this.handlers.onReady?.(this.myId, room)
    else if (r === 'missing') this.handlers.onError(`Room ${room} doesn't exist (or the host left).`)
    else if (r === 'full') this.handlers.onError(`Room ${room} is full.`)
    else this.handlers.onError(this.lastError || 'Connection error.')
  }

  send(msg: NetMessage) {
    if (this.isHost) {
      if (msg.t === 'death') this.trackDeath(msg.id, msg.by)
      this.relay(msg, null)
    } else if (this.host?.open) {
      this.host.send(msg)
    }
  }

  get peerCount() {
    return this.clients.size
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
