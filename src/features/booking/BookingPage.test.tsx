import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderPage, setupTestEnv, type TestEnv } from '@/test/renderWithProviders'

const D = '2026-10-14'
const D2 = '2026-10-15'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
})
afterEach(() => env.close())

const user = () => userEvent.setup()
const blockNamed = (re: RegExp) => screen.findByRole('button', { name: re })
const startSelect = () => screen.getByLabelText('Начало') as HTMLSelectElement
const endSelect = () => screen.getByLabelText('Окончание') as HTMLSelectElement
const titleInput = () => screen.getByLabelText(/Название/) as HTMLInputElement

describe('1. loading, empty, error', () => {
  it('shows a skeleton, then bookings', async () => {
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'Планёрка' })
    const { container } = renderPage(env, D)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(await blockNamed(/10:00–11:00, Планёрка/)).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows the empty state with a CTA', async () => {
    renderPage(env, D2)
    expect(await screen.findByText('На эту дату бронирований нет')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Забронировать' })).toBeInTheDocument()
  })

  it('shows an error after two failed GETs and recovers on "Повторить"', async () => {
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'Планёрка' })
    env.sim.update({ failNext: { kind: '500', method: 'GET', count: 2 } })
    renderPage(env, D)
    expect(await screen.findByText('Не удалось загрузить бронирования')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await blockNamed(/Планёрка/)).toBeInTheDocument()
  })
})

describe('2. create', () => {
  it('creates a booking, closes the panel, toasts and focuses the new block', async () => {
    const u = user()
    renderPage(env, D)
    await u.click(await screen.findByRole('button', { name: 'Новая бронь' }))
    await screen.findByRole('heading', { name: 'Новая бронь', level: 2 })
    await waitFor(() => expect(startSelect().value).toBe('09:00'))
    expect(endSelect().value).toBe('10:00')

    await u.selectOptions(startSelect(), '10:00')
    expect(endSelect().value).toBe('11:00')
    expect(screen.getByText('Окончание скорректировано: 11:00')).toBeInTheDocument()
    await u.type(titleInput(), 'Ретро')
    await u.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Бронь создана: 10:00–11:00')).toBeInTheDocument()
    const block = await blockNamed(/10:00–11:00, Ретро/)
    await waitFor(() => expect(block).toHaveFocus())
    expect(screen.queryByRole('heading', { name: 'Новая бронь', level: 2 })).toBeNull()
    expect(env.repo.listByDate(D)).toMatchObject([{ start: '10:00', end: '11:00', title: 'Ретро' }])
  })
})

describe('3. 409 keeps every form value', () => {
  it('shows the conflict, refreshes the list and keeps the input', async () => {
    const u = user()
    renderPage(env, D)
    await u.click(await screen.findByRole('button', { name: 'Новая бронь' }))
    await waitFor(() => expect(startSelect().value).toBe('09:00'))
    await u.selectOptions(startSelect(), '10:00')
    await u.selectOptions(endSelect(), '11:30')
    await u.type(titleInput(), 'Важная встреча')
    env.sim.update({ forceConflictNext: true })
    await u.click(screen.getByRole('button', { name: 'Создать' }))

    const alert = await screen.findByText(/Пока вы заполняли форму/)
    await waitFor(() => expect(alert).toHaveTextContent('Список обновлён'))
    expect(alert).toHaveTextContent('«Занято другим сотрудником»')

    // all values are still there
    expect(startSelect().value).toBe('10:00')
    expect(endSelect().value).toBe('11:30')
    expect(titleInput().value).toBe('Важная встреча')
    // focus went to "Начало", the interval error is shown, the foreign booking is highlighted
    expect(startSelect()).toHaveFocus()
    expect(screen.getByText(/Время пересекается с: 10:00–11:30/)).toBeInTheDocument()
    const foreign = await blockNamed(/Занято другим сотрудником.*только что занято/)
    expect(foreign).toBeInTheDocument()
    expect(env.repo.listByDate(D)).toHaveLength(1)

    // pick another time and succeed: alert and highlight disappear
    await u.selectOptions(startSelect(), '12:00')
    await u.click(screen.getByRole('button', { name: 'Создать' }))
    expect(await screen.findByText(/Бронь создана: 12:00–/)).toBeInTheDocument()
    expect(screen.queryByText(/Пока вы заполняли форму/)).toBeNull()
  })
})

describe('4. edit without self-conflict', () => {
  it('extends its own booking', async () => {
    const u = user()
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'A' })
    renderPage(env, D)
    await u.click(await blockNamed(/10:00–11:00, A/))
    await screen.findByRole('heading', { name: 'Редактирование брони' })
    const own = within(endSelect()).getByRole('option', { name: /11:30/ }) as HTMLOptionElement
    expect(own.disabled).toBe(false)
    expect(within(startSelect()).getByRole('option', { name: '10:15' })).not.toBeDisabled()

    await u.selectOptions(endSelect(), '11:30')
    await u.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Изменения сохранены')).toBeInTheDocument()
    expect(env.repo.listByDate(D)[0]).toMatchObject({ start: '10:00', end: '11:30' })
  })
})

describe('5. move to another date', () => {
  it('moves the booking and offers to go to the target date', async () => {
    const u = user()
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'Переезд' })
    renderPage(env, D)
    await u.click(await blockNamed(/Переезд/))
    await screen.findByRole('heading', { name: 'Редактирование брони' })
    fireEvent.change(screen.getByLabelText('Дата брони'), { target: { value: D2 } })
    expect(await screen.findByText('Перенос на 15 октября')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Бронь перенесена на 15 октября')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Переезд/ })).toBeNull())
    expect(env.repo.listByDate(D2)).toHaveLength(1)

    await u.click(screen.getByRole('button', { name: 'Перейти' }))
    expect(await blockNamed(/Переезд/)).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('date')).toBe(D2)
  })
})

describe('6. delete', () => {
  it('asks for confirmation, then deletes', async () => {
    const u = user()
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'Лишняя' })
    renderPage(env, D)
    await u.click(await blockNamed(/Лишняя/))
    await u.click(await screen.findByRole('button', { name: 'Удалить' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Удалить бронь 10:00–11:00 «Лишняя»?')
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus()
    await u.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByText('Бронь удалена')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Лишняя/ })).toBeNull())
    expect(env.repo.listByDate(D)).toHaveLength(0)
  })
})

describe('7. today with now = 10:07', () => {
  it('offers starts from 10:15 and shows the past hatch and the now line', async () => {
    const u = user()
    env.clockOverride.set('2026-10-13T10:07:00.000')
    renderPage(env, '2026-10-13')
    await u.click(await screen.findByRole('button', { name: 'Новая бронь' }))
    await waitFor(() => expect(startSelect().value).toBe('10:15'))
    const options = within(startSelect()).getAllByRole('option') as HTMLOptionElement[]
    expect(options[0]?.value).toBe('10:15')
    expect(options.some((o) => o.value === '10:00')).toBe(false)
    expect(screen.getByTestId('now-line')).toBeInTheDocument()
    expect(screen.getByTestId('past-hatch')).toBeInTheDocument()
  })

  it('disables "Новая бронь" with a reason once no start is left (17:30)', async () => {
    env.clockOverride.set('2026-10-13T17:30:00.000')
    renderPage(env, '2026-10-13')
    const button = await screen.findByRole('button', { name: 'Новая бронь' })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).toHaveAccessibleDescription('На сегодня бронирование уже недоступно')
  })
})

describe('8. server-side BOOKING_LOCKED', () => {
  it('switches to the read-only view and shows the unsaved changes', async () => {
    const u = user()
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'Старое' })
    env.server.use(
      http.patch('*/api/bookings/:id', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'locked', reason: 'BOOKING_LOCKED' } },
          { status: 422 },
        ),
      ),
    )
    renderPage(env, D)
    await u.click(await blockNamed(/Старое/))
    await screen.findByRole('heading', { name: 'Редактирование брони' })
    await u.selectOptions(endSelect(), '11:30')
    await u.clear(titleInput())
    await u.type(titleInput(), 'Новое')
    await u.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(
      await screen.findByRole('heading', { name: 'Бронь (только просмотр)' }),
    ).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Бронь уже началась — изменить её нельзя.')
    expect(alert).toHaveTextContent('10:00–11:30 «Новое»')
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull()
  })
})
