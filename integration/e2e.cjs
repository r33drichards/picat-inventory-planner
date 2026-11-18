'use strict'

const assert = require('node:assert/strict')
const { execFile, spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { createWriteStream } = require('node:fs')
const { mkdir, rename, writeFile } = require('node:fs/promises')
const { resolve } = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')
const { promisify } = require('node:util')
const { chromium } = require('playwright')

const exec = promisify(execFile)
const root = resolve(__dirname, '..')
const output = resolve(root, 'integration-results')
const project = `chest-sort-e2e-${randomBytes(6).toString('hex')}`
const composeArgs = ['compose', '-p', project, '-f', 'integration/compose.yaml']
const viewerPort = process.env.E2E_VIEWER_PORT ?? '3100'
const viewer = `http://127.0.0.1:${viewerPort}`

async function compose(...args) {
  const result = await exec('docker', [...composeArgs, ...args], { cwd: root, timeout: 300_000 })
  return result.stdout.trim()
}

async function rcon(command) {
  return compose('exec', '-T', 'minecraft', 'rcon-cli', command)
}

async function fixture() {
  for (const command of [
    'forceload add 0 0',
    'gamerule spawnRadius 0',
    'gamerule doMobSpawning false',
    'gamerule doDaylightCycle false',
    'time set noon',
    'fill -3 69 -4 13 69 4 minecraft:smooth_stone',
    'fill -3 70 -4 13 73 4 minecraft:air',
    'setworldspawn 0 70 0',
    'setblock 3 70 0 minecraft:chest[facing=north]',
    'setblock 9 70 0 minecraft:chest[facing=north]',
    'item replace block 9 70 0 container.4 with minecraft:stone 13',
    'item replace block 9 70 0 container.7 with minecraft:apple 3',
    'setblock 6 70 0 minecraft:bricks'
  ]) await rcon(command)
  await check('if data block 9 70 0 Items[{Slot:4b,id:"minecraft:stone",count:13}]')
  await check('if data block 9 70 0 Items[{Slot:7b,id:"minecraft:apple",count:3}]')
}

async function check(condition) {
  const result = await rcon(`execute ${condition}`)
  assert.match(result, /Test passed/, `Server assertion failed: ${condition}\n${result}`)
}

async function waitFor(test, label, timeoutMs) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await test()) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function installChestMeshes(page) {
  // Chest blockstates have no faces because vanilla draws them as block entities.
  // Supply a closed-chest mesh to the recording client using its existing atlas.
  await page.route('**/blocksStates/1.21.4.json', async route => {
    const response = await route.fetch()
    const states = await response.json()
    const plainModel = name => states[name].variants[''].model
    const chest = plainModel('chest')
    if (chest.elements.length === 0) {
      const box = (material, from, to) => ({
        from, to,
        faces: Object.fromEntries(Object.entries(plainModel(material).elements[0].faces)
          .map(([name, face]) => [name, { texture: face.texture }]))
      })
      const model = {
        ...chest,
        elements: [
          box('dark_oak_planks', [1, 0, 1], [15, 10, 15]),
          box('oak_planks', [1, 10, 1], [15, 14, 15]),
          box('gold_block', [7, 8, 0], [9, 12, 1])
        ]
      }
      states.chest.variants = Object.fromEntries(
        [['north', 0], ['east', 90], ['south', 180], ['west', 270]]
          .map(([facing, y]) => [`facing=${facing}`, { model, y }]))
    }
    await route.fulfill({ response, json: states })
  })
}

async function main() {
  await mkdir(output, { recursive: true })
  let bot
  let browser
  let context
  let recording
  let failure
  const log = createWriteStream(resolve(output, 'bot.log'))
  let text = ''
  try {
    await compose('up', '-d', '--wait', '--wait-timeout', '240')
    await fixture()
    browser = await chromium.launch({ args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      recordVideo: { dir: output, size: { width: 960, height: 540 } }
    })
    const page = await context.newPage()
    recording = page.video()
    await installChestMeshes(page)
    let pending = ''
    let latest
    let displayed
    let status = 'Waiting for the inventory scan'
    async function paint() {
      const key = JSON.stringify([latest, status])
      if (displayed === key) return
      await page.evaluate(({ state, status }) => {
        let hud = document.getElementById('sort-test-hud')
        if (!hud) {
          hud = document.createElement('aside')
          hud.id = 'sort-test-hud'
          hud.style.cssText = 'position:fixed;z-index:9999;bottom:16px;left:16px;right:16px;padding:14px 18px;background:#111922ee;color:white;border:1px solid #506376;border-radius:9px;font:15px system-ui;pointer-events:none'
          document.body.append(hud)
        }
        const title = document.createElement('strong')
        title.textContent = status || state?.message
        hud.replaceChildren(title)
        if (!state) return
        const rows = document.createElement('div')
        rows.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px'
        const headings = ['Chest 1', 'Chest 2', 'Bot inventory']
        const colors = ['#62edff', '#ffc66e', '#e8eef6']
        ;[...state.chests, state.player].forEach((items, i) => {
          const cell = document.createElement('div')
          const heading = document.createElement('b')
          heading.style.color = colors[i]
          heading.textContent = headings[i]
          const details = document.createElement('div')
          details.textContent = items.join('  ·  ') || 'Empty'
          cell.append(heading, details)
          rows.append(cell)
        })
        hud.append(rows)
      }, { state: latest, status })
      displayed = key
    }
    bot = spawn(process.execPath, ['chest-sort-bot.cjs'], {
      cwd: root,
      env: {
        ...process.env,
        MC_USER: 'ChestSorter',
        MC_AUTH: 'offline',
        MC_HOST: '127.0.0.1',
        MC_PORT: process.env.E2E_MC_PORT ?? '25565',
        MC_VERSION: '1.21.4',
        VIEWER_PORT: viewerPort,
        PICAT_JS: process.env.PICAT_JS ?? './dist/picat.js',
        PLAYER_SLOTS: '1',
        CHEST_RADIUS: '16',
        MAX_CHESTS: '2',
        DRY_RUN: '0',
        PLAN_TIMEOUT_MS: '30000',
        SCAN_INTERVAL_MS: '1000',
        START_DELAY_MS: '5000',
        SHOW_TRANSFERS: '1'
      }
    })
    let spawnError
    bot.on('error', error => { spawnError = error })
    for (const stream of [bot.stdout, bot.stderr]) {
      stream.on('data', chunk => {
        log.write(chunk)
        text = (text + chunk).slice(-65536)
      })
    }
    bot.stdout.on('data', chunk => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) {
        if (line.startsWith('VIEW ')) {
          latest = JSON.parse(line.slice(5))
          status = ''
        }
      }
    })
    const botAlive = () => {
      if (spawnError) throw spawnError
      if (bot.exitCode !== null || bot.signalCode !== null) throw new Error(`Bot exited\n${text}`)
    }
    await waitFor(async () => {
      botAlive()
      return fetch(viewer, { signal: AbortSignal.timeout(1000) })
        .then(response => response.ok, () => false)
    }, 'viewer', 30_000)
    await page.goto(viewer, { waitUntil: 'domcontentloaded' })
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 20000 })
    await waitFor(async () => {
      botAlive()
      await paint()
      return text.includes('Execute and verify 4 transfers') &&
        text.includes('Execute and verify 0 transfers') && /\nSorted\s*$/.test(text)
    }, 'a successful sort and zero-move repeat', 90_000)
    await check('if data block 3 70 0 Items[{Slot:0b,id:"minecraft:apple",count:3}]')
    await check('if data block 3 70 0 Items[{Slot:1b,id:"minecraft:stone",count:13}]')
    await check('unless data block 3 70 0 Items[2]')
    await check('unless data block 9 70 0 Items[0]')
    await check('unless data entity ChestSorter Inventory[0]')
    await check('if block 6 70 0 minecraft:bricks')
    assert.match(latest?.message ?? '', /^Move 4\/4/)
    status = 'PASS · Paper verified the final slots and the second pass moved nothing'
    await paint()
    await sleep(2500)
  } catch (error) {
    failure = error
  } finally {
    bot?.kill()
    log.end()
    for (const clean of [
      async () => {
        await context?.close()
        if (recording) await rename(await recording.path(), resolve(output, 'chest-sort.webm'))
      },
      async () => browser?.close(),
      async () => writeFile(resolve(output, 'paper.log'), await compose('logs', '--no-color')),
      async () => compose('down', '-v', '--remove-orphans')
    ]) {
      try {
        await clean()
      } catch (error) {
        console.error(error)
        failure ??= error
      }
    }
    const result = failure ? `FAIL: ${failure.message}` : 'PASS: exact chest slots, stack counts, empty player inventory, intact block, and zero-move repeat'
    await writeFile(resolve(output, 'result.txt'), `${result}\n`)
    if (failure) throw failure
    console.log(result)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
