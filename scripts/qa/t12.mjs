import { launch, setup, watch, shot, D, state } from './lib.mjs'
const browser = await launch()
const errs = []
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
watch(page, errs)
await setup(page, {
  path: `/?date=${D}`,
  bookings: [{ date: D, start: '10:00', end: '11:00', title: 'Планёрка' }],
})
await page.getByRole('button', { name: 'Панель симуляции' }).click()
await page.getByLabel('1500 мс').check()
await page.getByLabel('Следующая мутация вернёт 409').check()
await page.waitForTimeout(300)
console.log((await state(page)).simulation)
await page.getByRole('combobox', { name: 'Метод' }).selectOption('GET')
await page.getByRole('button', { name: 'Ошибка 500' }).click()
await page.waitForTimeout(300)
console.log((await state(page)).simulation.failNext)
await shot(page, 't12-devpanel-1280')
await page.getByRole('button', { name: 'Сбросить данные' }).click()
await page.waitForTimeout(800)
console.log('errors', errs)
await browser.close()
