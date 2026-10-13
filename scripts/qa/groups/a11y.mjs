import { AxeBuilder } from '@axe-core/playwright'
import { scenario, ui, bk, D, D2, TODAY } from '../harness.mjs'

const failedLoad = [/Failed to load resource/]

await scenario('E60', 'создать → reload → бронь на месте', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}` })
  await u.newBooking().click()
  await u.heading('Новая бронь').waitFor()
  await u.start().selectOption('10:00')
  await u.title().fill('Переживёт reload')
  await u.create().click()
  await u.block(/Переживёт reload/).waitFor()
  await page.reload()
  await u.block(/10:00–11:00, Переживёт reload/).waitFor()
})

async function tabTo(t, text, max = 80) {
  for (let i = 0; i < max; i++) {
    await t.page.keyboard.press('Tab')
    if ((await t.focused()).includes(text)) return true
  }
  t.check(false, `Tab не дошёл до «${text}» за ${max} нажатий (сейчас ${await t.focused()})`)
  return false
}

await scenario('E61', 'создание, редактирование и удаление только клавиатурой', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '14:00', '15:00', 'Другая')] })
  await u.block(/Другая/).waitFor()
  // --- create
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  if (!(await tabTo(t, 'Новая бронь'))) return
  await t.shot('focus-new-booking')
  await page.keyboard.press('Enter')
  await u.heading('Новая бронь').waitFor()
  t.check((await t.focused()).includes('Новая бронь'), `фокус после открытия: ${await t.focused()}`)
  await tabTo(t, 'Дата брони')
  await tabTo(t, 'Начало')
  await page.keyboard.type('10:15')
  await tabTo(t, 'Окончание')
  await page.keyboard.type('11:15')
  await tabTo(t, 'Название')
  await page.keyboard.type('Клавиатура')
  await t.shot('focus-title')
  await tabTo(t, 'Создать')
  await page.keyboard.press('Enter')
  await u.toast().filter({ hasText: 'Бронь создана: 10:15–11:15' }).waitFor()
  await page.waitForTimeout(300)
  t.check(
    (await t.focused()).includes('10:15–11:15, Клавиатура'),
    `фокус после создания: ${await t.focused()}`,
  )
  // --- edit
  await page.keyboard.press('Enter')
  await u.heading('Редактирование брони').waitFor()
  t.check(
    (await t.focused()).includes('Редактирование брони'),
    `фокус после открытия edit: ${await t.focused()}`,
  )
  await tabTo(t, 'Окончание')
  await page.keyboard.type('11:30')
  await tabTo(t, 'Сохранить')
  await page.keyboard.press('Enter')
  await u.toast().filter({ hasText: 'Изменения сохранены' }).waitFor()
  await u.block(/10:15–11:30, Клавиатура/).waitFor()
  await page.waitForTimeout(300)
  t.check(
    (await t.focused()).includes('10:15–11:30'),
    `фокус после сохранения: ${await t.focused()}`,
  )
  // --- delete
  await page.keyboard.press('Enter')
  await u.heading('Редактирование брони').waitFor()
  await tabTo(t, 'Удалить')
  await page.keyboard.press('Enter')
  await page.getByRole('alertdialog').waitFor()
  t.check((await t.focused()).includes('Отмена'), `фокус в диалоге: ${await t.focused()}`)
  await tabTo(t, 'Удалить')
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]'))
  t.check(inside, 'фокус вышел из диалога')
  await page.keyboard.press('Enter')
  await u.toast().filter({ hasText: 'Бронь удалена' }).waitFor()
  await page.waitForTimeout(300)
  t.check((await t.focused()).includes('Новая бронь'), `фокус после удаления: ${await t.focused()}`)
  t.eq((await t.dev('GET', `/api/bookings?date=${D}`)).body.length, 1, 'осталась одна бронь')
})

async function axe(t, state) {
  const res = await new AxeBuilder({ page: t.page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  const minor = res.violations.filter((v) => !(v.impact === 'critical' || v.impact === 'serious'))
  for (const v of bad)
    t.check(
      false,
      `axe[${state}] ${v.impact} ${v.id}: ${v.help} (${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(' '))
        .join('; ')})`,
    )
  for (const v of minor) t.note(`axe[${state}] ${v.impact} ${v.id}: ${v.help}`)
  t.note(`axe[${state}]: critical/serious=${bad.length}, остальные=${minor.length}`)
}

await scenario(
  'E62',
  'axe: список, пусто, ошибка, форма с ошибками, диалоги, DevPanel',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({
      path: `/?date=${D}`,
      bookings: [
        bk(D, '10:00', '11:00', 'Планёрка'),
        bk(D, '14:00', '14:30', 'Короткая'),
        bk(TODAY, '09:00', '09:30', 'Прошла'),
      ],
    })
    await u.block(/Планёрка/).waitFor()
    await axe(t, 'список')
    await page.getByRole('button', { name: 'Панель симуляции' }).click()
    await axe(t, 'devpanel')
    await page.getByRole('button', { name: 'Панель симуляции' }).click()
    await u.newBooking().click()
    await u.heading('Новая бронь').waitFor()
    await axe(t, 'форма')
    await u.start().selectOption('12:00')
    await t.dev('PUT', '/api/__dev/simulation', { forceConflictNext: true })
    await u.create().click()
    await page.getByText('Список обновлён — выберите другое время.').waitFor()
    await axe(t, 'форма с ошибками (409)')
    await u.title().fill('x')
    await u.title().fill('')
    await u.title().focus()
    await u.block(/Планёрка/).click()
    await page.getByRole('alertdialog').waitFor()
    await axe(t, 'диалог отмены изменений')
    await page.getByRole('button', { name: 'Отменить изменения' }).click()
    await u.heading('Редактирование брони').waitFor()
    await page.getByRole('button', { name: 'Удалить' }).click()
    await page.getByRole('alertdialog').waitFor()
    await axe(t, 'диалог удаления')
    await page.getByRole('button', { name: 'Отмена' }).click()
    await page.getByRole('button', { name: 'Отмена' }).click()
    await page.getByLabel('Показать дату').fill(D2)
    await page.getByText('На эту дату бронирований нет').waitFor()
    await axe(t, 'пусто')
    await page.getByLabel('Показать дату').fill(TODAY)
    await u.block(/Прошла/).click()
    await u.heading('Бронь (только просмотр)').waitFor()
    await axe(t, 'просмотр')
    await t.dev('PUT', '/api/__dev/simulation', {
      failNext: { kind: '500', method: 'GET', count: 2 },
    })
    await page.reload()
    await page.getByText('Не удалось загрузить бронирования').waitFor()
    await axe(t, 'ошибка загрузки')
  },
  { expectErrors: failedLoad },
)

for (const width of [320, 375, 768, 1280]) {
  const id = 'E63'
  await scenario(
    id,
    `ширина ${width}: нет горизонтального скролла, блоки ≥ 44px; при < 1024 панель над таймлайном и в фокусе`,
    async (t) => {
      const { page } = t
      const u = ui(page)
      await t.open({
        path: `/?date=${D}`,
        bookings: [
          bk(D, '09:30', '10:00', 'Полчаса с длинным названием'),
          bk(D, '10:00', '10:30', 'Сразу следом'),
          bk(D, '13:00', '15:00', 'Два часа'),
        ],
      })
      await u.block(/Сразу следом/).waitFor()
      const noScroll = async (state) => {
        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }))
        t.check(
          sw <= cw,
          `[${width}] горизонтальный скролл в состоянии «${state}»: scrollWidth=${sw} > clientWidth=${cw}`,
        )
      }
      await noScroll('список')
      const heights = await page
        .locator('[data-testid=booking-block]')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
      t.check(
        heights.every((h) => h >= 44),
        `высоты блоков ${heights}`,
      )
      await t.shot(`w${width}-list`)
      await u.newBooking().click()
      await u.heading('Новая бронь').waitFor()
      await noScroll('форма')
      if (width < 1024) {
        const panelY = await u
          .heading('Новая бронь')
          .evaluate((e) => e.getBoundingClientRect().top + scrollY)
        const timelineY = await page
          .getByTestId('timeline-grid')
          .evaluate((e) => e.getBoundingClientRect().top + scrollY)
        t.check(
          panelY < timelineY,
          `панель (${Math.round(panelY)}) не выше таймлайна (${Math.round(timelineY)})`,
        )
        t.check(
          (await t.focused()).includes('Новая бронь'),
          `фокус на заголовке панели: ${await t.focused()}`,
        )
        const vis = await u.heading('Новая бронь').evaluate((e) => {
          const r = e.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= innerHeight
        })
        t.check(vis, 'заголовок панели не прокручен в видимую область')
      }
      await t.shot(`w${width}-form`)
      // 409 + "Показать на таймлайне"
      await u.start().selectOption('15:00')
      await t.dev('PUT', '/api/__dev/simulation', { forceConflictNext: true })
      await u.create().click()
      await page.getByText('Список обновлён — выберите другое время.').waitFor()
      await noScroll('409')
      await t.shot(`w${width}-409`)
      if (width < 1024) {
        const link = page.getByRole('button', { name: 'Показать на таймлайне' })
        t.check(await link.isVisible(), 'нет ссылки «Показать на таймлайне»')
        await page.evaluate(() => window.scrollTo(0, 0))
        await link.click()
        await page.waitForTimeout(500)
        const inView = await page
          .locator('[data-testid=booking-block]', { hasText: 'Занято другим сотрудником' })
          .evaluate((e) => {
            const r = e.getBoundingClientRect()
            return r.top >= 0 && r.bottom <= innerHeight
          })
        t.check(inView, 'чужая бронь не в видимой области после «Показать на таймлайне»')
      } else {
        t.eq(
          await page.getByRole('button', { name: 'Показать на таймлайне' }).isVisible(),
          false,
          'ссылка видна на десктопе',
        )
      }
      await page.getByRole('button', { name: 'Панель симуляции' }).click()
      await noScroll('devpanel')
    },
    {
      viewport: { width, height: width < 700 ? 812 : width < 1000 ? 1024 : 800 },
      expectErrors: failedLoad,
    },
  )
}

await scenario(
  'E64',
  'prefers-reduced-motion: reduce — анимаций нет',
  async (t) => {
    const { page } = t
    await t.open({
      path: `/?date=${D}`,
      bookings: [bk(D, '10:00', '11:00', 'Планёрка')],
      simulation: { latencyMs: 1500 },
    })
    await page.waitForSelector('[aria-busy="true"]')
    const anim = await page
      .locator('.animate-pulse')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName)
    t.eq(anim, 'none', 'skeleton анимируется')
    await page.waitForSelector('[data-testid=booking-block]')
    await page.getByLabel('Показать дату').fill(D2)
    // the spinner must exist (no .catch): its absence would make the check meaningless
    await page.locator('.animate-spin').first().waitFor({ state: 'attached', timeout: 3000 })
    const spinner = await page
      .locator('.animate-spin')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName)
    t.eq(spinner, 'none', 'спиннер анимируется')
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('button, [data-sonner-toast]')].map(
        (e) => getComputedStyle(e).transitionDuration,
      ),
    )
    t.check(
      durations.every((d) => d.split(',').every((x) => parseFloat(x) === 0)),
      `transition не отключён: ${[...new Set(durations)]}`,
    )
    const matches = await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    t.eq(matches, true, 'media query не применилась')
  },
  { reducedMotion: 'reduce' },
)
