import {
  scenario,
  ui,
  bk,
  D,
  D2,
  TODAY,
  Y,
  BASE,
  refetchedAfterMutation,
  requestLog,
} from '../harness.mjs'

const at = (date, time) => new Date(`${date}T${time}+03:00`)
const bubble = (page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))

await scenario('E30', 'продлить 10:00–11:00 до 11:30; свои опции не disabled', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Встреча')] })
  await u.block(/Встреча/).click()
  await u.heading('Редактирование брони').waitFor()
  t.eq(await u.start().locator('option[value="10:00"]').isDisabled(), false, 'своё начало disabled')
  t.eq(await u.start().locator('option[value="10:15"]').isDisabled(), false, '10:15 disabled')
  t.eq(await u.end().locator('option[value="11:30"]').isDisabled(), false, '11:30 disabled')
  await t.shot('edit-form')
  await u.end().selectOption('11:30')
  await u.save().click()
  await u.toast().filter({ hasText: 'Изменения сохранены' }).waitFor()
  await u.block(/10:00–11:30, Встреча/).waitFor()
  await page.waitForTimeout(300)
  t.check((await t.focused()).includes('10:00–11:30'), `фокус: ${await t.focused()}`)
})

await scenario(
  'E31',
  'продлить в соседнюю бронь: «занято»; сосед появился после открытия — ошибка интервала',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Моя'), bk(D, '11:30', '12:30', 'Сосед')],
    })
    await u.block(/Моя/).click()
    await u.heading('Редактирование брони').waitFor()
    t.eq(
      await u.end().locator('option[value="11:45"]').isDisabled(),
      true,
      '11:45 должно быть disabled',
    )
    t.check(
      (await u.end().locator('option[value="11:45"]').textContent()).includes('занято'),
      'нет текста «занято»',
    )
    t.eq(
      await u.end().locator('option[value="11:30"]').isDisabled(),
      false,
      '11:30 (касание) доступно',
    )
    await u.end().selectOption('11:30')
    t.eq(await page.getByText(/Время пересекается/).count(), 0, 'ошибка до появления соседа')
    await t.dev('POST', '/api/__dev/bookings', [bk(D, '11:00', '11:30', 'Новый')])
    await bubble(page)
    await page.getByText(/Время пересекается с: 11:00–11:30 «Новый»/).waitFor({ timeout: 3000 })
    t.eq(await u.end().inputValue(), '11:30', 'значение конца изменилось')
    await t.shot('interval-error')
  },
)

await scenario('E32', 'перенос на свободную дату', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Переезд')] })
  await u.block(/Переезд/).click()
  await u.heading('Редактирование брони').waitFor()
  await u.date().fill(D2)
  await page.getByText(/^Перенос на \d+ \S+$/).waitFor()
  await t.shot('move-note')
  await u.save().click()
  const toast = u.toast().filter({ hasText: /Бронь перенесена на/ })
  await toast.waitFor()
  t.eq(await u.block(/Переезд/).count(), 0, 'бронь осталась на исходной дате')
  await toast.getByRole('button', { name: 'Перейти' }).click()
  await u.block(/Переезд/).waitFor()
  t.eq(new URL(page.url()).searchParams.get('date'), D2, 'URL после «Перейти»')
})

await scenario(
  'E33',
  'перенос на дату с занятым слотом: валидация по целевой дате, submit заблокирован',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Моя'), bk(D2, '10:30', '11:30', 'Занят')],
    })
    await u.block(/Моя/).click()
    await u.heading('Редактирование брони').waitFor()
    await u.date().fill(D2)
    await page.getByText(/Время пересекается с: 10:30–11:30 «Занят»/).waitFor()
    await u.save().click()
    await page.waitForTimeout(400)
    const log = await requestLog(t)
    t.eq(log.filter((r) => r.method === 'PATCH').length, 0, 'PATCH был отправлен')
    t.check(await page.getByText(/Время пересекается/).isVisible(), 'ошибка исчезла')
    t.check((await t.focused()).includes('Начало'), `фокус: ${await t.focused()}`)
  },
)

await scenario('E34', 'очистить название → «Без названия»', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Имя')] })
  await u.block(/Имя/).click()
  await u.heading('Редактирование брони').waitFor()
  await u.title().fill('')
  await u.save().click()
  await u.block(/10:00–11:00, Без названия/).waitFor()
  t.check(!('title' in (await t.dev('GET', `/api/bookings?date=${D}`)).body[0]), 'title сохранился')
})

await scenario('E35', 'идущая бронь и бронь прошедшего дня: просмотр', async (t) => {
  const { page } = t
  const u = ui(page)
  await page.clock.setFixedTime(at(TODAY, '10:30:00'))
  await t.open({
    path: `/?date=${TODAY}`,
    bookings: [bk(TODAY, '10:00', '11:00', 'Идёт'), bk(Y, '10:00', '11:00', 'Была')],
  })
  await u.block(/Идёт/).click()
  await u.heading('Бронь (только просмотр)').waitFor()
  t.check(await page.getByText('идёт сейчас').first().isVisible(), 'нет статуса «идёт сейчас»')
  t.check(await page.getByRole('button', { name: 'Закрыть' }).isVisible(), 'нет «Закрыть»')
  t.eq(await page.locator('form input, form select, form textarea').count(), 0, 'есть поля формы')
  t.eq(
    await page.getByRole('button', { name: /Сохранить|Удалить|Создать/ }).count(),
    0,
    'есть кнопки изменения',
  )
  await t.shot('view-ongoing')
  await page.getByRole('button', { name: 'Закрыть' }).click()
  await u.heading('Бронь (только просмотр)').waitFor({ state: 'detached' })
  await page.getByLabel('Показать дату').fill(Y)
  await u.block(/Была/).click()
  await u.heading('Бронь (только просмотр)').waitFor()
  t.check(await page.getByText('прошла').first().isVisible(), 'нет статуса «прошла»')
  await t.shot('view-past')
})

await scenario(
  'E36',
  'edit открыт, время ушло за start → просмотр с несохранёнными значениями, PATCH не отправлен',
  async (t) => {
    const { page } = t
    const u = ui(page)
    // timers are driven by Playwright: install → resume → fastForward
    await page.clock.install({ time: at(TODAY, '09:30:00') })
    await t.open({ path: `/?date=${TODAY}`, bookings: [bk(TODAY, '10:00', '11:00', 'Скоро')] })
    await page.clock.resume()
    await u.block(/Скоро/).click()
    await u.heading('Редактирование брони').waitFor()
    await u.title().fill('Правка')
    await u.end().selectOption('11:30')
    await page.clock.fastForward(40 * 60 * 1000)
    await u.heading('Бронь (только просмотр)').waitFor({ timeout: 5000 })
    const alert = page.getByRole('alert').filter({ hasText: 'Бронь уже началась' })
    await alert.waitFor()
    const text = await alert.innerText()
    t.check(
      text.includes('10:00–11:30') && text.includes('Правка'),
      `в alert нет несохранённых значений: ${text}`,
    )
    const log = await requestLog(t)
    t.eq(log.filter((r) => r.method === 'PATCH').length, 0, 'PATCH был отправлен')
    await t.shot('locked-during-edit')
  },
)

await scenario(
  'E37',
  'edit → бронь удалена во второй вкладке → «Сохранить» → «Создать новую»',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Исчезнет')] })
    await u.block(/Исчезнет/).click()
    await u.heading('Редактирование брони').waitFor()
    await u.title().fill('Исчезнет (правка)')
    const id = (await t.dev('GET', `/api/bookings?date=${D}`)).body[0].id
    const b = await t.newPage()
    await b.goto(BASE + '/')
    await b.waitForFunction(() => window.__mswReady === true)
    const res = await t.dev('DELETE', `/api/bookings/${id}`, undefined, b)
    t.eq(res.status, 204, 'удаление во второй вкладке')
    await b.close()
    await u.save().click()
    await page.getByText('Эта бронь уже удалена').waitFor()
    await t.shot('not-found')
    t.check(await refetchedAfterMutation(t, D), 'нет GET после PATCH (404)')
    await page.getByRole('button', { name: 'Создать новую с этими данными' }).click()
    await u.heading('Новая бронь').waitFor()
    t.eq(
      [await u.start().inputValue(), await u.end().inputValue(), await u.title().inputValue()],
      ['10:00', '11:00', 'Исчезнет (правка)'],
      'значения формы',
    )
    await u.create().click()
    await u.toast().filter({ hasText: 'Бронь создана: 10:00–11:00' }).waitFor()
    await u.block(/Исчезнет \(правка\)/).waitFor()
  },
  { expectErrors: [/Failed to load resource.*404/] },
)
