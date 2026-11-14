# BLADELINE

A fast, browser-based katana arena. Bunny hop and air-strafe to build speed, grapple off pillars when you lose momentum, and slash your way across a bright concrete arena. The faster you're moving, the harder you hit.

## Features

- **Source-style movement**: ground friction, capped air acceleration and auto-hop (hold Space). Air-strafing with A/D while turning the mouse builds speed.
- **Katana combat**: alternating left and right slashes. Damage scales with your speed (26 base, up to a one-shot 100), and walls block strikes.
- **Hook (right click)**: a glowing red line that reels you in hard. Let go in the air to slingshot, or tap jump while hooked to fling off it. Keep holding jump afterwards and your next few bhops each add speed.
- **Dash (right click)**, **jump pads** and **boost strips** spread across a 280 m arena with a central shrine, corner towers, bridges, pillars and floating platforms.
- **Animated ninjas**: procedural walk/run cycle, airborne tuck, slash swings with trails, grapple reach and death falls. You also get a first-person katana viewmodel and a third-person camera (V).
- **Peer-to-peer rooms with chat**: host a room, share the 5-letter code or invite link, and chat with Enter. Built on PeerJS/WebRTC, so no game server is needed.
- **Modes**: Quick Play FFA, Skirmish 2v2 and 5v5 (team deathmatch, no friendly fire), and a Training range with passive dummies. Queued matches are filled with bots; Custom rooms let friends play FFA, 2v2 or 5v5 together.
- **Boot flow**: loading screen, a flyover of the map (Daybreak Shrine), then the lobby with a queue timer, match-found pop and a pre-match roster screen.
- **Mobile**: virtual stick, drag-to-look and touch buttons (drag on Jump/Slash/Hook to steer while holding them). Tap to play, no pointer lock needed.
- **Runs on Chromebooks**: Low/Medium/High quality (auto-detected), automatic resolution scaling when the frame rate dips, blob shadows instead of shadow maps on Low, and baked vertex shading instead of extra lighting passes.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space (hold) | Bunny hop · against a wall: wallrun · tap on a wall: wall jump |
| Left click | Katana slash (while sliding: slide attack, 2 stamina) |
| Right click (hold) | Hook · let go mid-air to slingshot · tap jump to fling off |
| F (or E) | Parry: blocks slashes and slams, deflects bullets |
| Q | Gun (ammo is earned by landing sword hits; recoil pushes you back) |
| Shift | Dash (1 stamina) |
| C (or Ctrl in fullscreen) | Slide · mid-air: ground slam · while hooked: slingshot launch |
| V | Third person |
| Enter / T | Chat |
| Tab | Scoreboard |

## Combat systems

- **Stamina**: 3 bars. Dash costs 1, a slide attack costs 2.
- **Instability**: fills when you take hits, get parried or lose a clash. At 100% you're **Destabilized** for 2.5 s: you can't attack, take extra damage, and trying to parry causes parry fatigue. Landing hits, slams, kills and destabilizing others lower it.
- **Clash**: two swings at the same moment. The faster player wins and the loser takes heavy instability.
- **No speed cap**: speed raises slash damage and knockback.

## Tech

TanStack Start + React 19, three.js for rendering, PeerJS (WebRTC data channels via the public PeerJS signalling server) for networking and chat, Tailwind CSS 4 + shadcn/ui for the HUD, and WebAudio-synthesised sound effects. Deployed on Netlify.

## Deploying

The game is fully client-side, so it builds as a static site: `pnpm build` writes `dist/client/index.html` plus assets.

- **Vercel**: import the repo. `vercel.json` sets the build command (`pnpm build`) and output directory (`dist/client`). No settings to change.
- **Netlify**: `netlify.toml` is already set up (publishes `dist/client`).
- **Anything else**: upload `dist/client` to any static host.

## Running locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
# or, with Netlify emulation:
netlify dev
```

Open two browser windows to test multiplayer (Custom tab): host in one, then join with the code in the other.

## Ideas for later

- Host-authoritative hit validation (hits are currently resolved by the attacker's client, which is the right trade-off for casual friend rooms)
- Persistent leaderboards (top speed, kills) using Netlify Database
- Parry/block, more maps, surf ramps, and a TURN server for players behind strict NATs
