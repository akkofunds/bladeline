# BLADEHOP

A fast, browser-based multiplayer katana arena. Bunny hop and air-strafe to build speed, grapple off pillars when you lose momentum, and slash your friends across a wide open dusk-lit map. No guns, only blades, and the faster you're moving, the harder you hit.

## Features

- **Source-style movement**: ground friction, capped air acceleration and auto-hop (hold Space). Air-strafing with A/D while turning the mouse builds speed.
- **Katana combat**: alternating left and right slashes. Damage scales with your speed (26 base, up to a one-shot 100), and walls block strikes.
- **Grapple hook (F)**: hold F on any surface to swing. If you're slow, the hook pulls you back up to speed on attach.
- **Dash (right click)**, **jump pads** and **boost strips** spread across a 280 m arena with a central shrine, corner towers, bridges, pillars and floating platforms.
- **Animated ninjas**: procedural walk/run cycle, airborne tuck, slash swings with trails, grapple reach and death falls. You also get a first-person katana viewmodel and a third-person camera (V).
- **Peer-to-peer rooms with chat**: host a room, share the 5-letter code or invite link, and chat with Enter. Built on PeerJS/WebRTC, so no game server is needed.
- **Practice mode** against five sparring bots, plus bots duelling behind the lobby.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space (hold) | Jump / auto bunny hop |
| A/D + mouse | Air strafe |
| Left click | Slash |
| Right click | Dash |
| F (hold) | Grapple |
| V | Toggle third person |
| Enter / T | Chat |
| Tab | Scoreboard |

## Tech

TanStack Start + React 19, three.js for rendering, PeerJS (WebRTC data channels via the public PeerJS signalling server) for networking and chat, Tailwind CSS 4 + shadcn/ui for the HUD, and WebAudio-synthesised sound effects. Deployed on Netlify.

## Running locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
# or, with Netlify emulation:
netlify dev
```

Open two browser windows to test multiplayer: host in one, then join with the code in the other.

## Ideas for later

- Host-authoritative hit validation (hits are currently resolved by the attacker's client, which is the right trade-off for casual friend rooms)
- Persistent leaderboards (top speed, kills) using Netlify Database
- Parry/block, more maps, surf ramps, and a TURN server for players behind strict NATs
