import { scenario, ui, bk, D, BASE, refetchedAfterMutation, requestLog } from '../harness.mjs'

const failedLoad = [/Failed to load resource/]
const FOREIGN = 'Занято другим сотрудником'
const bubble = (page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))
const conflictAlert = (page) =>
  page.getByRole('alert').filter({ hasText: 'Пока вы заполняли форму' })

async function fillForm(t, start, end, title) {
  const u = ui(t.page)
  await u.newBooking().click()
  await u.heading('Новая бронь').waitFor()
  await u.start().selectOption(start)
  await u.end().selectOption(end)
  await u.title().fill(title)
}

/** Shared expectations after a 409 (E50, E53, E54-after-submit). */
async function expectConflictState(t, { start, end, title, conflictText }) {
  const { page } = t
  const u = ui(page)
  const alert = conflictAlert(page)
  await alert.waitFor()
  await page.getByText('Список обновлён — выберите другое время.').waitFor()
  const text = await alert.innerText()
  t.check(text.includes(conflictText), `alert не содержит «${conflictText}»: ${text}`)
  t.eq(
    [await u.start().inputValue(), await u.end().inputValue(), await u.title().inputValue()],
    [start, end, title],
    'значения формы после 409',
  )
  t.check((await t.focused()).includes('Начало'), `фокус: ${await t.focused()}`)
  t.check(await page.getByText(/Время пересекается с/).isVisible(), 'нет ошибки интервала')
  t.check(
    await page.getByText('Только что занято').first().isVisible(),
    'нет подсветки «Только что занято»',
  )
  t.check(await refetchedAfterMutation(t, D), 'нет GET после 409')
}

await scenario(
  'E50',
  'forceConflictNext: alert, «Обновляем…» → «Список обновлён», значения сохранены',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await page.getByText('На эту дату бронирований нет').waitFor()
    await t.dev('PUT', '/api/__dev/simulation', { forceConflictNext: true })
    await fillForm(t, '10:00', '11:00', 'Важная встреча')
    await t.shot('before-submit')
    await t.dev('PUT', '/api/__dev/simulation', { latencyMs: 1500 })
    await u.create().click()
    await page.getByText('Обновляем список…').waitFor({ timeout: 4000 })
    t.check((await t.focused()).includes('Начало'), `фокус сразу после 409: ${await t.focused()}`)
    await t.shot('409-refreshing')
    await expectConflictState(t, {
      start: '10:00',
      end: '11:00',
      title: 'Важная встреча',
      conflictText: `10:00–11:00 «${FOREIGN}»`,
    })
    await t.shot('409')
  },
  { expectErrors: failedLoad },
)

await scenario(
  'E51',
  'после 409 выбрать другое время → успех, alert и подсветка исчезли',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await page.getByText('На эту дату бронирований нет').waitFor()
    await t.dev('PUT', '/api/__dev/simulation', { forceConflictNext: true })
    await fillForm(t, '10:00', '11:00', 'Важная встреча')
    await u.create().click()
    await page.getByText('Список обновлён — выберите другое время.').waitFor()
    await u.start().selectOption('12:00')
    t.check(
      await conflictAlert(page).isVisible(),
      'alert исчез при смене времени (должен жить до submit)',
    )
    await u.create().click()
    await u
      .toast()
      .filter({ hasText: /Бронь создана: 12:00/ })
      .waitFor()
    t.eq(await conflictAlert(page).count(), 0, 'alert остался')
    t.eq(await page.getByText('Только что занято').count(), 0, 'подсветка осталась')
  },
  { expectErrors: failedLoad },
)

await scenario(
  'E52',
  'DevPanel: гонка 100% → POST 409; PATCH 10:00–11:00 → 11:30 → 409, пересечений нет',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Моя')] })
    await u.block(/Моя/).waitFor()
    await page.getByRole('button', { name: 'Панель симуляции' }).click()
    await page.getByLabel('100%').check()
    await page.waitForTimeout(300)
    await t.shot('devpanel-race', { fullPage: true })
    await fillForm(t, '14:00', '15:00', 'Через гонку')
    await u.create().click()
    await conflictAlert(page).waitFor()
    await page.getByText('Список обновлён — выберите другое время.').waitFor()
    await page.getByRole('button', { name: 'Отмена' }).click()
    await u.block(/Моя/).click()
    await u.heading('Редактирование брони').waitFor()
    await u.end().selectOption('11:30')
    await u.save().click()
    await conflictAlert(page).waitFor()
    await page.getByText('Список обновлён — выберите другое время.').waitFor()
    const list = (await t.dev('GET', `/api/bookings?date=${D}`)).body
    t.check(
      list.some((b) => b.title === FOREIGN && b.start === '11:00' && b.end === '11:30'),
      `нет чужой брони 11:00–11:30: ${JSON.stringify(list)}`,
    )
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
    t.check(
      sorted.every((b, i) => i === 0 || sorted[i - 1].end <= b.start),
      `пересечения в хранилище: ${JSON.stringify(sorted)}`,
    )
  },
  { expectErrors: failedLoad },
)

async function twoPages(t, { refetchOnFocus }) {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}` })
  await page.getByText('На эту дату бронирований нет').waitFor()
  if (!refetchOnFocus) {
    await page.getByRole('button', { name: 'Панель симуляции' }).click()
    await page.getByLabel('Обновлять при возврате на вкладку').uncheck()
  }
  const b = await t.newPage()
  await b.goto(`${BASE}/?date=${D}`)
  await b.waitForFunction(() => window.__mswReady === true)
  await b.getByText('На эту дату бронирований нет').waitFor()
  return { page, u, b }
}

await scenario(
  'E53',
  'две вкладки, обновление выключено: B создаёт, A отправляет → поведение E50',
  async (t) => {
    const { u, b } = await twoPages(t, { refetchOnFocus: false })
    await fillForm(t, '10:00', '11:00', 'Из вкладки A')
    const created = await t.dev('POST', '/api/bookings', bk(D, '10:00', '11:00', 'Из вкладки B'), b)
    t.eq(created.status, 201, 'вторая вкладка создала бронь')
    const before = (await requestLog(t)).filter((r) => r.method === 'GET').length
    await u.create().click()
    await expectConflictState(t, {
      start: '10:00',
      end: '11:00',
      title: 'Из вкладки A',
      conflictText: '10:00–11:00 «Из вкладки B»',
    })
    t.check(before >= 1, '')
    await t.shot('409-two-tabs')
    await b.close()
  },
  { expectErrors: failedLoad },
)

await scenario(
  'E54',
  'обновление включено: visibilitychange в A → рефетч без отправки, ошибка интервала',
  async (t) => {
    const { page, u, b } = await twoPages(t, { refetchOnFocus: true })
    await fillForm(t, '10:00', '11:00', 'Из вкладки A')
    await t.dev('POST', '/api/bookings', bk(D, '10:00', '11:00', 'Из вкладки B'), b)
    const gets = async () =>
      (await requestLog(t)).filter((r) => r.method === 'GET' && r.path.includes(`date=${D}`)).length
    const before = await gets()
    await bubble(page)
    await page
      .getByText(/Время пересекается с: 10:00–11:00 «Из вкладки B»/)
      .waitFor({ timeout: 4000 })
    t.check((await gets()) > before, 'A не перезапросил список')
    t.eq((await requestLog(t)).filter((r) => r.method === 'POST').length, 0, 'POST был отправлен')
    t.eq(
      [await u.start().inputValue(), await u.end().inputValue(), await u.title().inputValue()],
      ['10:00', '11:00', 'Из вкладки A'],
      'значения формы',
    )
    await t.shot('409-before-submit')
    await b.close()
  },
)

await scenario(
  'E55',
  'POST 500: сообщение, данные сохранены, повтор успешен',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await page.getByText('На эту дату бронирований нет').waitFor()
    await fillForm(t, '10:00', '11:00', 'Данные')
    await t.dev('PUT', '/api/__dev/simulation', {
      failNext: { kind: '500', method: 'POST', count: 1 },
    })
    await u.create().click()
    const alert = page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' })
    await alert.waitFor()
    t.check(
      (await alert.innerText()).includes('Проверьте соединение и попробуйте ещё раз'),
      'текст сообщения',
    )
    t.eq(
      [await u.start().inputValue(), await u.end().inputValue(), await u.title().inputValue()],
      ['10:00', '11:00', 'Данные'],
      'значения',
    )
    await t.shot('500')
    t.check(await refetchedAfterMutation(t, D), 'нет GET после 500')
    await u.create().click()
    await u.toast().filter({ hasText: 'Бронь создана: 10:00–11:00' }).waitFor()
  },
  { expectErrors: failedLoad },
)

await scenario(
  'E56',
  'POST сетевая ошибка: текст про соединение, данные сохранены',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await page.getByText('На эту дату бронирований нет').waitFor()
    await fillForm(t, '10:00', '11:00', 'Данные')
    await t.dev('PUT', '/api/__dev/simulation', {
      failNext: { kind: 'network', method: 'POST', count: 1 },
    })
    await u.create().click()
    const alert = page.getByRole('alert').filter({ hasText: 'Проверьте соединение' })
    await alert.waitFor()
    t.eq(
      [await u.start().inputValue(), await u.title().inputValue()],
      ['10:00', 'Данные'],
      'значения',
    )
    await t.shot('network')
    t.check(await refetchedAfterMutation(t, D), 'нет GET после сетевой ошибки')
  },
  { expectErrors: failedLoad },
)

await scenario(
  'E57',
  '409 + рефетч падает: «Не удалось обновить список» + «Повторить»',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await page.getByText('На эту дату бронирований нет').waitFor()
    await fillForm(t, '10:00', '11:00', 'Данные')
    await t.dev('PUT', '/api/__dev/simulation', {
      forceConflictNext: true,
      failNext: { kind: '500', method: 'GET', count: 2 },
    })
    await u.create().click()
    const alert = conflictAlert(page)
    await alert.waitFor()
    await page.getByText('Не удалось обновить список.').first().waitFor({ timeout: 6000 })
    t.check(
      (await alert.getByRole('button', { name: 'Повторить' }).count()) === 1,
      'нет «Повторить» в alert',
    )
    await t.shot('409-refresh-failed')
    await alert.getByRole('button', { name: 'Повторить' }).click()
    await page.getByText('Список обновлён — выберите другое время.').waitFor()
    t.eq(
      [await u.start().inputValue(), await u.title().inputValue()],
      ['10:00', 'Данные'],
      'значения',
    )
  },
  { expectErrors: failedLoad },
)

await scenario(
  'E58',
  'после каждой ошибки мутации в requestLog есть GET нужной даты',
  async (t) => {
    const { page } = t
    const u = ui(page)
    const cases = [
      ['500', { failNext: { kind: '500', method: 'POST', count: 1 } }],
      ['network', { failNext: { kind: 'network', method: 'POST', count: 1 } }],
      ['409', { forceConflictNext: true }],
    ]
    for (const [name, sim] of cases) {
      await t.open({ path: `/?date=${D}` })
      await page.getByText('На эту дату бронирований нет').waitFor()
      await fillForm(t, '10:00', '11:00', 'X')
      await t.dev('PUT', '/api/__dev/simulation', sim)
      await u.create().click()
      await page.getByRole('alert').first().waitFor()
      await page.waitForTimeout(800)
      t.check(await refetchedAfterMutation(t, D), `${name}: нет GET после мутации`)
    }
  },
  { expectErrors: failedLoad },
)
