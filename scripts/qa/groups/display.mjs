import { scenario, ui, bk, D, D2, TODAY, Y } from '../harness.mjs'

const err500 = [/Failed to load resource.*500/]

await scenario('E01', 'latency 1500: скелетон + aria-busy, затем брони', async (t) => {
  const { page } = t
  await t.open({
    path: `/?date=${D}`,
    bookings: [bk(D, '10:00', '11:00', 'Планёрка'), bk(D, '14:00', '15:00', 'Ревью')],
    simulation: { latencyMs: 1500 },
  })
  await page.waitForSelector('[aria-busy="true"]', { timeout: 1000 })
  t.check(
    (await page.locator('[aria-busy="true"]').count()) > 0,
    'нет элемента aria-busy=true во время загрузки',
  )
  await t.shot('skeleton')
  await ui(page)
    .block(/Планёрка/)
    .waitFor({ timeout: 4000 })
  t.eq(await page.locator('[aria-busy="true"]').count(), 0, 'aria-busy остался после загрузки')
  await t.shot('data')
})

await scenario('E02', 'дата без броней: пустое состояние + CTA', async (t) => {
  const { page } = t
  await t.open({ path: `/?date=${D2}` })
  await page.getByText('На эту дату бронирований нет').waitFor()
  t.check(
    await page.getByRole('button', { name: 'Забронировать' }).isVisible(),
    'CTA «Забронировать» не показан',
  )
  await t.shot('empty')
  await page.getByRole('button', { name: 'Забронировать' }).click()
  await ui(page).heading('Новая бронь').waitFor()
  t.check(true, '')
})

await scenario(
  'E03',
  'failNext GET×2 → ErrorState → «Повторить»',
  async (t) => {
    const { page } = t
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Планёрка')],
      simulation: { failNext: { kind: '500', method: 'GET', count: 2 } },
    })
    await page.getByText('Не удалось загрузить бронирования').waitFor()
    t.check(
      (await page.getByRole('alert').filter({ hasText: 'Не удалось загрузить' }).count()) === 1,
      'ErrorState без role=alert',
    )
    await t.shot('error')
    await page.getByRole('button', { name: 'Повторить' }).click()
    await ui(page)
      .block(/Планёрка/)
      .waitFor()
  },
  { expectErrors: err500 },
)

await scenario('E04', '← / → / Сегодня / «Показать дату»: брони, ?date=, reload', async (t) => {
  const { page } = t
  await t.open({
    bookings: [
      bk(D, '10:00', '11:00', 'Завтра'),
      bk(D2, '12:00', '13:00', 'Послезавтра'),
      bk(TODAY, '17:00', '17:30', 'Сегодня-бронь'),
    ],
  })
  const url = () => new URL(page.url()).searchParams.get('date')
  await page.waitForFunction((d) => new URL(location.href).searchParams.get('date') === d, TODAY)
  t.eq(url(), TODAY, 'дата в URL при старте')
  await page.getByRole('button', { name: 'Следующий день' }).click()
  await ui(page)
    .block(/Завтра/)
    .waitFor()
  t.eq(url(), D, 'URL после «→»')
  await page.getByRole('button', { name: 'Следующий день' }).click()
  await ui(page)
    .block(/Послезавтра/)
    .waitFor()
  t.eq(url(), D2, 'URL после второго «→»')
  await page.getByRole('button', { name: 'Предыдущий день' }).click()
  await ui(page)
    .block(/Завтра/)
    .waitFor()
  await page.getByRole('button', { name: 'Сегодня' }).click()
  await ui(page)
    .block(/Сегодня-бронь/)
    .waitFor()
  t.eq(url(), TODAY, 'URL после «Сегодня»')
  await page.getByLabel('Показать дату').fill(D2)
  await ui(page)
    .block(/Послезавтра/)
    .waitFor()
  t.eq(url(), D2, 'URL после ввода даты')
  await page.reload()
  await ui(page)
    .block(/Послезавтра/)
    .waitFor()
  t.eq(url(), D2, 'reload сохранил дату')
})

await scenario('E05', '?date=abc и ?date=2026-02-30 → сегодняшняя дата, без ошибок', async (t) => {
  const { page } = t
  await t.open({})
  for (const bad of ['abc', '2026-02-30']) {
    await page.goto(`${page.url().split('?')[0]}?date=${bad}`)
    await page.waitForFunction(() => window.__mswReady === true)
    await page.getByTestId('current-date').waitFor()
    await page.waitForFunction(
      (today) => new URLSearchParams(location.search).get('date') === today,
      TODAY,
    )
    t.eq(new URL(page.url()).searchParams.get('date'), TODAY, `URL для ${bad}`)
    t.check((await ui(page).current().innerText()).length > 5, `дата не показана для ${bad}`)
  }
})

await scenario('E06', 'прошедшая дата: бейдж, «Новая бронь» aria-disabled, просмотр', async (t) => {
  const { page } = t
  await t.open({ path: `/?date=${Y}`, bookings: [bk(Y, '10:00', '11:00', 'Вчерашняя')] })
  await page.getByText('Прошедшая дата').waitFor()
  const btn = ui(page).newBooking()
  t.eq(await btn.getAttribute('aria-disabled'), 'true', 'aria-disabled')
  await btn.focus()
  t.check((await t.focused()).includes('Новая бронь'), 'кнопка не получает фокус')
  t.check((await btn.getAttribute('aria-describedby')) !== null, 'нет aria-describedby')
  t.check(
    await page.getByText('Нельзя бронировать на прошедшую дату').isVisible(),
    'нет видимой причины',
  )
  await btn.click({ force: true })
  t.eq(await ui(page).heading('Новая бронь').count(), 0, 'форма открылась по aria-disabled кнопке')
  await t.shot('past-date')
  await ui(page)
    .block(/Вчерашняя/)
    .click()
  await ui(page).heading('Бронь (только просмотр)').waitFor()
  await t.shot('past-view')
})

await scenario('E07', 'рефетч при latency 1500: данные на месте + «Обновление…»', async (t) => {
  const { page } = t
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Планёрка')] })
  await ui(page)
    .block(/Планёрка/)
    .waitFor()
  await t.dev('PUT', '/api/__dev/simulation', { latencyMs: 1500 })
  // a refetch on tab return; the event must bubble to `window` for TanStack Query
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  )
  await page.getByText('Обновление…').waitFor({ timeout: 1000 })
  t.check(
    await ui(page)
      .block(/Планёрка/)
      .isVisible(),
    'данные пропали во время рефетча',
  )
  await t.shot('refreshing')
  await page.getByText('Обновление…').waitFor({ state: 'detached', timeout: 4000 })
})

await scenario(
  'E08',
  'смена даты при latency 1500: приглушение, клики заблокированы',
  async (t) => {
    const { page } = t
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Старая'), bk(D2, '12:00', '13:00', 'Новая')],
    })
    await ui(page)
      .block(/Старая/)
      .waitFor()
    await t.dev('PUT', '/api/__dev/simulation', { latencyMs: 1500 })
    await page.getByRole('button', { name: 'Следующий день' }).click()
    await page.waitForTimeout(200)
    t.check(
      await ui(page)
        .block(/Старая/)
        .isVisible(),
      'старые брони не показаны во время загрузки',
    )
    const grid = page.getByTestId('timeline-grid')
    t.check((await grid.getAttribute('class')).includes('opacity-50'), 'таймлайн не приглушён')
    await t.shot('dimmed')
    const cell = ui(page).cell('15:00')
    t.eq(await cell.getAttribute('title'), 'Загрузка…', 'title ячейки')
    await cell.click({ force: true })
    t.eq(
      await ui(page).heading('Новая бронь').count(),
      0,
      'клик по ячейке открыл форму во время загрузки',
    )
    await ui(page)
      .block(/12:00–13:00, Новая/)
      .waitFor({ timeout: 4000 })
    t.eq(
      await page.getByTestId('timeline-grid').evaluate((e) => e.className.includes('opacity-50')),
      false,
      'приглушение осталось',
    )
  },
)
