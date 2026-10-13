import type { Booking } from '@/domain/booking'

const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fullDate = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const asLocal = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** "15 октября" */
export const formatDayMonth = (date: string) => longDate.format(asLocal(date))

/** "вторник, 13 октября 2026" */
export const formatFullDate = (date: string) =>
  fullDate.format(asLocal(date)).replace(/\s?г\.$/, '')

export const messages = {
  appTitle: 'Бронирование переговорной',
  prevDay: 'Предыдущий день',
  nextDay: 'Следующий день',
  today: 'Сегодня',
  showDate: 'Показать дату',
  pastDateBadge: 'Прошедшая дата',
  timelineTitle: 'Расписание',
  dragHint: 'Брони можно перетаскивать мышью или изменить время в форме, нажав на бронь',
  refreshing: 'Обновление…',
  newBooking: 'Новая бронь',
  book: 'Забронировать',
  empty: 'На эту дату бронирований нет',
  loadError: 'Не удалось загрузить бронирования',
  refreshError: 'Не удалось обновить список',
  retry: 'Повторить',
  panelPlaceholder: 'Выберите бронь на таймлайне или создайте новую',
  availability: {
    'past-date': 'Нельзя бронировать на прошедшую дату',
    'day-over': 'На сегодня бронирование уже недоступно',
    'fully-booked': 'На эту дату нет свободного времени (от 30 мин)',
  },
  cellReason: {
    past: 'Это время уже прошло',
    busy: 'Занято',
    short: 'Меньше 30 мин свободно',
  },
  form: {
    createTitle: 'Новая бронь',
    editTitle: 'Редактирование брони',
    date: 'Дата брони',
    time: 'Время',
    start: 'Начало',
    end: 'Окончание',
    title: 'Название',
    titleHint: '(необязательно)',
    create: 'Создать',
    save: 'Сохранить',
    saving: 'Сохранение…',
    cancel: 'Отмена',
    delete: 'Удалить',
    loadingTimes: 'Загрузка доступного времени…',
    loadTimesFailed: 'Не удалось загрузить занятость на эту дату',
    noFreeTime: 'На эту дату нет свободного времени',
    close: 'Закрыть',
    moveTo: (date: string) => `Перенос на ${formatDayMonth(date)}`,
    endAdjusted: (end: string) => `Окончание скорректировано: ${end}`,
    free: (list: string) => `Свободно: ${list}`,
    nothingFree: 'Свободного времени нет',
    optionBusy: 'занято',
    optionShort: 'меньше 30 мин свободно',
    optionPast: 'прошло',
  },
  errors: {
    conflictLead: 'Пока вы заполняли форму, это время заняли:',
    conflictRefreshing: 'Обновляем список…',
    conflictDone: 'Список обновлён — выберите другое время.',
    conflictFailed: 'Не удалось обновить список.',
    showOnTimeline: 'Показать на таймлайне',
    notFound: 'Эта бронь уже удалена',
    recreate: 'Создать новую с этими данными',
    server: 'Не удалось сохранить. Проверьте соединение и попробуйте ещё раз',
    badRequest: 'Некорректный запрос',
    locked: 'Бронь уже началась — изменить её нельзя.',
    unsaved: 'Несохранённые изменения:',
  },
  details: {
    title: 'Бронь (только просмотр)',
    date: 'Дата',
    time: 'Время',
    duration: 'Длительность',
    name: 'Название',
    status: 'Статус',
    past: 'прошла',
    ongoing: 'идёт сейчас',
  },
  deleteDialog: {
    title: (label: string) => `Удалить бронь ${label}?`,
    confirm: 'Удалить',
    cancel: 'Отмена',
    failed: 'Не удалось удалить. Проверьте соединение и попробуйте ещё раз',
    locked: 'Бронь уже началась — удалить её нельзя',
  },
  discard: {
    title: 'Отменить несохранённые изменения?',
    keep: 'Продолжить редактирование',
    confirm: 'Отменить изменения',
  },
  toast: {
    created: (b: Pick<Booking, 'start' | 'end'>) => `Бронь создана: ${b.start}–${b.end}`,
    saved: 'Изменения сохранены',
    moved: (date: string) => `Бронь перенесена на ${formatDayMonth(date)}`,
    goTo: 'Перейти',
    deleted: 'Бронь удалена',
    rescheduled: (start: string, end: string) => `Время изменено: ${start}–${end}`,
    moveBusy: 'Это время уже занято. Список обновлён',
    moveGone: 'Бронь уже удалена',
    moveFailed: 'Не удалось изменить время. Попробуйте ещё раз',
    alreadyDeleted: 'Бронь уже была удалена',
  },
}
