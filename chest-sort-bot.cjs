'use strict'

// Node.js 22+. Install: npm install mineflayer mineflayer-pathfinder prismarine-viewer
// Example: MC_USER=bot@example.com MC_HOST=localhost PICAT_JS=./picat.js VIEWER_PORT=3000 node chest-sort-bot.cjs
// Put picat.wasm next to picat.js. Run the bot account in Adventure mode.
// VIEWER_PORT enables an unauthenticated listener on all interfaces. Use a private network.
const { spawn } = require('node:child_process')
const { resolve } = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')
const { isDeepStrictEqual: equal } = require('node:util')
const { existsSync } = require('node:fs')

const EMPTY = 'empty'

class StalePlan extends Error {}

function numberEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return value
}

// Include stack metadata so the planner never treats distinct items as interchangeable.
function canonical(value) {
  if (value === undefined) return ['undefined']
  if (typeof value === 'bigint') return ['bigint', value.toString()]
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

function stackKey(item) {
  return JSON.stringify(canonical([item.name, item.type, item.metadata, item.nbt,
    item.components, item.removedComponents]))
}

function makeLayouts(rows) {
  const types = [...new Set(rows.flat().filter(Boolean).map(stackKey))].sort()
  const symbols = new Map(types.map((key, i) => [key, `item_${i + 1}`]))
  const start = rows.map(row => row.map(item => {
    if (!item) return EMPTY
    if (!Number.isSafeInteger(item.count) || item.count < 1) throw new Error('Invalid stack count')
    return `stack(${symbols.get(stackKey(item))},${item.count})`
  }))
  const stacks = rows.flat().filter(Boolean)
    .map(item => [stackKey(item), item.count])
    .sort(([a, n], [b, m]) => (a < b ? -1 : a > b ? 1 : m - n))
    .map(([key, count]) => `stack(${symbols.get(key)},${count})`)
  if (stacks.length > rows.slice(0, -1).reduce((count, chest) => count + chest.length, 0)) {
    throw new Error('The managed chests lack enough empty slots to store all stacks')
  }
  let cursor = 0
  const goal = start.map((row, index) => row.map(() =>
    index === start.length - 1 ? EMPTY : (stacks[cursor++] ?? EMPTY)))
  return { start, goal }
}

async function runPicat(file, start, goal, timeoutMs) {
  const term = rows => `[${rows.map(row => `[${row.join(',')}]`).join(',')}]`
  const child = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'pipe'] })
  try {
    const output = await new Promise((resolveOutput, reject) => {
      const timer = setTimeout(() => reject(new Error('Picat timed out')), timeoutMs)
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => {
        stdout += chunk
        if (stdout.length > 128_000) reject(new Error('Picat output limit exceeded'))
      })
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
      child.stdin.on('error', reject)
      child.on('error', reject)
      child.on('close', code => {
        clearTimeout(timer)
        if (code === 0) resolveOutput(stdout)
        else reject(new Error(`Picat exited with code ${code}: ${stderr.trim()}`))
      })
      child.stdin.end(`solve(${term(start)},${term(goal)}).\n`)
    })
    if (output.trim() === 'No sorting plan') return null
    const lines = output.trim().split(/\r?\n/)
    const total = /^Total actions: (\d+)$/.exec(lines.pop() ?? '')
    if (!total || Number(total[1]) !== lines.length) throw new Error('Invalid Picat output')
    return lines.map(line => {
      const move = /^(take|deposit)\(([1-9]\d*),([1-9]\d*),([1-9]\d*)\)$/.exec(line)
      if (!move) throw new Error(`Invalid Picat move: ${line}`)
      return { kind: move[1], args: move.slice(2).map(Number) }
    })
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
}

function dryRun(moves, start, goal) {
  const rows = start.map(row => [...row])
  const player = rows.length - 1
  const actions = moves.map(({ kind, args: [a, b, c] }) => {
    const take = kind === 'take'
    const chest = (take ? a : b) - 1
    const chestSlot = (take ? b : c) - 1
    const playerSlot = (take ? c : a) - 1
    if (!Number.isSafeInteger(chest) || chest < 0 || chest >= player ||
        rows[chest][chestSlot] === undefined || rows[player][playerSlot] === undefined) {
      throw new Error('Picat move refers to a slot outside the managed inventory')
    }
    const source = take ? rows[chest] : rows[player]
    const dest = take ? rows[player] : rows[chest]
    const from = take ? chestSlot : playerSlot
    const to = take ? playerSlot : chestSlot
    if (source[from] === EMPTY || dest[to] !== EMPTY) throw new Error('Invalid Picat transfer')
    dest[to] = source[from]
    source[from] = EMPTY
    return { take, chest, chestSlot, playerSlot }
  })
  if (!equal(rows, goal)) throw new Error('Picat plan does not reach the goal')
  return actions
}

function row(window, start, end) {
  return window.slots.slice(start, end).map(item =>
    item ? { ...item, key: stackKey(item) } : null)
}

function signature(items) {
  return items.map(item => item ? [item.key, item.count] : null)
}

function assertAdventure(bot) {
  if (bot.game.gameMode !== 'adventure') throw new Error('Put the bot account in Adventure mode first')
}

function verifyWindow(bot, window, chest, player) {
  assertAdventure(bot)
  if (bot.currentWindow !== window || window.selectedItem) throw new Error('Unexpected window or occupied cursor')
  if (!equal(signature(row(window, 0, window.inventoryStart)), signature(chest)) ||
      !equal(signature(row(window, window.inventoryStart, window.inventoryStart + player.length)), signature(player))) {
    throw new StalePlan('Chest or managed player slots changed')
  }
}

async function transfer(bot, window, action, chest, player) {
  verifyWindow(bot, window, chest, player)
  const playerIndex = window.inventoryStart + action.playerSlot
  const source = action.take ? action.chestSlot : playerIndex
  const dest = action.take ? playerIndex : action.chestSlot
  const expected = action.take ? chest[action.chestSlot] : player[action.playerSlot]

  // Once a click has been attempted, an ambiguous result requires an operator.
  // Closing and automatically replanning with an unknown cursor can lose a stack.
  try {
    await bot.clickWindow(source, 0, 0)
    if (bot.currentWindow !== window || !window.selectedItem ||
        stackKey(window.selectedItem) !== expected.key || window.selectedItem.count !== expected.count ||
        window.slots[source] || window.slots[dest]) {
      throw new Error('Source pickup did not match expected state')
    }
    assertAdventure(bot)
    await bot.clickWindow(dest, 0, 0)
    chest[action.chestSlot] = action.take ? null : expected
    player[action.playerSlot] = action.take ? expected : null
    verifyWindow(bot, window, chest, player)
  } catch (cause) {
    throw new Error('Transfer interrupted. Inspect the chest, player inventory, and cursor before restarting.', { cause })
  }
}

async function deadline(work, ms, label) {
  let timer
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function withChest(bot, GoalLookAtBlock, position, work) {
  assertAdventure(bot)
  const block = bot.blockAt(position)
  if (block?.name !== 'chest' || block.getProperties().type !== 'single') {
    throw new StalePlan(`Single chest missing at ${position}`)
  }
  await deadline(() => bot.pathfinder.goto(new GoalLookAtBlock(position, bot.world, { reach: 4 })),
    30000, `Walking to chest at ${position}`)
  assertAdventure(bot)
  const current = bot.blockAt(position)
  if (current?.name !== 'chest' || current.getProperties().type !== 'single') {
    throw new StalePlan(`Chest changed while walking to ${position}`)
  }
  const window = await deadline(() => bot.openContainer(current), 10000,
    `Opening chest at ${position}`)
  let safeToClose = false
  try {
    if (window.inventoryStart !== 27 || window.selectedItem) throw new Error('Unexpected chest layout or cursor')
    const result = await work(window)
    safeToClose = true
    return result
  } catch (error) {
    safeToClose = error instanceof StalePlan && !window.selectedItem
    throw error
  } finally {
    if (safeToClose && bot.currentWindow === window) await window.close()
  }
}

function boundDigging(bot) {
  // Adventure mode is the server-side backstop. These guards also reject plugin calls.
  bot.dig = async () => { throw new Error('Digging is disabled for this bot') }
  bot.placeBlock = async () => { throw new Error('Block placement is disabled for this bot') }
}

async function sortLoop(bot, goals, config) {
  const origin = bot.entity.position.floored()
  let checkedInitialPlayer = false
  const stage = (n, message) => console.log(`[${n}] ${message}`)
  while (true) {
    try {
      stage(0, 'Discover and snapshot')
      assertAdventure(bot)
      const positions = bot.findBlocks({
        point: origin,
        matching: block => block?.name === 'chest' && block.getProperties().type === 'single',
        maxDistance: config.radius,
        count: config.maxChests + 1
      }).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
      if (positions.length > config.maxChests) throw new Error('Too many chests in the scan area. Reduce CHEST_RADIUS or increase MAX_CHESTS.')
      const chestRows = []
      for (const position of positions) {
        chestRows.push(await withChest(bot, goals.GoalLookAtBlock, position,
          window => row(window, 0, window.inventoryStart)))
      }
      if (positions.length === 0) {
        console.log('No loaded single chests in the scan area')
        if (config.dryRun) return
        await sleep(config.interval)
        continue
      }
      const playerStart = bot.inventory.inventoryStart
      const player = row(bot.inventory, playerStart, playerStart + config.playerSlots)
      if (!checkedInitialPlayer && player.some(Boolean)) {
        throw new Error('Managed player slots are occupied. Empty them before starting.')
      }
      checkedInitialPlayer = true
      stage(1, 'Choose exact goal slots')
      const { start, goal } = makeLayouts([...chestRows, player])
      stage(2, 'Find plan')
      const moves = equal(start, goal) ? [] : await runPicat(config.picat, start, goal, config.planTimeout)
      if (moves === null) {
        console.log('No sorting plan for this layout')
        if (config.dryRun) return
      } else {
        stage(3, 'Validate plan before any inventory changes')
        const actions = dryRun(moves, start, goal)
        if (config.dryRun) {
          console.log(JSON.stringify(moves))
          return
        }
        stage(4, `Execute and verify ${actions.length} transfers`)
        for (const [index, action] of actions.entries()) {
          console.log(`Move ${index + 1}/${actions.length}: ${moves[index].kind}(${moves[index].args.join(',')})`)
          await withChest(bot, goals.GoalLookAtBlock, positions[action.chest],
            window => transfer(bot, window, action, chestRows[action.chest], player))
        }
        if (actions.length) {
          for (const [index, position] of positions.entries()) {
            await withChest(bot, goals.GoalLookAtBlock, position,
              window => verifyWindow(bot, window, chestRows[index], player))
          }
        }
        console.log('Sorted')
      }
    } catch (error) {
      if (!(error instanceof StalePlan)) throw error
      console.warn(`${error.message}. Taking a fresh snapshot next cycle.`)
    }
    await sleep(config.interval)
  }
}

function main() {
  const mineflayer = require('mineflayer')
  const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
  const config = {
    picat: resolve(process.env.PICAT_JS ?? 'picat.js'),
    radius: numberEnv('CHEST_RADIUS', 12, 1, 32),
    maxChests: numberEnv('MAX_CHESTS', 2, 1, 10),
    playerSlots: numberEnv('PLAYER_SLOTS', 1, 1, 27),
    interval: numberEnv('SCAN_INTERVAL_MS', 10000, 1000, 3600000),
    planTimeout: numberEnv('PLAN_TIMEOUT_MS', 10000, 100, 120000),
    dryRun: process.env.DRY_RUN === '1',
    viewerPort: numberEnv('VIEWER_PORT', 0, 0, 65535)
  }
  if (!process.env.MC_USER || !existsSync(config.picat)) throw new Error('Set MC_USER and PICAT_JS before starting')
  const options = { username: process.env.MC_USER, auth: process.env.MC_AUTH ?? 'microsoft' }
  if (process.env.MC_VERSION) options.version = process.env.MC_VERSION
  if (process.env.MC_REALM_ID) {
    if (options.auth !== 'microsoft') throw new Error('Realms require Microsoft authentication')
    options.realms = { realmId: process.env.MC_REALM_ID }
  } else {
    options.host = process.env.MC_HOST ?? 'localhost'
    options.port = numberEnv('MC_PORT', 25565, 1, 65535)
  }
  const bot = mineflayer.createBot(options)
  bot.loadPlugin(pathfinder)
  const stop = error => {
    if (error) console.error(error)
    process.exit(error ? 1 : 0)
  }
  bot.once('end', reason => stop(new Error(`Disconnected: ${reason}`)))
  bot.on('error', stop)
  process.once('SIGINT', () => stop())
  bot.once('spawn', async () => {
    try {
      assertAdventure(bot)
      boundDigging(bot)
      const movements = new Movements(bot)
      movements.canDig = false
      movements.allow1by1towers = false
      movements.canOpenDoors = false
      movements.scafoldingBlocks = []
      bot.pathfinder.setMovements(movements)
      if (config.viewerPort) {
        require('prismarine-viewer').mineflayer(bot, { port: config.viewerPort, firstPerson: true })
      }
      await deadline(() => bot.waitForChunksToLoad(), 30000, 'Loading initial chunks')
      await sortLoop(bot, goals, config)
      if (config.dryRun) {
        if (bot.viewer) bot.viewer.close()
        stop()
      }
    } catch (error) {
      stop(error)
    }
  })
}

if (require.main === module) main()
module.exports = { makeLayouts, runPicat, dryRun, transfer, stackKey }
