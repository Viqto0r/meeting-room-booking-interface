import { scenario, ui, bk, D, BASE, refetchedAfterMutation } from '../harness.mjs'

const openEdit = async (t, re) => {
  const u = ui(t.page)
  await u.block(re).click()
  await u.heading('Редактирование брони').waitFor()
}

await scenario('E40', '«Удалить» → «Отмена»: фокус по умолчанию на «Отмена»', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Планёрка')] })
  await openEdit(t, /Планёрка/)
  await page.getByRole('button', { name: 'Удалить' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor()
  t.check(
    await dialog.innerText().then((s) => s.includes('Удалить бронь 10:00–11:00 «Планёрка»?')),
    'текст диалога',
  )
  t.check((await t.focused()).includes('Отмена'), `фокус: ${await t.focused()}`)
  await t.shot('delete-dialog')
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await dialog.waitFor({ state: 'detached' })
  t.check(await u.block(/Планёрка/).isVisible(), 'бронь пропала')
  t.check(await u.heading('Редактирование брони').isVisible(), 'форма закрылась')
})

await scenario('E41', '«Удалить» → подтвердить: toast, брони нет, после reload тоже', async (t) => {
  const { page } = t
  const u = ui(page)
  await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Планёрка')] })
  await openEdit(t, /Планёрка/)
  await page.getByRole('button', { name: 'Удалить' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
  await u.toast().filter({ hasText: 'Бронь удалена' }).waitFor()
  t.eq(await u.block(/Планёрка/).count(), 0, 'бронь осталась')
  t.eq(await u.heading('Редактирование брони').count(), 0, 'панель не закрылась')
  await page.waitForTimeout(300)
  t.check((await t.focused()).includes('Новая бронь'), `фокус: ${await t.focused()}`)
  await page.reload()
  await page.getByText('На эту дату бронирований нет').waitFor()
})

await scenario(
  'E42',
  'удалена во второй вкладке → удалить в первой: «Бронь уже была удалена»',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Планёрка')] })
    await openEdit(t, /Планёрка/)
    const id = (await t.dev('GET', `/api/bookings?date=${D}`)).body[0].id
    const b = await t.newPage()
    await b.goto(BASE + '/')
    await b.waitForFunction(() => window.__mswReady === true)
    await t.dev('DELETE', `/api/bookings/${id}`, undefined, b)
    await b.close()
    await page.getByRole('button', { name: 'Удалить' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
    await u.toast().filter({ hasText: 'Бронь уже была удалена' }).waitFor()
    await page.getByText('На эту дату бронирований нет').waitFor()
    t.check(await refetchedAfterMutation(t, D), 'нет GET после DELETE')
  },
  { expectErrors: [/Failed to load resource.*404/] },
)

await scenario(
  'E43',
  'DELETE 500: ошибка в диалоге, бронь на месте, повтор успешен',
  async (t) => {
    const { page } = t
    const u = ui(page)
    await t.open({ path: `/?date=${D}`, bookings: [bk(D, '10:00', '11:00', 'Планёрка')] })
    await openEdit(t, /Планёрка/)
    await t.dev('PUT', '/api/__dev/simulation', {
      failNext: { kind: '500', method: 'DELETE', count: 1 },
    })
    await page.getByRole('button', { name: 'Удалить' }).click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('button', { name: 'Удалить' }).click()
    await dialog.getByRole('alert').waitFor()
    t.check(
      await dialog
        .getByRole('alert')
        .innerText()
        .then((s) => s.includes('Не удалось удалить')),
      'текст ошибки',
    )
    await t.shot('delete-error')
    t.eq(
      await page.locator('[data-testid="booking-block"]').count(),
      1,
      'бронь пропала после ошибки',
    )
    t.check(await refetchedAfterMutation(t, D), 'нет GET после ошибки DELETE')
    await dialog.getByRole('button', { name: 'Удалить' }).click()
    await u.toast().filter({ hasText: 'Бронь удалена' }).waitFor()
  },
  { expectErrors: [/Failed to load resource.*500/] },
)
