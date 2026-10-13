import { scenario, ui, bk, D, D2, TODAY, requestLog } from '../harness.mjs'

const at = (date, time) => new Date(`${date}T${time}+03:00`)
const optionTexts = (loc) => loc.locator('option').allTextContents()

await scenario('E10', '«Новая бронь» → время → название → «Создать»', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '14:00', '15:00', 'Другая')] })
  await u.block(/Другая/).waitFor()
  await u.newBooking().click()
  await u.heading('Новая бронь').waitFor()
  t.check((await t.focused()).includes('Новая бронь'), 'фокус не на заголовке панели')
  await t.shot('form-initial')
  await u.start().selectOption('10:00')
  await u.end().selectOption('11:30')
  await u.title().fill('Планёрка команды')
  await u.create().click()
  await u.toast().filter({ hasText: 'Бронь создана: 10:00–11:30' }).waitFor()
  await u.block(/10:00–11:30, Планёрка команды/).waitFor()
  t.eq(await u.heading('Новая бронь').count(), 0, 'панель не закрылась')
  await page.waitForTimeout(300)
  t.check(
    (await t.focused()).includes('10:00–11:30, Планёрка команды'),
    `фокус не на новой брони: ${await t.focused()}`,
  )
  await t.shot('created')
})

await scenario(
  'E11',
  'границы дня: 09:00 … 17:30, для 17:30 единственное окончание 18:00',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    const starts = await u.start().locator('option').allTextContents()
    t.eq(starts[0], '09:00', 'первое начало')
    t.eq(starts.at(-1), '17:30', 'последнее начало')
    t.eq(starts.length, 35, 'количество начал')
    await u.start().selectOption('17:30')
    t.eq(await optionTexts(u.end()), ['18:00 (30 мин)'], 'окончания для 17:30')
    await u.create().click()
    await u.toast().filter({ hasText: 'Бронь создана: 17:30–18:00' }).waitFor()
    await t.shot('last-slot')
  },
)

await scenario('E12', 'длительность для начала 10:00: 10:30…12:00 с подписями', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}` })
  await u.newBooking().click()
  await u.heading('Новая бронь').waitFor()
  await u.start().selectOption('10:00')
  t.eq(
    await optionTexts(u.end()),
    [
      '10:30 (30 мин)',
      '10:45 (45 мин)',
      '11:00 (1 ч)',
      '11:15 (1 ч 15 мин)',
      '11:30 (1 ч 30 мин)',
      '11:45 (1 ч 45 мин)',
      '12:00 (2 ч)',
    ],
    'окончания',
  )
})

await scenario('E13', 'касание: 11:00–12:00 и 09:00–10:00 при брони 10:00–11:00', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Центр')] })
  await u.block(/Центр/).waitFor()
  for (const [s, e] of [
    ['11:00', '12:00'],
    ['09:00', '10:00'],
  ]) {
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await u.start().selectOption(s)
    await u.end().selectOption(e)
    t.eq(await page.getByText(/Время пересекается/).count(), 0, `ошибка пересечения для ${s}–${e}`)
    await u.create().click()
    await u
      .toast()
      .filter({ hasText: `Бронь создана: ${s}–${e}` })
      .waitFor()
    await u.heading('Новая бронь').waitFor({ state: 'detached' })
  }
  t.eq((await t.dev('GET', `/api/bookings?date=${D}`)).body.length, 3, 'брони в хранилище')
})

await scenario('E14', 'занято / меньше 30 мин свободно в опциях', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Занято')] })
  await u.block(/Занято/).waitFor()
  await u.newBooking().click()
  await u.heading('Новая бронь').waitFor()
  const opt = (v) => u.start().locator(`option[value="${v}"]`)
  t.eq(await opt('10:00').textContent(), '10:00 — занято', '10:00')
  t.eq(await opt('10:15').textContent(), '10:15 — занято', '10:15')
  t.eq(await opt('09:45').textContent(), '09:45 — меньше 30 мин свободно', '09:45')
  t.eq(await opt('09:45').isDisabled(), true, '09:45 disabled')
  t.eq(await opt('10:00').isDisabled(), true, '10:00 disabled')
  t.eq(await opt('09:30').textContent(), '09:30', '09:30 доступно')
  await u.start().selectOption('09:30')
  const endOpt = (v) => u.end().locator(`option[value="${v}"]`)
  t.eq(await endOpt('10:00').isDisabled(), false, 'окончание 10:00 доступно')
  t.eq(await endOpt('10:30').textContent(), '10:30 (1 ч) — занято', 'окончание 10:30')
  t.eq(await endOpt('10:30').isDisabled(), true, 'окончание 10:30 disabled')
  t.check(
    await page.getByText(/Свободно: 09:00–10:00, 11:00–18:00/).isVisible(),
    'подсказка «Свободно»',
  )
  await t.shot('busy-options')
})

await scenario(
  'E15',
  'сегодня, now = 10:07: начала с 10:15, штриховка и линия «сейчас»',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await page.clock.setFixedTime(at(TODAY, '10:07:00'))
    await t.open({ path: `/?date=${TODAY}`, bookings: [bk(TODAY, '16:00', '17:00', 'Позже')] })
    await u.block(/Позже/).waitFor()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    const starts = await u
      .start()
      .locator('option')
      .evaluateAll((os) => os.map((o) => o.value))
    t.eq(starts[0], '10:15', 'первое начало')
    t.check(!starts.includes('10:00') && !starts.includes('09:00'), 'прошедшие начала не скрыты')
    t.eq(await u.start().inputValue(), '10:15', 'начальное значение')
    const hatch = await page
      .getByTestId('past-hatch')
      .evaluate((e) => Math.round(e.getBoundingClientRect().height))
    t.check(
      Math.abs(hatch - Math.round(67 * 1.6)) <= 2,
      `высота штриховки ${hatch}, ожидалось ~107`,
    )
    t.check((await page.getByTestId('now-line').count()) === 1, 'нет линии «сейчас»')
    await t.shot('today-1007')
  },
)

await scenario('E16', 'now = 10:15:30 и 10:15:00.000: первое начало 10:30', async (t) => {
  const { page } = t
  const u = ui(page)
  for (const time of ['10:15:30', '10:15:00.000']) {
    await page.clock.setFixedTime(at(TODAY, time))
    await t.open({ path: `/?date=${TODAY}` })
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    t.eq(
      await u.start().locator('option').first().getAttribute('value'),
      '10:30',
      `первое начало при ${time}`,
    )
    t.eq(await u.start().inputValue(), '10:30', `значение при ${time}`)
  }
})

await scenario(
  'E17',
  'now = 17:30: «Новая бронь» disabled, клик по таймлайну ничего не открывает, CTA скрыт',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await page.clock.setFixedTime(at(TODAY, '17:30:00'))
    await t.open({ path: `/?date=${TODAY}` })
    await page.getByText('На эту дату бронирований нет').waitFor()
    t.eq(await u.newBooking().getAttribute('aria-disabled'), 'true', 'aria-disabled')
    t.check(
      await page.getByText('На сегодня бронирование уже недоступно').isVisible(),
      'причина не показана',
    )
    t.eq(await page.getByRole('button', { name: 'Забронировать' }).count(), 0, 'CTA виден')
    await u.cell('17:30').click({ force: true })
    await u.cell('12:00').click({ force: true })
    t.eq(
      await page.getByRole('heading', { level: 2, name: /бронь/i }).count(),
      0,
      'панель открылась',
    )
    await t.shot('day-over')
  },
)

await scenario(
  'E18',
  'будущий день занят целиком: «На эту дату нет свободного времени»',
  async (t) => {
    const { page } = t
    const u = ui(page)
    const full = [
      ['09:00', '11:00'],
      ['11:00', '13:00'],
      ['13:00', '15:00'],
      ['15:00', '17:00'],
      ['17:00', '18:00'],
    ].map(([s, e]) => bk(D, s, e, 'Занят'))
    await t.open({ path: `/?date=${D}`, bookings: full })
    await u.block(/17:00–18:00/).waitFor()
    t.eq(await u.newBooking().getAttribute('aria-disabled'), 'true', 'aria-disabled')
    t.check(
      await page.getByText('На эту дату нет свободного времени (от 30 мин)').isVisible(),
      'нет причины',
    )
    await t.shot('fully-booked')
  },
)

await scenario('E19', 'название: 100 / 101 / пробелы / « abc »', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}` })
  const create = async (start, end, text, expect) => {
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await u.start().selectOption(start)
    await u.end().selectOption(end)
    await u.title().click()
    await page.keyboard.type(text)
    await expect()
    await u.create().click()
    await u.heading('Новая бронь').waitFor({ state: 'detached' })
  }
  await create('09:00', '09:30', 'x'.repeat(100), async () =>
    t.check(await page.getByText('100/100').isVisible(), 'нет «100/100»'),
  )
  await create('10:00', '10:30', 'y'.repeat(101), async () => {
    t.eq((await u.title().inputValue()).length, 100, 'maxLength 100')
    t.check(await page.getByText('100/100').isVisible(), 'нет «100/100» при вводе 101')
  })
  await create('11:00', '11:30', '   ', async () => {})
  await create('12:00', '12:30', ' abc ', async () => {})
  const list = (await t.dev('GET', `/api/bookings?date=${D}`)).body
  t.eq(list.find((b) => b.start === '09:00').title.length, 100, 'сохранено 100 символов')
  t.eq(list.find((b) => b.start === '10:00').title.length, 100, 'сохранено 100 из 101')
  t.check(!('title' in list.find((b) => b.start === '11:00')), 'пробелы сохранились как название')
  t.eq(list.find((b) => b.start === '12:00').title, 'abc', 'trim')
  t.check(await u.block(/11:00–11:30, Без названия/).isVisible(), 'нет «Без названия» на таймлайне')
})

await scenario(
  'E20',
  'двойной клик и Enter×2 по «Создать» при latency 1500: один POST',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, simulation: { latencyMs: 1500 } })
    await u.newBooking().waitFor()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await u.start().selectOption('10:00')
    await u.create().dblclick()
    await page.getByText('Сохранение…').first().waitFor({ timeout: 800 })
    t.eq(await u.title().isDisabled(), true, 'поля формы не disabled (fieldset)')
    await t.shot('submitting')
    await u.heading('Новая бронь').waitFor({ state: 'detached', timeout: 5000 })
    const log1 = await requestLog(t)
    t.eq(log1.filter((r) => r.method === 'POST').length, 1, 'POST после dblclick')
    // Enter x2 from the title field
    await t.dev('POST', '/api/__dev/reset', { seed: false })
    await page.reload()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await u.start().selectOption('13:00')
    await u.title().focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await u.heading('Новая бронь').waitFor({ state: 'detached', timeout: 5000 })
    const log2 = await requestLog(t)
    t.eq(log2.filter((r) => r.method === 'POST').length, 1, 'POST после Enter×2')
  },
)

await scenario('E21', 'клик по ячейке 14:00 при брони 14:30; 14:15 заблокирована', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '14:30', '15:30', 'Сосед')] })
  await u.block(/Сосед/).waitFor()
  await u.cell('14:15').click({ force: true })
  t.eq(await u.heading('Новая бронь').count(), 0, 'клик по 14:15 открыл форму')
  t.eq(await u.cell('14:15').getAttribute('title'), 'Меньше 30 мин свободно', 'title 14:15')
  await u.cell('14:00').click()
  await u.heading('Новая бронь').waitFor()
  t.eq(
    [await u.start().inputValue(), await u.end().inputValue()],
    ['14:00', '14:30'],
    'значения формы',
  )
})

await scenario(
  'E22',
  'изменённая форма → ячейка / бронь / «Новая бронь» / смена даты → ConfirmDiscardDialog',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '14:00', '15:00', 'Чужая'), bk(D2, '10:00', '11:00', 'ДругойДень')],
    })
    await u.block(/Чужая/).waitFor()
    const dialog = page.getByRole('alertdialog')
    const dirtyForm = async () => {
      await u.newBooking().click()
      await u.heading('Новая бронь').waitFor()
      await u.title().fill('Черновик')
    }
    const actions = [
      [
        'ячейка',
        () => u.cell('11:00').click(),
        async () =>
          t.check((await u.start().inputValue()) === '11:00', 'после ячейки старт не 11:00'),
      ],
      [
        'бронь',
        () => u.block(/Чужая/).click(),
        async () =>
          t.check(await u.heading('Редактирование брони').isVisible(), 'после брони нет edit'),
      ],
      [
        'Новая бронь',
        () => u.newBooking().click(),
        async () => t.eq(await u.title().inputValue(), '', 'после «Новая бронь» заголовок не пуст'),
      ],
      [
        'смена даты',
        () => page.getByRole('button', { name: 'Следующий день' }).click(),
        async () => t.eq(await u.heading('Новая бронь').count(), 0, 'панель не закрылась'),
      ],
    ]
    for (const [name, act, after] of actions) {
      await t.dev('PUT', '/api/__dev/clock', { now: null })
      await page.goto(page.url().split('?')[0] + `?date=${D}`)
      await u.block(/Чужая/).waitFor()
      await dirtyForm()
      await act()
      await dialog.waitFor()
      if (name === 'ячейка') await t.shot('discard-dialog')
      await page.getByRole('button', { name: 'Продолжить редактирование' }).click()
      t.eq(await u.title().inputValue(), 'Черновик', `${name}: данные потеряны после «Продолжить»`)
      await act()
      await dialog.waitFor()
      await page.getByRole('button', { name: 'Отменить изменения' }).click()
      await after()
    }
  },
)

await scenario(
  'E22b',
  'изменённая форма → beforeunload запрашивает подтверждение, неизменённая — нет',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}` })
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    const prevented = () =>
      page.evaluate(() => {
        const e = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(e)
        return e.defaultPrevented
      })
    t.eq(await prevented(), false, 'beforeunload при неизменённой форме')
    await u.title().fill('Черновик')
    // the listener is attached after React commits the dirty state: poll briefly
    let armed = false
    for (let i = 0; i < 20 && !armed; i++) {
      armed = await prevented()
      if (!armed) await page.waitForTimeout(50)
    }
    t.eq(armed, true, 'beforeunload при изменённой форме')
    await page.getByRole('button', { name: 'Отмена' }).click()
    t.eq(await prevented(), false, 'beforeunload после закрытия формы')
  },
)

await scenario(
  'E23',
  '«Новая бронь» при брони 09:00–10:00: 10:00–11:00, форма не изменена',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '09:00', '10:00', 'Утро'), bk(D, '15:00', '16:00', 'Другая')],
    })
    await u.block(/Утро/).waitFor()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    t.eq(
      [await u.start().inputValue(), await u.end().inputValue()],
      ['10:00', '11:00'],
      'начальные значения',
    )
    await t.shot('form-initial')
    await u.block(/Другая/).click()
    t.eq(await page.getByRole('alertdialog').count(), 0, 'диалог показан для неизменённой формы')
    await u.heading('Редактирование брони').waitFor()
  },
)

await scenario(
  'E24',
  'автокоррекция окончания: 11:00 сохраняет 11:30, 11:15 → 12:00',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '12:00', '13:00', 'Обед')] })
    await u.block(/Обед/).waitFor()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await u.start().selectOption('10:00')
    await u.end().selectOption('11:30')
    await u.start().selectOption('11:00')
    t.eq(await u.end().inputValue(), '11:30', 'при 11:00 конец должен остаться 11:30')
    t.eq(
      await page.getByText(/Окончание скорректировано/).count(),
      0,
      'сообщение при валидном конце',
    )
    await u.start().selectOption('11:15')
    t.eq(await u.end().inputValue(), '12:00', 'при 11:15 конец → 12:00')
    t.check(
      await page.getByText('Окончание скорректировано: 12:00').isVisible(),
      'нет сообщения о коррекции',
    )
    await t.shot('end-adjusted')
    await u.end().selectOption('11:45')
    t.eq(await page.getByText(/Окончание скорректировано/).count(), 0, 'сообщение не исчезло')
  },
)

await scenario('E25', 'create: смена «Даты брони» двигает дату страницы', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D2, '10:00', '11:00', 'ПослезавтраБронь')] })
  await u.newBooking().click()
  await u.heading('Новая бронь').waitFor()
  await u.date().fill(D2)
  await u.block(/ПослезавтраБронь/).waitFor()
  t.eq(new URL(page.url()).searchParams.get('date'), D2, 'URL')
  t.check(await u.heading('Новая бронь').isVisible(), 'панель закрылась')
  t.check(
    await page.getByText(/Свободно: 09:00–10:00, 11:00–18:00/).isVisible(),
    'подсказка по новой дате',
  )
})

await scenario(
  'E15b',
  'DevPanel «Зафиксировать время» 10:07 воспроизводит E15 без Playwright-часов',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${TODAY}` })
    await page.getByRole('button', { name: 'Панель симуляции' }).click()
    await page.getByLabel('Зафиксировать время: сегодня').fill('10:07')
    await page.getByRole('button', { name: 'Зафиксировать', exact: true }).click()
    await page.getByText(/Время зафиксировано: .*T10:07/).waitFor()
    await page.getByTestId('now-line').waitFor()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    t.eq(await u.start().locator('option').first().getAttribute('value'), '10:15', 'первое начало')
    await page.getByRole('button', { name: 'Сбросить время' }).click()
    await page.getByText('Время системное').waitFor()
  },
)
