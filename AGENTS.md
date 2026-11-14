# AGENTS.md

BLADEHOP is a browser multiplayer katana arena game (bunny hop movement, grapple, slash combat, chat). It is a TanStack Start app with one route; all gameplay runs client-side in three.js. Networking is peer-to-peer over PeerJS, so there is no backend.

## Layout

```
src/
├── routes/index.tsx        # Mounts <BladeHop /> (the whole app)
├── routes/__root.tsx       # HTML shell, metadata, Google fonts (Teko + Chakra Petch), dark theme class
├── components/BladeHop.tsx # React UI: lobby, HUD, chat, kill feed, scoreboard, overlays
├── components/ui/          # shadcn/ui primitives (Button, Input, ...)
└── game/                   # Engine (framework-free TypeScript)
    ├── Game.ts             # Orchestrator: renderer, loop (fixed 120 Hz physics), input, combat, bots, net glue, HUD emit
    ├── physics.ts          # Quake-style movement (friction/accel/air-cap → bhop), AABB collision, grapple rope, raycasts
    ├── map.ts              # Seeded arena generation (identical on every peer) + merged mesh building w/ world-space grid UVs
    ├── avatar.ts           # Procedural box ninja + walk/jump/slash/grapple/death animations, katana model, name/HP label
    ├── viewmodel.ts        # First-person katana, rendered in a separate scene/camera so it never clips walls
    ├── net.ts              # PeerJS star topology: host owns peer id `bladehop-v1-<CODE>` and relays all messages
    ├── audio.ts            # WebAudio synthesised SFX (no asset files)
    └── types.ts            # NetMessage protocol, HudState, shared types
```

## Key decisions

- **SSR safety**: `BladeHop.tsx` only type-imports the engine; `Game` is loaded with dynamic `import()` inside `useEffect`. PeerJS is also dynamically imported in `net.ts`. Never import three.js/PeerJS at module level from routes/components.
- **Map determinism**: `generateMap()` uses a fixed-seed PRNG. Changing the seed or generation order changes the map for everyone, so all peers must run the same build.
- **Networking model**: clients send `state` at 20 Hz; remotes are extrapolated + smoothed. The attacker resolves slash hits locally against rendered positions and sends `hit` to the victim; the victim applies damage and broadcasts `death`. The host rewrites `id`/`from` fields to the sender's peer id to stop spoofing. The room closes if the host leaves.
- **Bots** exist only locally (lobby background and practice mode). They use the same `stepBody` physics as the player.
- **Damage formula** `slashDamage(speed)` lives in `Game.ts`; `BladeHop.tsx` mirrors it for the HUD preview (keep them in sync).
- The HUD is React state updated at about 15 Hz via `onHud`; per-frame visuals stay inside the engine.
- Theme colours are in `src/styles.css` under `.dark` (the html element always has `class="dark"`).

## Conventions

- Strict TypeScript, no unused locals. Use the `@/` alias.
- Gameplay tuning constants are at the top of `physics.ts` (`MOVE`) and `Game.ts`.
- Don't commit build output. `src/routeTree.gen.ts` is generated.

## Commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
