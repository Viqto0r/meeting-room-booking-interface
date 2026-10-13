import { startBrowser, stopBrowser, saveResults } from './harness.mjs'

const groups = (process.env.QA_GROUPS ?? 'display,create,edit,delete,conflicts,a11y,extra').split(
  ',',
)
await startBrowser()
try {
  for (const g of groups) {
    await import(`./groups/${g}.mjs`)
    saveResults(g)
  }
} finally {
  await stopBrowser()
}
