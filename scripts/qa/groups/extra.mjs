import { AxeBuilder } from '@axe-core/playwright'
import { chromium } from '@playwright/test'
import { scenario, ui, bk, D, D2, Y, TODAY, requestLog } from '../harness.mjs'

const at = (date, time) => new Date(`${date}T${time}+03:00`)
const PX = 1.6

async function drag(page, locator, dyMin, { release = true } = {}) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + 10
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + (dyMin * PX) / 2, { steps: 4 })
  await page.mouse.move(x, y + dyMin * PX, { steps: 4 })
  if (release) await page.mouse.up()
}

await scenario(
  'E66',
  'DnD: перетаскивание брони меняет время (шаг 15 мин), клик по-прежнему открывает форму',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Двигаем')] })
    await u.block(/Двигаем/).click()
    await u.heading('Редактирование брони').waitFor()
    await page.getByRole('button', { name: 'Отмена' }).click()
    await drag(page, u.block(/Двигаем/), 30)
    await u.toast().filter({ hasText: 'Время изменено: 10:30–11:30' }).waitFor()
    await u.block(/10:30–11:30, Двигаем/).waitFor()
    t.eq(
      await u.heading('Редактирование брони').count(),
      0,
      'после перетаскивания открылась форма (клик не подавлен)',
    )
    const list = (await t.dev('GET', `/api/bookings?date=${D}`)).body
    t.eq([list[0].start, list[0].end], ['10:30', '11:30'], 'сохранённое время')
    // 7 minutes of mouse travel snap to the nearest 15
    await drag(page, u.block(/Двигаем/), 7)
    await page.waitForTimeout(500)
    t.eq(
      (await t.dev('GET', `/api/bookings?date=${D}`)).body[0].start,
      '10:30',
      'смещение 7 мин должно округлиться до 0',
    )
  },
)

await scenario(
  'E67',
  'DnD: на занятое время нельзя, Esc отменяет, идущие брони не перетаскиваются',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await page.clock.setFixedTime(at(TODAY, '10:30:00'))
    await t.open({
      path: `/?date=${D}`,
      bookings: [
        bk(D, '10:00', '11:00', 'Двигаем'),
        bk(D, '12:00', '13:00', 'Стена'),
        bk(TODAY, '10:00', '11:00', 'Идёт'),
      ],
    })
    await u.block(/Двигаем/).waitFor()
    await drag(page, u.block(/Двигаем/), 90, { release: false })
    await page.getByText(/12:00–13:00 — занято|11:30–12:30 — занято/).waitFor()
    await t.shot('drag-invalid')
    await page.mouse.up()
    await page.waitForTimeout(500)
    t.eq(
      (await requestLog(t)).filter((r) => r.method === 'PATCH').length,
      0,
      'PATCH на занятое время',
    )
    t.check(await u.block(/10:00–11:00, Двигаем/).isVisible(), 'бронь сдвинулась')
    // Esc cancels
    await drag(page, u.block(/Двигаем/), 60, { release: false })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForTimeout(400)
    t.eq((await requestLog(t)).filter((r) => r.method === 'PATCH').length, 0, 'PATCH после Esc')
    // locked
    await page.getByRole('button', { name: 'Сегодня' }).click()
    await u.block(/Идёт/).waitFor()
    await drag(page, u.block(/Идёт/), 60)
    await page.waitForTimeout(400)
    t.eq((await requestLog(t)).filter((r) => r.method === 'PATCH').length, 0, 'PATCH идущей брони')
  },
)

await scenario(
  'E68',
  'DnD: ошибка сервера при сохранении — toast, бронь на месте',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Двигаем')] })
    await u.block(/Двигаем/).waitFor()
    await t.dev('PUT', '/api/__dev/simulation', {
      failNext: { kind: '500', method: 'PATCH', count: 1 },
    })
    await drag(page, u.block(/Двигаем/), 30)
    await u.toast().filter({ hasText: 'Не удалось изменить время' }).waitFor()
    await u.block(/10:00–11:00, Двигаем/).waitFor()
  },
  { expectErrors: [/Failed to load resource/] },
)

await scenario(
  'E69',
  'тёмная тема: переключатель, сохранение после reload, axe',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Планёрка'), bk(D, '14:00', '14:30', 'Короткая')],
    })
    await u.block(/Планёрка/).waitFor()
    const toggle = page.getByRole('button', { name: 'Тёмная тема' })
    t.eq(await toggle.getAttribute('aria-pressed'), 'false', 'исходное состояние')
    await toggle.click()
    t.eq(
      await page.evaluate(() => document.documentElement.classList.contains('dark')),
      true,
      'класс dark',
    )
    t.eq(await toggle.getAttribute('aria-pressed'), 'true', 'aria-pressed')
    await t.shot('dark-list')
    await page.reload()
    await u.block(/Планёрка/).waitFor()
    t.eq(
      await page.evaluate(() => document.documentElement.classList.contains('dark')),
      true,
      'тема не сохранилась',
    )
    const checkAxe = async (state) => {
      const res = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      for (const v of res.violations.filter(
        (x) => x.impact === 'critical' || x.impact === 'serious',
      )) {
        t.check(
          false,
          `axe[${state}] ${v.impact} ${v.id}: ${v.help} (${v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(' '))
            .join('; ')})`,
        )
      }
    }
    await checkAxe('список (тёмная)')
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await t.dev('PUT', '/api/__dev/simulation', { forceConflictNext: true })
    await u.create().click()
    await page.getByText('Список обновлён — выберите другое время.').waitFor()
    await t.shot('dark-409')
    await checkAxe('форма с 409 (тёмная)')
    await page.getByRole('button', { name: 'Панель симуляции' }).click()
    await checkAxe('DevPanel (тёмная)')
  },
  { expectErrors: [/Failed to load resource/] },
)

await scenario(
  'E70',
  'форма создания: смена «Даты брони» не стирает введённое (D1), прошлая дата не тупик (D2)',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D2, '10:00', '11:00', 'Другой день')] })
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await u.start().selectOption('14:00')
    await u.title().fill('Важное совещание')
    await u.date().fill(D2)
    await u.block(/Другой день/).waitFor()
    t.eq(await u.title().inputValue(), 'Важное совещание', 'название стёрто при смене даты')
    t.eq(await u.start().inputValue(), '14:00', 'начало сброшено при смене даты')
    await u.date().fill(Y)
    t.check(await u.date().isVisible(), 'поле даты пропало для прошедшей даты')
    await page.getByText('Нельзя бронировать на прошедшую дату').first().waitFor({ timeout: 3000 })
    t.eq(await u.title().inputValue(), 'Важное совещание', 'название стёрто при прошедшей дате')
  },
)

await scenario(
  'E71',
  'DnD: причина отказа в превью («время уже прошло») и toast при сбросе',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await page.clock.setFixedTime(at(TODAY, '10:07:00'))
    await t.open({ path: `/?date=${TODAY}`, bookings: [bk(TODAY, '15:00', '16:00', 'Двигаем')] })
    await u.block(/Двигаем/).waitFor()
    await drag(page, u.block(/Двигаем/), -300, { release: false })
    await page.getByText(/— время уже прошло/).waitFor()
    await page.mouse.up()
    await u.toast().filter({ hasText: 'Нельзя переместить: время уже прошло' }).waitFor()
    t.eq(
      (await requestLog(t)).filter((r) => r.method === 'PATCH').length,
      0,
      'PATCH на прошедшее время',
    )
  },
)

await scenario(
  'E72',
  'DnD: оптимистичное обновление — новое время сразу, откат при ошибке, без скачков',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Двигаем')],
      simulation: { latencyMs: 1500 },
    })
    await u.block(/Двигаем/).waitFor()
    const before = await u.block(/Двигаем/).boundingBox()
    await drag(page, u.block(/Двигаем/), 60)
    // the server needs 1.5 s, the UI must already show the new slot
    await u.block(/11:00–12:00, Двигаем/).waitFor({ timeout: 500 })
    const after = await u.block(/Двигаем/).boundingBox()
    t.check(
      Math.abs(after.y - before.y - 60 * 1.6) < 3,
      `смещение ${after.y - before.y}px, ожидалось ${60 * 1.6}`,
    )
    await u.toast().filter({ hasText: 'Время изменено: 11:00–12:00' }).waitFor({ timeout: 6000 })
    t.eq((await t.dev('GET', `/api/bookings?date=${D}`)).body[0].start, '11:00', 'на сервере')
    // failure: optimistic state is rolled back
    await t.dev('PUT', '/api/__dev/simulation', {
      latencyMs: 400,
      failNext: { kind: '500', method: 'PATCH', count: 1 },
    })
    await drag(page, u.block(/Двигаем/), 60)
    await u.block(/12:00–13:00, Двигаем/).waitFor({ timeout: 300 })
    await u.toast().filter({ hasText: 'Не удалось изменить время' }).waitFor({ timeout: 4000 })
    await u.block(/11:00–12:00, Двигаем/).waitFor({ timeout: 1500 })
  },
  { expectErrors: [/Failed to load resource/] },
)

await scenario(
  'E73',
  'раскладка не прыгает при появлении/исчезновении полосы прокрутки и при диалоге',
  async (t) => {
    // The layout shift is independent of the project's viewport; run it once, in the desktop project.
    if (t.viewport.width < 1024) return t.note('пропущено: проверяется в desktop-проекте')
    // headless Chromium hides scrollbars by default; this scenario needs real (classic) ones
    const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 700 },
        locale: 'ru-RU',
      })
      const u = ui(page)
      await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Якорь')] }, page)
      await u.block(/Якорь/).waitFor()
      const x = async () =>
        Math.round((await page.locator('[data-testid=booking-block]').boundingBox()).x)
      const withScroll = await x()
      const gutter = await page.evaluate(() => innerWidth - document.documentElement.clientWidth)
      t.check(
        gutter > 0,
        'в этом окружении нет классической полосы прокрутки — сценарий бессмыслен',
      )
      await page.setViewportSize({ width: 1280, height: 1500 })
      t.eq(await x(), withScroll, 'сдвиг по X, когда полоса прокрутки исчезла')
      await page.setViewportSize({ width: 1280, height: 700 })
      await u.block(/Якорь/).click()
      await u.heading('Редактирование брони').waitFor()
      await page.getByRole('button', { name: 'Удалить' }).click()
      await page.getByRole('alertdialog').waitFor()
      t.eq(await x(), withScroll, 'сдвиг по X при открытии модального диалога')
    } finally {
      await browser.close()
    }
  },
)
