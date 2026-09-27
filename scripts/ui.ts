/**
 * Drives the running dev app through CDP (Playwright). Usage:
 *   npx tsx scripts/ui.ts shot [name]         screenshot → scratch/<name>.png
 *   npx tsx scripts/ui.ts click "<selector>"  click an element
 *   npx tsx scripts/ui.ts type "<text>"       type into the focused element (xterm included)
 *   npx tsx scripts/ui.ts key "<key>"         press a key (Enter, Meta+t…)
 *   npx tsx scripts/ui.ts text "<selector>"   print an element's text
 *   npx tsx scripts/ui.ts eval "<js>"         evaluate in the page
 *   npx tsx scripts/ui.ts state               dump the workbench store (projects, tabs)
 * Several commands can be chained with `--`: shot a -- click .plus -- shot b
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const port = process.env.CT_CDP_PORT || '9333'
const outDir = process.env.CT_SHOTS || 'scratch'

async function main() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts()[0]?.pages().find((p) => p.url().includes('localhost') || p.url().startsWith('file:'))
  if (!page) throw new Error('renderer page not found')
  const argv = process.argv.slice(2)
  const cmds: string[][] = [[]]
  for (const a of argv) { if (a === '--') cmds.push([]); else cmds.at(-1)!.push(a) }
  for (const [cmd, ...args] of cmds) {
    switch (cmd) {
      case 'shot': {
        mkdirSync(outDir, { recursive: true })
        const p = `${outDir}/${args[0] ?? 'shot'}.png`
        await page.screenshot({ path: p })
        console.log(p)
        break
      }
      case 'click': await page.click(args[0], { timeout: 3000 }); break
      case 'dblclick': await page.dblclick(args[0], { timeout: 3000 }); break
      case 'type': await page.keyboard.type(args[0]); break
      case 'key': await page.keyboard.press(args[0]); break
      case 'text': console.log(await page.textContent(args[0], { timeout: 3000 })); break
      case 'eval': console.log(JSON.stringify(await page.evaluate(args[0]), null, 2)); break
      case 'state': console.log(JSON.stringify(await page.evaluate(`(() => { const s = window.__ct_state?.(); return s })()`), null, 2)); break
      case 'wait': await page.waitForTimeout(+args[0] || 500); break
      default: throw new Error('unknown command ' + cmd)
    }
  }
  await browser.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
