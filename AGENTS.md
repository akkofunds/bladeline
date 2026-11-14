# AGENTS.md

BLADELINE (formerly BLADEHOP) is a browser katana arena game (bunny hop movement, grapple, slash combat, chat) with FFA / 2v2 / 5v5 / training modes. It is a TanStack Start app with one route; all gameplay runs client-side in three.js. Networking is peer-to-peer over PeerJS, so there is no backend.

## Layout

```
src/
├── routes/index.tsx        # Mounts <Bladeline /> (the whole app)
├── routes/__root.tsx       # HTML shell, metadata, Google fonts (Teko + Chakra Petch), dark theme class
├── components/bladeline/   # React UI
│   ├── Bladeline.tsx       # Screen flow (boot → lobby → queue → match), engine wiring, settings
│   ├── BootScreen.tsx      # Loading bar + map flyover title card
│   ├── Lobby.tsx           # Play / Custom / Career tabs, mode cards, queue banner
│   ├── MatchLoading.tsx    # Pre-match map + roster screen with countdown
│   ├── Hud.tsx             # In-game HUD, kill feed, chat, scoreboard, end screen, pause menu
│   ├── TouchControls.tsx   # Mobile stick, look zone, action buttons
│   ├── SettingsPanel.tsx   # Quality, controls, sensitivity, volume
│   └── settings.ts         # localStorage settings/stats, quality + touch detection
├── components/ui/          # shadcn/ui primitives (Button, Input, ...)
└── game/                   # Engine (framework-free TypeScript)
    ├── Game.ts             # Orchestrator: renderer, loop (fixed 120 Hz physics), input, combat, bots, net glue, HUD emit
    ├── physics.ts          # Quake-style movement (friction/accel/air-cap → bhop), AABB collision, grapple rope, raycasts
    ├── map.ts              # Seeded arena generation (identical on every peer) + merged meshes, grid UVs, baked vertex shading
    ├── scenery.ts          # Sky shader, skyline, embers, blob shadows (all cheap, ~1 draw call each)
    ├── rules.ts            # Modes, team colours, slashDamage. No three.js, safe to import from UI
    ├── avatar.ts           # Procedural box ninja + walk/jump/slash/grapple/death animations, katana model, name/HP label
    ├── viewmodel.ts        # First-person katana, rendered in a separate scene/camera so it never clips walls
    ├── net.ts              # PeerJS star topology: host owns peer id `bladeline-v2-<CODE>` and relays all messages
    ├── audio.ts            # WebAudio synthesised SFX (no asset files)
    └── types.ts            # NetMessage protocol, HudState, shared types
```

## Key decisions

- **SSR safety**: `components/bladeline/*` only type-imports the engine; `Game` is loaded with dynamic `import()` inside `useEffect`. PeerJS is also dynamically imported in `net.ts`. Never import three.js/PeerJS at module level from routes/components (`rules.ts` is fine).
- **Map determinism**: `generateMap()` uses a fixed-seed PRNG. Changing the seed or generation order changes the map for everyone, so all peers must run the same build.
- **Networking model**: clients send `state` at 20 Hz; remotes are extrapolated + smoothed. The attacker resolves slash hits locally against rendered positions and sends `hit` to the victim; the victim applies damage and broadcasts `death`. The host rewrites `id`/`from` fields to the sender's peer id to stop spoofing. The room closes if the host leaves.
- **Bots** exist only locally (lobby background and practice mode). They use the same `stepBody` physics as the player.
- **Damage formula** `slashDamage(speed)` lives in `rules.ts` and is shared by the engine and HUD.
- **Matches**: the local game (bot matches) or the host (online rooms) is authoritative for match end/restart and broadcasts `match` sync messages. The host assigns teams on join. Team colours are drawn relative to the viewer (allies teal, enemies red). No friendly fire: attackers skip allies and victims ignore hits from allies.
- **Performance**: quality presets live in `Game.applyQuality`; `adaptResolution` lowers pixel ratio when frames run long. Keep new effects cheap (Chromebooks, phones).
- **Touch**: `Game.setTouchMode(true)` makes `requestLock()` activate input without pointer lock; `TouchControls` drives `touchMove/touchLook/touchButton`.
- The HUD is React state updated at about 15 Hz via `onHud`; per-frame visuals stay inside the engine.
- Theme colours are in `src/styles.css` under `.dark` (the html element always has `class="dark"`).

## Deploy

Static SPA build (TanStack Start `spa` mode in `vite.config.ts`, shell prerendered to `dist/client/index.html`). `vercel.json` and `netlify.toml` both publish `dist/client`. The Netlify adapter plugin is only loaded when `NETLIFY` is set.

## Conventions

- Strict TypeScript, no unused locals. Use the `@/` alias.
- Gameplay tuning constants are at the top of `physics.ts` (`MOVE`) and `Game.ts`.
- Don't commit build output. `src/routeTree.gen.ts` is generated.

## Commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
