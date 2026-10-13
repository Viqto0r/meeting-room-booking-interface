// Builds docs/qa/REPORT.md from docs/qa/results/*.json and docs/qa/bugs.md.
import fs from 'node:fs'
const dir = new URL('../../docs/qa/results/', import.meta.url).pathname
const all = fs.readdirSync(dir).flatMap((f) => JSON.parse(fs.readFileSync(dir + f, 'utf8')))
const rows = new Map()
for (const r of all) {
  const key = r.id + (r.id === 'E63' ? r.title.slice(0, 11) : '')
  const row = rows.get(key) ?? { id: r.id, title: r.title, by: {} }
  row.by[r.viewport] = r
  rows.set(key, row)
}
const sorted = [...rows.values()].sort(
  (a, b) => a.id.localeCompare(b.id) || a.title.localeCompare(b.title),
)
const cell = (r) => (r ? r.status : '—')
const lines = [
  '| ID | Сценарий | Desktop 1280 | Mobile 375 | Скриншоты | Комментарий |',
  '|---|---|---|---|---|---|',
]
for (const row of sorted) {
  const shots = [...new Set(Object.values(row.by).flatMap((r) => r.shots))]
    .map((s) => `[${s.replace(/^E\d+-/, '').replace('.png', '')}](screenshots/${s})`)
    .join(', ')
  const notes = [
    ...new Set(
      Object.values(row.by).flatMap((r) => [
        ...r.failures,
        ...r.consoleErrors,
        ...r.notes.filter((n) => !n.startsWith('axe[')),
      ]),
    ),
  ].join('; ')
  lines.push(
    `| ${row.id} | ${row.title} | ${cell(row.by.desktop)} | ${cell(row.by.mobile)} | ${shots || '—'} | ${notes} |`,
  )
}
const total = all.length
const ok = all.filter((r) => r.status === '✅').length
const bugs = fs.existsSync(new URL('../../docs/qa/bugs.md', import.meta.url))
  ? fs.readFileSync(new URL('../../docs/qa/bugs.md', import.meta.url), 'utf8')
  : ''
const manual = fs.existsSync(new URL('../../docs/qa/manual.md', import.meta.url))
  ? fs.readFileSync(new URL('../../docs/qa/manual.md', import.meta.url), 'utf8')
  : ''
const secs = all.reduce((s, r) => s + r.seconds, 0)
fs.writeFileSync(
  new URL('../../docs/qa/REPORT.md', import.meta.url),
  `# Отчёт об интерактивной проверке UI

Прогон: \`npm run build && npm run preview\`, Playwright (chromium) — сценарии SPEC §9.2 на десктопе 1280×800 и мобильном 375×812 (E63 — на 320/375/768/1280).
Скрипты: \`scripts/qa/\` (\`node scripts/qa/run.mjs\`, \`QA_VIEWPORT=mobile\`). Во всех сценариях собираются \`console\` и \`pageerror\`: любая ошибка/warning, кроме заранее ожидаемых «Failed to load resource» для намеренно вызванных 4xx/5xx, помечает сценарий ❌.

**Итог:** ${ok}/${total} прогонов ✅. Суммарное время выполнения сценариев: ${Math.round(secs)} с.

${bugs}

## Результаты

${lines.join('\n')}

${manual}
`,
)
console.log('REPORT.md written', ok, '/', total)
