# Run the Minecraft chest sorter

The single-file Mineflayer bot uses the Picat planner to sort whole stacks
across nearby chests in Minecraft Java Edition. Start in a private test room
with two single chests, one misplaced stack, and a walkable route between
them.

## Set up the bot

1. Install Node.js 22 or later and clone the
   [planner repository](https://github.com/r33drichards/picat-inventory-planner).
2. From the repository root, install the bot's dependencies.

   ```bash
   npm install --no-save --package-lock=false \
     mineflayer@4.39.0 mineflayer-pathfinder@2.4.5 prismarine-viewer@1.33.0 canvas@3.2.0
   ```

3. Download `picat.js` and `picat.wasm` from the same
   [planner release](https://github.com/r33drichards/picat-inventory-planner/releases)
   and place both in the repository root. If you built the planner locally,
   set `PICAT_JS=./dist/picat.js` instead.
4. Put the bot account in Adventure mode and empty its first main-inventory
   slot. The bot requires Adventure mode and disables digging, scaffolding,
   and block placement.

## Preview and execute

Run from the repository root. Use the Microsoft account that will join the
server.

```bash
MC_USER=bot@example.com MC_HOST=localhost MC_PORT=25565 \
  PLAYER_SLOTS=1 VIEWER_PORT=3000 DRY_RUN=1 \
  node chest-sort-bot.cjs
```

For a Java Realm, set `MC_REALM_ID` instead of `MC_HOST` and `MC_PORT`.
The Microsoft account must already have access to the Realm. Mineflayer may
prompt for Microsoft device-code sign-in on the first connection.

With `DRY_RUN=1`, the bot visits and reads chests, prints the validated move
list, and exits. For a live run, remove `DRY_RUN=1`. Open
`http://localhost:3000` to watch the bot while it runs. The viewer has no
authentication and listens on all interfaces. Keep the port private.

## What the bot does

| Stage | Behavior |
| --- | --- |
| 0 | Discover loaded single chests within range of the bot's starting position and snapshot their slots. |
| 1 | Order stacks by item identity, then by descending count for identical items. Fill chest slots in coordinate order and slot order. |
| 2 | Pass both layouts to Picat with the managed player slots as the final row. |
| 3 | Replay the plan in memory and check that each move is legal and the final layout matches. |
| 4 | Walk to each chest, recheck the window, click the exact source and destination, and verify the transfer. Rescan after the batch, then repeat after the configured interval. |

Use single chests. The bot preserves stack counts and does not merge stacks.
Block breaking and placement are disabled, so blocked chests need a clear
walking route. If observed inventory changes invalidate the plan before a
click, the bot rescans. If a transfer is interrupted after a click, it stops.
Inspect the chest, the bot inventory, and any stack on the cursor before
restarting.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `MC_USER` | Required | Microsoft account for the bot. |
| `MC_HOST` | `localhost` | Java server address. Ignored when a Realm is configured. |
| `MC_PORT` | `25565` | Java server port. |
| `MC_REALM_ID` | Unset | Java Realm ID. Requires Microsoft auth. |
| `MC_VERSION` | Auto | Optional Java Edition protocol version override. |
| `MC_AUTH` | `microsoft` | Authentication mode. Use `offline` only for an offline test server. |
| `PICAT_JS` | `./picat.js` | Planner launcher, with its companion WASM file next to it. |
| `PLAYER_SLOTS` | `1` | First 1–27 slots of the main inventory reserved as temporary storage. Start with these empty. |
| `CHEST_RADIUS` | `12` | Scan radius in blocks from the initial bot position. |
| `MAX_CHESTS` | `2` | Stop if the scan finds more than this many eligible chests. |
| `SCAN_INTERVAL_MS` | `10000` | Wait between sort cycles. |
| `PLAN_TIMEOUT_MS` | `10000` | Stop a planner run that exceeds this time. |
| `VIEWER_PORT` | `0` | First-person viewer port. Zero disables it. |
| `DRY_RUN` | Unset | Set to `1` to preview a plan without transferring items. |

Start with a small room and a few stacks. An exact-slot search can grow quickly
as stacks and empty slots increase. See [How the planner searches](../concepts/planning.md).

## Run the Paper integration test

Install Docker with the Compose plugin. Run from the repository root with
the normal bot dependencies installed and the planner release files in
`dist/`. Install Playwright and Chromium.

```bash
npm install --no-save --package-lock=false \
  mineflayer@4.39.0 mineflayer-pathfinder@2.4.5 prismarine-viewer@1.33.0 canvas@3.2.0 playwright@1.56.1
npx playwright install chromium
```

After accepting the [Minecraft EULA](https://aka.ms/MinecraftEULA), run:

```bash
EULA=TRUE node integration/e2e.cjs
```

The test starts a disposable offline-mode Paper 1.21.4 superflat server,
listening only on loopback. It creates two chests with mismatched stacks,
runs the real bot, and verifies exact chest slots, counts, an empty bot
inventory, an intact block along the route, and a zero-move second pass.
The test removes its Compose world volume on exit. When running multiple copies, set `E2E_MC_PORT` and `E2E_VIEWER_PORT` to
different unused local ports.

Find the result, logs, and the Prismarine Viewer WebM in
`integration-results/`. A failure before Chromium starts can only produce
diagnostics. On GitHub, apply the `minecraft-e2e` label to a pull request or
dispatch **Minecraft E2E** manually from Actions. The PR reporter posts the
result and a download link to the video and logs. GitHub serves the recording
inside a workflow artifact ZIP.
