# Спецификация: интерфейс бронирования переговорной комнаты

Версия 1.1 · 2026-10-13. Изменения после ревью — в [REVIEW.md](./REVIEW.md).

---

## 0. Цель и скоуп

SPA для бронирования одной переговорной комнаты в пределах рабочего дня 09:00–18:00.
Пользователь выбирает дату, видит брони на неё, создаёт, редактирует (в том числе переносит на другую дату) и удаляет брони.

Что важнее всего в оценке: бизнес-логика и валидация, корректные состояния UI, обработка серверных ошибок (особенно `409`),
разделение API и UI, читаемый TypeScript, адаптивность и базовая доступность. Художественный дизайн не оценивается.

**Не входит в скоуп:** реальный бэкенд, БД, авторизация, несколько комнат, повторяющиеся брони, i18n (только русский), офлайн-режим.

---

## 1. Принятые решения

### 1.1. Согласовано с заказчиком

| #   | Вопрос                    | Решение                                                                                                                                                                               |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Шаг времени               | **15 минут.** `start`/`end` кратны 15 минутам.                                                                                                                                        |
| D2  | Прошедшие и идущие брони  | **Только чтение.** Бронь, у которой момент начала `≤ now`, нельзя редактировать и удалять. Начало новой брони на сегодня — ближайшая 15-минутная отметка **строго после** `now`.      |
| D3  | Стек и mock               | **Vite + React + TS + MSW** (mock в браузере). Деплой статикой на Vercel.                                                                                                             |
| D4  | Демонстрация 409          | Три способа: фоновые «чужие» брони с заданной вероятностью; dev-переключатель «следующая мутация вернёт 409»; вторая вкладка браузера (общее хранилище в `localStorage`).             |
| D5  | Таймзона                  | **Локальная таймзона браузера.** «Сейчас» берётся из модуля `clock`.                                                                                                                  |
| D6  | Доступные даты            | **Любые дни, горизонт не ограничен.**                                                                                                                                                 |
| D7  | Библиотеки                | TanStack Query v5, react-hook-form + zod, Tailwind CSS, Radix UI (диалоги).                                                                                                           |
| D8  | Отображение               | **Вертикальный таймлайн 09–18 + форма.** Форма — основной путь с клавиатуры. На мобильных всё в одну колонку, блоки друг под другом.                                                  |
| D9  | `title`                   | Необязательное, ≤ 100 символов после `trim`. Пустое значение — «Без названия», поле не сохраняется.                                                                                   |
| D10 | Тесты                     | Vitest: unit на домен + интеграционные тесты UI (RTL + MSW).                                                                                                                          |
| D11 | Язык                      | UI, сообщения и README на русском. Код и комментарии на английском.                                                                                                                   |
| D12 | Автообновление при фокусе | По умолчанию **включено**. В DevPanel есть тумблер «выключить» (нужен для демо 409 через вторую вкладку).                                                                             |
| D13 | Перенос на другую дату    | **Разрешён** при редактировании.                                                                                                                                                      |
| D14 | Подмена «сейчас»          | Dev-панель позволяет зафиксировать текущее время для UI и mock-сервера. UI-контрол — P2. Механизм нужен для проверок, поэтому он P0 (§5.6).                                           |
| D15 | Проверка UI               | **Обязательна.** После реализации агент сам проходит в браузере через Playwright **все** сценарии §9.2 и снимает скриншоты. Ключевые сценарии закрепляются автотестами в репозитории. |
| D16 | Проверка API              | **Обязательна.** Все запросы проверяются через curl (§9.3). Для этого mock-API дополнительно поднимается Node HTTP-сервером (§5.5).                                                   |

### 1.2. Решения исполнителя (можно оспорить)

| #   | Решение                                                                                                                                                                                                  | Обоснование                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A1  | Удаление подтверждается в диалоге (Radix AlertDialog).                                                                                                                                                   | Действие необратимо.                                                                                             |
| A2  | Мутации пессимистичные: без optimistic updates.                                                                                                                                                          | Сервер может вернуть 409. Откат оптимистичного состояния усложняет код, а выигрыш небольшой.                     |
| A3  | Мутации не ретраятся. `GET` ретраится 1 раз.                                                                                                                                                             | POST не идемпотентен.                                                                                            |
| A4  | Выбранная дата синхронизируется с URL (`?date=`).                                                                                                                                                        | Перезагрузка сохраняет дату, ссылкой можно поделиться.                                                           |
| A5  | Защита несохранённых данных: единый `ConfirmDiscardDialog` (Radix) на все действия, которые заменяют или закрывают изменённую форму (§7.5.6), плюс `beforeunload`. Нативный `confirm()` не используется. | Требование «не потерять данные». Нативный `confirm()` блокирует поток страницы, а в нём работают и MSW-handlers. |
| A6  | Уведомления об успехе — toast (`sonner`). Toast с действием не исчезает сам, пока не закрыт или пока на нём фокус (≥ 10 с).                                                                              | Toast не перегружает форму. Время жизни — ради WCAG 2.2.1.                                                       |
| A7  | Сервер проверяет кратность 15 минутам (`NOT_ALIGNED`).                                                                                                                                                   | Следствие D1. Сервер не доверяет клиенту.                                                                        |
| A8  | Пересечение (`OVERLAP`) — ошибка интервала, а не поля «Начало»: показывается под группой «Время» и связывается с обоими select.                                                                          | Пересечение — свойство интервала.                                                                                |

---

## 2. Доменная модель

```ts
// src/domain/booking.ts
export type Booking = { id: string; date: string; start: string; end: string; title?: string }
//                     uuid        YYYY-MM-DD    HH:mm          HH:mm        trimmed, 1..100
export type BookingInput = Omit<Booking, 'id'>
```

```ts
// src/domain/constants.ts
export const WORKDAY_START = '09:00'
export const WORKDAY_END = '18:00'
export const SLOT_STEP_MIN = 15
export const MIN_DURATION_MIN = 30
export const MAX_DURATION_MIN = 120
export const TITLE_MAX_LENGTH = 100
```

### 2.1. Работа со временем

- Внутри домена время — **минуты от полуночи** (`number`): `toMinutes('10:15') → 615`, `fromMinutes(615) → '10:15'`. Интервальная арифметика идёт только над минутами, поэтому летнее время на неё не влияет.
- Дата — строка `YYYY-MM-DD`. Сравнение дат лексикографическое.
- Разрешён только `new Date(y, m - 1, d[, h, min])` — локальный конструктор (нужен для `addDays`, `isValidDateString`, `startDateTime`).
  **Запрещены** в `domain/`:
  - `new Date('YYYY-MM-DD')` — такая строка парсится как UTC;
  - `new Date()` без аргументов;
  - `Date.now()`.
- `now: Date` передаётся в доменные функции **явным параметром**. Единственный источник — `src/shared/clock.ts`:
  ```ts
  export interface Clock {
    now(): Date
  }
  export function createClock(getOverride: () => string | null): Clock // override (ISO local) ?? new Date()
  ```
  Приоритет: dev-override (§5.6 `__dev/clock`) > системный `Date`. В E2E системный `Date` подменяется через `page.clock`.
- `startDateTime(b) = new Date(y, m-1, d, hh, mm)`. Сравнения с `now` идут в миллисекундах.

### 2.2. Пересечение интервалов

```ts
// half-open [start, end): touching is not an overlap
overlaps(a, b) = a.start < b.end && b.start < a.end
```

---

## 3. Бизнес-правила

Правила реализованы **один раз** в `src/domain/rules.ts` как чистые функции. Их используют форма и mock-сервер.
С реальным бэкендом клиентская копия остаётся для UX, а авторитетная проверка — серверная.

```ts
type RuleCode =
  | 'INVALID_FORMAT' | 'NOT_ALIGNED' | 'OUT_OF_WORKING_HOURS' | 'START_NOT_BEFORE_END'
  | 'TOO_SHORT' | 'TOO_LONG' | 'PAST_DATE' | 'PAST_TIME' | 'TITLE_TOO_LONG'
  | 'OVERLAP' | 'BOOKING_LOCKED';

type ViolationTarget = 'date' | 'start' | 'end' | 'title' | 'interval';
type RuleViolation = { code: RuleCode; target: ViolationTarget; message: string; conflicts?: Booking[] };

validateBookingInput(input: BookingInput, ctx: { now: Date; existing: Booking[]; excludeId?: string }): RuleViolation[]
isBookingLocked(b: Booking, now: Date): boolean                    // startDateTime(b) <= now
canStartAt(date, startMin, bookings, now, excludeId?): StartAvailability  // 'ok' | 'past' | 'busy' | 'short'
getStartOptions(date, bookings, now, excludeId?): StartOption[]   // see §7.5.2
getEndOptions(date, start, bookings, excludeId?): EndOption[]
getDefaultEnd(date, start, bookings, excludeId?): string           // §7.5.3
getFreeIntervals(date, bookings, now, excludeId?): Array<{ start: string; end: string }>  // only gaps >= 30 min
getDayAvailability(date, bookings, now): 'past-date' | 'day-over' | 'fully-booked' | 'available'
```

| #    | Правило               | Формально                                                                                                                    | Код                    | Target      | Сообщение                                                                                                  |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| R0   | Формат                | `date` соответствует `^\d{4}-\d{2}-\d{2}$` и это существующая дата; `start`/`end` соответствуют `^([01]\d\|2[0-3]):[0-5]\d$` | `INVALID_FORMAT`       | соотв.      | «Некорректный формат даты/времени»                                                                         |
| R0.1 | Шаг                   | `min % 15 === 0`                                                                                                             | `NOT_ALIGNED`          | соотв.      | «Время должно быть кратно 15 минутам»                                                                      |
| R9   | Название              | `title.trim().length ≤ 100`                                                                                                  | `TITLE_TOO_LONG`       | title       | «Не более 100 символов»                                                                                    |
| R1   | Рабочий день          | `start ≥ 09:00`; `end ≤ 18:00`                                                                                               | `OUT_OF_WORKING_HOURS` | start / end | «Бронирование возможно только с 09:00 до 18:00»                                                            |
| R2   | start < end           | `start < end`                                                                                                                | `START_NOT_BEFORE_END` | end         | «Окончание должно быть позже начала»                                                                       |
| R3   | ≥ 30 мин              | `end − start ≥ 30`                                                                                                           | `TOO_SHORT`            | end         | «Минимальная длительность — 30 минут»                                                                      |
| R4   | ≤ 2 ч                 | `end − start ≤ 120`                                                                                                          | `TOO_LONG`             | end         | «Максимальная длительность — 2 часа»                                                                       |
| R6a  | Не прошедшая дата     | `date ≥ today`                                                                                                               | `PAST_DATE`            | date        | «Нельзя бронировать на прошедшую дату»                                                                     |
| R6b  | Не прошедшее время    | `date = today ⇒ startDateTime > now` (строго, в мс)                                                                          | `PAST_TIME`            | start       | «Это время уже прошло»                                                                                     |
| R5   | Нет пересечений       | `∀ b ∈ existing: b.id ≠ excludeId ∧ b.date = date ⇒ ¬overlaps`                                                               | `OVERLAP`              | interval    | «Время пересекается с: 10:00–11:00 «Планёрка»» (все пересечения через «; », без названия — «Без названия») |
| R7   | Нет конфликта с собой | при редактировании в R5 передаётся `excludeId = id`                                                                          | —                      | —           | —                                                                                                          |
| R8   | Блокировка            | PATCH/DELETE запрещены, если `isBookingLocked(stored, now)`                                                                  | `BOOKING_LOCKED`       | — (не поле) | «Прошедшую или уже начавшуюся бронь нельзя изменить»                                                       |

`today = formatLocalDate(now)`. R6b и R8 — дополнения друг друга: бронь редактируема ⇔ её ещё можно было бы создать.

**Порядок и сбор ошибок:**

1. R0. При нарушении остальные проверки не выполняются.
2. R0.1 → R9 → R1 → R2 → R3/R4 → R6a → R6b. Собираются все нарушения, **не больше одного на target**: остаётся первое по порядку.
3. **R5 проверяется, только если на шаге 2 нарушений нет.** Пересечение по невалидному интервалу бессмысленно.
   Поэтому `08:45–09:30` при существующей `09:00–10:00` даёт `OUT_OF_WORKING_HOURS` (422), а не `OVERLAP`. Это осознанное правило, оно покрыто тестом.

**Граничные случаи (unit-тесты):**

- Длительность и границы дня:
  - `17:30–18:00` — ok; `17:45–18:00` — `TOO_SHORT`;
  - `08:45–09:30` — `OUT_OF_WORKING_HOURS`;
  - `10:00–12:00` — ok; `10:00–12:15` — `TOO_LONG`.
- Пересечения:
  - касание `10:00–11:00` + `11:00–12:00` — ok;
  - вложенность, совпадение и частичное перекрытие — `OVERLAP`.
- Редактирование: `10:00–11:00` → `10:00–11:30` своей брони — ok (R7).
- Сегодня и `now`:
  - `now = 10:07:00` → первое доступное начало `10:15`;
  - `now = 10:15:00.000` → `10:15` уже `PAST_TIME`, первое доступное — `10:30`;
  - `now = 10:14:59.999` → `10:15` — ok.
- Блокировка (R8): при `now = 10:00:00.000` бронь `10:00–11:00` заблокирована; при `now = 09:59:59.999` — нет.
- `canStartAt`, правило `short`:
  - есть `10:00–11:00` → `09:45` даёт `short` (до брони 15 минут);
  - `09:30` — ok;
  - `10:00–10:45` — `busy`;
  - `17:45` — `short` (до конца дня 15 минут).
- `getDayAvailability`:
  - `day-over` — сегодня, `now = 17:30:00` (последнее начало `17:30` уже не `> now`);
  - `fully-booked` — свободных окон ≥ 30 минут не осталось.
- Маскирование: `OVERLAP` не возвращается при других нарушениях.
- Перенос на другую дату: R5 проверяется по броням **целевой** даты с `excludeId`.

---

## 4. API-контракт

Формат — JSON. URL строится так: `new URL(base + path, window.location.origin)`, где `base = import.meta.env.VITE_API_BASE_URL ?? ''`.
Абсолютный URL нужен потому, что в jsdom/Node `fetch` не принимает относительные пути.

### 4.1. Эндпоинты

| Метод  | Путь                            | Тело                    | Успех                                     | Ошибки             |
| ------ | ------------------------------- | ----------------------- | ----------------------------------------- | ------------------ |
| GET    | `/api/bookings?date=YYYY-MM-DD` | —                       | `200 Booking[]`, отсортированы по `start` | 400                |
| POST   | `/api/bookings`                 | `BookingInput`          | `201 Booking`                             | 400, 409, 422      |
| PATCH  | `/api/bookings/:id`             | `Partial<BookingInput>` | `200 Booking`                             | 400, 404, 409, 422 |
| DELETE | `/api/bookings/:id`             | —                       | `204`                                     | 404, 422           |

Любой запрос может вернуть `500` или завершиться сетевой ошибкой.

**Правила тела запроса:**

- Неизвестные поля (в том числе `id`) отбрасываются (zod `strip`).
- Неверные типы → `400`. Например, `title: null`, `start: 900` или `date` не строкой.
- `title` хранится после `trim`. Пустой результат удаляет поле. Это касается и POST, и PATCH с `title: ""`.

**Правила PATCH:**

- Сервер мержит тело с сохранённой бронью и валидирует **итоговую** бронь с `excludeId = id`.
- `{}` → `200` с неизменённой бронью. Блокировка R8 при этом проверяется.

### 4.2. Формат ошибки

```ts
type ApiErrorBody = {
  error: {
    code: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'CONFLICT' | 'NOT_FOUND' | 'INTERNAL'
    message: string // ru, human readable
    reason?: RuleCode // rule not tied to a field, e.g. BOOKING_LOCKED
    fieldErrors?: Partial<
      Record<'date' | 'start' | 'end' | 'title', { code: RuleCode; message: string }>
    >
    conflicts?: Booking[] // 409 only
  }
}
```

**Порядок обработки** (первое сработавшее правило определяет ответ):
`400` (формат) → `404` → `422 reason=BOOKING_LOCKED` → `422` (правила R0.1–R6b, `fieldErrors`) → `409` (R5, `conflicts`, без `fieldErrors`).

| Статус | `code`             | Когда                                                                                            |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------ |
| 400    | `BAD_REQUEST`      | Битый JSON, неверные типы, нет или невалиден `?date`, нарушен R0. По возможности с `fieldErrors` |
| 404    | `NOT_FOUND`        | Нет брони с таким `id`                                                                           |
| 422    | `VALIDATION_ERROR` | R8 (`reason: 'BOOKING_LOCKED'`, без `fieldErrors`) или R0.1–R6b (`fieldErrors`)                  |
| 409    | `CONFLICT`         | R5. В `conflicts` — пересекающиеся брони (без редактируемой)                                     |
| 500    | `INTERNAL`         | Сбой (симулируется)                                                                              |

Все ответы с ошибкой отдаются с `Content-Type: application/json`.

### 4.3. Клиент API (`src/api`)

```ts
export class ApiError extends Error {
  status: number;                                   // 0 = network
  code: ApiErrorBody['error']['code'] | 'NETWORK';
  reason?: RuleCode; fieldErrors?: …; conflicts?: Booking[];
}
export interface BookingsApi {
  list(date: string, signal?: AbortSignal): Promise<Booking[]>;
  create(input: BookingInput): Promise<Booking>;
  update(id: string, patch: Partial<BookingInput>): Promise<Booking>;
  remove(id: string): Promise<void>;
}
export const httpBookingsApi: BookingsApi;          // fetch-based
// ApiProvider / useBookingsApi(): implementation injected via React context
```

- `http.ts`:
  - сериализует JSON и передаёт `AbortSignal`;
  - разбирает тело ошибки в `ApiError`;
  - превращает `TypeError` из `fetch` в `ApiError{status:0, code:'NETWORK'}`.
- Ответы при разборе проверяются zod-схемами. Несовпадение (например, HTML вместо JSON) → `ApiError{code:'INTERNAL'}` и `console.error`.
- UI не импортирует `fetch`, `msw` и `mocks/*`. oxlint это обеспечивает: `no-restricted-imports` запрещает `mocks/**` для `features/**`, `app/**` и `api/**`.
- Переход на реальный API: `VITE_USE_MOCKS=false` + `VITE_API_BASE_URL`. Код UI не меняется.

### 4.4. Слой запросов (`src/api/queries.ts`)

```ts
bookingKeys = { all: ['bookings'] as const, byDate: (d: string) => ['bookings', d] as const };

useBookings(date, { keepPrevious?: boolean })
// staleTime 10s, retry 1; placeholderData: keepPreviousData only when keepPrevious (timeline only)
useCreateBooking()
// onSettled: return invalidateQueries(byDate(input.date))
useUpdateBooking()
// variables { id, patch, oldDate }; onSettled: return invalidate byDate(oldDate) + byDate(patch.date ?? oldDate)
useDeleteBooking()
// variables { id, date }; onSettled: return invalidate byDate(date)
```

- Инвалидация в `onSettled` выполняется и при ошибках (409/404/422/500). Так выполняется требование «обновить список броней».
- `onSettled` **возвращает** промис инвалидации. Мутация завершается только после рефетча, поэтому статус «Сохранение…» держится до обновления списка.
- `refetchOnWindowFocus: 'always'`, когда тумблер D12 включён, и `false`, когда выключен. `'always'` выбран потому, что `true` рефетчит только устаревшие (stale) данные, а их свежесть не гарантирована. Запрос дешёвый, корректность важнее.
  TanStack Query v5 слушает только `visibilitychange`.
- **Placeholder-данные не используются для валидации.**
  - Таймлайн рендерит предыдущую дату приглушённо (`keepPrevious: true`).
  - Форма вызывает `useBookings(formDate)` без `keepPrevious`. Пока данных нет (`isPending`) или они placeholder (`isPlaceholderData`), бизнес-валидация, опции и подсказки не строятся: показывается «Загрузка доступного времени…», submit и клики по таймлайну заблокированы.

---

## 5. Mock-сервер и симуляция

Версии: `msw@^3` (ESM, Node ≥ 22.12) и `@msw/serve` для Node-сервера. Версии фиксируются в `package.json`.

### 5.1. Хранилище и внедрение зависимостей

```ts
interface KeyValueStorage { get(key: string): string | null; set(key: string, v: string): void }
createMemoryStorage(): KeyValueStorage
createWebStorage(s: Storage): KeyValueStorage        // try/catch, falls back to memory on error
createRepository(storage, clock): BookingRepository   // listByDate, get, insert, update, delete, reset(seed)
createSimulation(persistent: KeyValueStorage, oneShot: KeyValueStorage): Simulation
createHandlers({ repo, sim, clock }): RequestHandler[]
```

Зависимости внедряются **явно**, автоопределения окружения нет. Конфигурации по средам:

| Среда                               | Брони и настройки | Одноразовые флаги                                         | Override часов                           |
| ----------------------------------- | ----------------- | --------------------------------------------------------- | ---------------------------------------- |
| `browser.ts`                        | `localStorage`    | `sessionStorage` (флаги своей вкладки, переживают reload) | `localStorage` (общий для UI и handlers) |
| `server.ts` (Vitest, `setupServer`) | memory            | memory                                                    | memory                                   |
| `node-server.ts`                    | memory            | memory                                                    | memory                                   |

Свойства хранилища:

- Ключ `room-booking:db:v1`. Хранилище **перечитывается на каждый запрос**, поэтому вторая вкладка видит изменения.
- **Seed** выполняется, только если ключа **нет вовсе** (первый запуск). `reset({seed:false})` записывает `[]`, после него автоматического seed нет.
- Seed: 2–3 брони на сегодня и 2 на завтра. Время подбирается относительно `clock.now()`: на сегодня — прошедшая и будущая, если позволяет время суток.
- Инвариант: в хранилище **никогда** нет пересекающихся броней одной даты. Покрыт тестом, включая симуляцию гонки.

Модули `mocks/*` не обращаются к `import.meta.env`: в Node/tsx он не определён. Конфигурация передаётся параметрами.

### 5.2. Обработчики (`src/mocks/handlers.ts`)

Пути регистрируются с wildcard-хостом (`'*/api/bookings'`), поэтому одни и те же handlers работают в браузере, jsdom и Node-сервере.

Шаги для `/api/bookings*` выполняются по порядку:

1. Записать запрос в `requestLog` (метод, путь, время; кольцевой буфер на 100 записей).
2. Подождать `latencyMs`.
3. Если есть подходящий одноразовый `failNext` (§5.3): израсходовать и вернуть `500` / `HttpResponse.error()`.
4. Разобрать вход. Ошибка → `400`.
5. PATCH/DELETE:
   - найти бронь, иначе `404`;
   - проверить R8, иначе `422 reason=BOOKING_LOCKED`;
   - для PATCH смержить тело с бронью.
6. POST/PATCH: `validateBookingInput` без R5. Нарушения → `422 fieldErrors`.
7. POST/PATCH: **симуляция гонки** (§5.3). Может вставить «чужую» бронь.
8. POST/PATCH: проверить R5 → `409 conflicts`.
9. Сохранить и ответить (`201` / `200` / `204`).

### 5.3. Симуляция (`src/mocks/simulation.ts`)

| Настройка           | Тип / по умолчанию                                                                                             | Хранение   | Поведение                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `latencyMs`         | `0 \| 400 \| 1500`, `400`                                                                                      | persistent | Задержка ответов `/api/bookings*`                                                                                              |
| `raceProbability`   | `0..1`, `0`                                                                                                    | persistent | С этой вероятностью на шаге 7 вставляется «чужая» бронь                                                                        |
| `forceConflictNext` | `boolean`                                                                                                      | one-shot   | Детерминированная вставка на шаге 7 для следующего POST/PATCH. Расходуется только при реальной вставке                         |
| `failNext`          | `{ kind: '500' \| 'network'; method: 'GET' \| 'POST' \| 'PATCH' \| 'DELETE' \| 'ANY'; count: number } \| null` | one-shot   | Следующие `count` запросов с подходящим методом завершаются ошибкой. Для GET нужен `count: 2`, иначе ретрай (A3) скроет ошибку |

**Вставка «чужой» брони** (`title: "Занято другим сотрудником"`):

- **POST:** на весь запрошенный интервал.
- **PATCH:** только на **новую** часть интервала. Это запрошенный интервал минус исходный интервал той же брони, а при переносе на другую дату — весь интервал.
  - Если новая часть пуста (сужение интервала, правка только `title`), вставки нет: реальной гонки здесь быть не может.
  - Если частей две (расширение в обе стороны), берётся первая.
- Длина «чужой» брони может быть меньше 30 минут. Это допустимый артефакт симуляции: правила валидируют пользовательский ввод, а не данные «других сотрудников».

Конфликт **честный**: «чужая» бронь реально сохраняется и после рефетча видна на таймлайне.

### 5.4. Запуск MSW в браузере

- `main.tsx`: если `import.meta.env.VITE_USE_MOCKS !== 'false'`, то `const { worker } = await import('./mocks/browser')` (dynamic import), затем `await worker.start({ onUnhandledFrame: 'bypass' })`. После старта выставляется `window.__mswReady = true`, затем рендер.
- Dynamic import нужен, чтобы при выключенных mocks `msw` и handlers не попадали в бандл.
- DevPanel рендерится по тому же флагу.
- `public/mockServiceWorker.js` коммитится. В продакшен-деплое mocks **включены**.

### 5.5. Node-сервер mock-API (инструмент проверки)

- `src/mocks/node-server.ts` поднимает сервер через `createServer(...createHandlers({ repo, sim, clock }))` из `@msw/serve` с memory-хранилищами. Запуск — `npm run mock:server` (через `tsx`), порт `MOCK_PORT` (по умолчанию `3001`).
- **Сетевая ошибка:** `HttpResponse.error()` в Node-адаптере может превратиться в 500. Поэтому `node-server.ts` распознаёт такие ответы (`response.type === 'error'`) и обрывает соединение (`socket.destroy()`).
  Если `@msw/serve` такой точки расширения не даёт, используется `@msw/serve/express` + свой middleware. Выбор фиксируется в T05, поведение проверяется кейсом A28.
- Это только dev-инструмент: в деплой и бандл не попадает.

### 5.6. Служебные dev-эндпоинты (`src/mocks/devHandlers.ts`)

Работают в обоих режимах mock и только в них. **Не логируются, не задерживаются и не расходуют одноразовые флаги.**

| Метод | Путь                    | Тело                                                                   | Ответ                                                                                         |
| ----- | ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| POST  | `/api/__dev/reset`      | `{ seed?: boolean }` (по умолчанию `true`)                             | `204`. Очистить брони, `requestLog` и одноразовые флаги; при `seed` — заполнить               |
| POST  | `/api/__dev/bookings`   | `Booking[]` без `id` или с ним                                         | `201 Booking[]`. Сырая вставка **без валидации** — для фикстур с прошедшими и идущими бронями |
| PUT   | `/api/__dev/simulation` | `Partial<{ latencyMs, raceProbability, forceConflictNext, failNext }>` | `200` текущие настройки                                                                       |
| PUT   | `/api/__dev/clock`      | `{ now: string \| null }` (ISO local, `YYYY-MM-DDTHH:mm:ss.sss`)       | `200 { now }`. В браузере действует и на UI, потому что `clock` общий                         |
| GET   | `/api/__dev/state`      | —                                                                      | `200 { simulation, now, requestLog }`                                                         |

DevPanel работает с сервером только через `src/dev/devApi.ts`.

---

## 6. Архитектура фронтенда

```
src/
  main.tsx                    # bootstrap: (mocks?) → render
  app/       App.tsx providers.tsx queryClient.ts
  domain/    booking.ts constants.ts time.ts rules.ts messages.ts  *.test.ts
  api/       errors.ts http.ts schemas.ts bookingsApi.ts ApiProvider.tsx queries.ts
  mocks/     browser.ts server.ts node-server.ts handlers.ts devHandlers.ts
             store.ts storage.ts seed.ts simulation.ts  handlers.test.ts
  features/booking/
    BookingPage.tsx           # selected date, panel state, guard, highlights
    DateNavigator.tsx
    DayTimeline.tsx TimelineBooking.tsx
    BookingPanel.tsx          # placeholder | form | details
    BookingForm.tsx useBookingForm.ts formSchema.ts
    BookingDetails.tsx        # read-only view (§7.5.7)
    DeleteBookingDialog.tsx ConfirmDiscardDialog.tsx
    states/ TimelineSkeleton.tsx EmptyState.tsx ErrorState.tsx
    messages.ts               # all user-facing texts: errors, toasts
  dev/       DevPanel.tsx devApi.ts
  shared/    clock.ts useNow.ts useSelectedDate.ts  ui/*
  test/      setup.ts renderWithProviders.tsx
e2e/         fixtures.ts helpers/ *.spec.ts
scripts/     api-check.sh export-chat.ts
docs/        SPEC.md TASKS.md REVIEW.md qa/REPORT.md qa/screenshots/ ai-chat.md
```

**Зависимости между слоями:**

- `domain` ни от чего не зависит.
- `shared` → `domain`.
- `api` → `domain`, `shared`.
- `features` → `api`, `domain`, `shared`.
- `dev` → `shared`; с сервером общается только по HTTP.
- `app` → всё, кроме `mocks`.
- `mocks` → `domain`, `shared`.
- Правило «никто из UI не импортирует `mocks`» проверяется oxlint `no-restricted-imports` (`.oxlintrc.json`). Исключение — `main.tsx` (dynamic import).

TypeScript: `strict`, `noUncheckedIndexedAccess`, без `any`. Линтер — oxlint (шаблон Vite 8; плагины typescript, react, jsx-a11y, import, vitest). Prettier.

---

## 7. UI

### 7.1. Раскладка

- **≥ 1024px:**
  - шапка: заголовок + `DateNavigator`;
  - слева таймлайн (≈ 60%);
  - справа sticky-панель `BookingPanel`. Без выбранной брони и открытой формы в ней плейсхолдер «Выберите бронь на таймлайне или создайте новую».
- **< 1024px:**
  - одна колонка: шапка → `BookingPanel` (только если открыта форма или просмотр) → таймлайн;
  - при открытии панели фокус переходит на её заголовок, страница прокручивается к ней.
- `DevPanel` — сворачиваемый блок внизу («Панель симуляции»), по умолчанию свёрнут.
- Минимальная ширина — 320px, горизонтального скролла нет. Интерактивные элементы ≥ 44px. Исключение — слой кликов по таймлайну, это дополнительный путь только для мыши.

### 7.2. DateNavigator

- Кнопки «Предыдущий день», «Сегодня», «Следующий день» (иконки с `aria-label`) и `<input type="date">` с подписью **«Показать дату»**.
- Человекочитаемая дата («вторник, 13 октября 2026», `Intl.DateTimeFormat('ru-RU')`) и бейдж «Прошедшая дата».
- `?date=`: без параметра или с невалидным значением подставляется сегодняшняя дата через `replaceState`.
- Смена даты при открытой форме или просмотре **закрывает панель**. Если форма изменена, сначала показывается `ConfirmDiscardDialog`.

### 7.3. DayTimeline

**Геометрия:**

- Шкала 09:00–18:00, **1 мин = 1.6px** на всех ширинах (высота 864px).
- Часовые метки, тонкие линии через 15 минут.
- Брони — абсолютно позиционированные блоки с отступом 2px между соседними.

**Блок брони:**

- `<button>` внутри `<ol><li>`. В порядке DOM брони идут по времени.
- Брони короче 45 минут — в компактном виде, одной строкой: время + иконка, название обрезается. Полный текст — в `aria-label` и в `title`.
- `aria-label`: «10:00–11:00, Планёрка. Изменить» / «…, идёт сейчас. Посмотреть».
- Редактируемая бронь: клик открывает форму edit.
- Заблокированная (R8): приглушённый стиль, иконка замка и текст «прошла» или «идёт сейчас». Клик открывает `BookingDetails`.
- Клик по брони при изменённой форме → guard (§7.5.6).

**Сегодня:**

- прошедшее время штрихуется;
- линия «сейчас» обновляется каждые 30 секунд (`useNow`).

**Слой кликов** (`aria-hidden`, только мышь и тач):

- Клик по 15-минутной ячейке `s` — то же, что «Новая бронь» с `start = s` (§7.5.3), если `canStartAt(s) = 'ok'`.
- Иначе клик ничего не делает, курсор `not-allowed`, в `title` — причина: «прошло» / «занято» / «меньше 30 мин свободно».
- Пока данные — placeholder, клики заблокированы.

**Подсветка конфликтов:**

- Брони из последнего 409 (`conflicts`) получают outline и подпись «Только что занято».
- Подсветка живёт, пока жив alert 409 (§7.6). На дате, отличной от даты формы, она не показывается.

**Кнопка «Новая бронь»** над таймлайном — основной путь с клавиатуры.

- Доступность определяется через `getDayAvailability`. Если не `available`, кнопка `aria-disabled="true"`: остаётся фокусируемой, клик игнорируется. Через `aria-describedby` к ней привязана видимая причина:
  - `past-date` → «Нельзя бронировать на прошедшую дату»;
  - `day-over` → «На сегодня бронирование уже недоступно»;
  - `fully-booked` → «На эту дату нет свободного времени (от 30 мин)».
- Клик при изменённой форме → guard.

### 7.4. Состояния списка

| Состояние                                       | Отображение                                                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Первичная загрузка (`isPending`)                | Скелетон таймлайна, `aria-busy="true"`                                                                                                                                 |
| Фоновое обновление (`isFetching && !isPending`) | Спиннер «Обновление…» в шапке таймлайна. Данные и панель не размонтируются                                                                                             |
| Ошибка без данных                               | `ErrorState`: «Не удалось загрузить бронирования» + «Повторить». `role="alert"`                                                                                        |
| Ошибка при наличии данных                       | Данные + inline-предупреждение «Не удалось обновить список» + «Повторить»                                                                                              |
| Пусто                                           | Шкала + «На эту дату бронирований нет». CTA «Забронировать» использует тот же обработчик и ту же доступность, что «Новая бронь»; при недоступности CTA не показывается |
| Смена даты                                      | Предыдущие брони приглушены (`keepPrevious`), пока грузятся новые                                                                                                      |

### 7.5. Панель брони

#### 7.5.1. Режимы и связь с датой страницы

| Режим    | Когда                                                     | Дата формы                                                                                                                                                 |
| -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create` | «Новая бронь», CTA, клик по ячейке                        | **Связана с датой страницы.** Поле «Дата брони» меняет дату страницы. Таймлайн и форма показывают один день                                                |
| `edit`   | Клик по редактируемой брони                               | Независима (D13). Если она отличается от даты страницы, форма показывает пометку «Перенос на 15 октября», загружает брони целевой даты и валидирует по ним |
| `view`   | Клик по заблокированной брони, переход из edit (§7.6, R8) | — (`BookingDetails`)                                                                                                                                       |

#### 7.5.2. Поля формы

Все поля controlled (`Controller`), значения хранятся в состоянии RHF.

| Поле       | Контрол                                          | Детали                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дата брони | `<input type="date" min={today}>`                | См. 7.5.1                                                                                                                                                                                                                                           |
| Начало     | `<select>` с `<optgroup label="10:00">` по часам | Значения 09:00…17:30. **На сегодня прошедшие начала не показываются.** Занятые — `disabled` с текстом «10:15 — занято». Окна короче 30 минут — `disabled` с текстом «09:45 — меньше 30 мин свободно». Причина также видна в подсказке «Свободно: …» |
| Окончание  | `<select>`                                       | `start+30 … min(start+120, 18:00)`. Текст опции — «11:15 (1 ч 15 мин)». Опции, ведущие к пересечению, — `disabled`: «11:30 (1 ч 30 мин) — занято»                                                                                                   |
| Название   | `<input type="text" maxLength={100}>`            | Необязательное, счётчик «37/100»                                                                                                                                                                                                                    |

Время сгруппировано в `<fieldset><legend>Время</legend>`. Ошибка `interval` (OVERLAP) выводится под fieldset и связана с обоими select через `aria-describedby`.
Под группой — подсказка «Свободно: 09:00–10:00, 11:30–18:00» (`getFreeIntervals`), тоже в `aria-describedby`.

#### 7.5.3. Начальные значения и автокоррекция

- Открытие через «Новая бронь» или CTA: `start` — первое доступное начало, `end = getDefaultEnd(start)`, `title` пустой.
- Открытие кликом по ячейке: `start` — время ячейки, `end = getDefaultEnd(start)`.
- `getDefaultEnd(start) = min(start + 60, начало ближайшей следующей брони, 18:00)`. Результат всегда `≥ start + 30`, потому что `start` выбирается только из доступных.
- Edit: значения брони.
- Начальные значения не считаются изменениями (`isDirty = false`).
- Смена `start`:
  - текущий `end` остаётся допустимым → не меняется;
  - иначе `end = getDefaultEnd(start)`, а под полем «Окончание» появляется «Окончание скорректировано: 11:00» в `aria-live="polite"`, связанное через `aria-describedby`. Текст исчезает при следующей смене `end`.

#### 7.5.4. Валидация

- **zod** (`formSchema.ts`) проверяет формат и `title` (R0, R9).
- **Бизнес-правила** проверяет `validateBookingInput` с бронями даты формы и `clock.now()`, через кастомный resolver.
- **Режим** `onTouched`; при submit проверяется всё.
- **Изменение списка броней** (рефетч) ревалидирует только поля, которые пользователь уже трогал (`touched`), или все — если форма уже отправлялась (`trigger(['start','end'])`).
- **Серверные `fieldErrors`** хранятся в отдельном состоянии `serverErrors` и подмешиваются в результат resolver. Поле очищается от серверной ошибки, когда пользователь меняет его значение. Так ревалидация после рефетча не стирает их (`setError` в RHF не персистентен).
- **Блокировка во время редактирования:** в режиме `edit` на каждом тике `useNow` и перед submit проверяется `isBookingLocked(booking, now)`. Если бронь стала заблокированной, панель переходит в `view` с alert: «Бронь уже началась — изменить её нельзя. Несохранённые изменения: 10:30–11:30 «…»». Изменения, введённые пользователем, показываются текстом.

#### 7.5.5. Отправка и успех

- **Отправка:**
  - кнопка disabled, внутри спиннер и «Сохранение…»;
  - поля в `<fieldset disabled>`: значения остаются в RHF;
  - `aria-busy` на форме;
  - повторный submit невозможен.
- **Успех:** панель закрывается, показывается toast (тексты — §7.9).
- **Фокус после успеха** — первое доступное в цепочке:
  1. блок созданной или изменённой брони на текущей дате;
  2. «Новая бронь», если она доступна;
  3. заголовок секции таймлайна (`tabIndex=-1`).
- **Перенос на другую дату:** страница остаётся на исходной дате, toast с действием «Перейти к 15 октября».

#### 7.5.6. Защита несохранённых данных

Если форма изменена (`isDirty`), `ConfirmDiscardDialog` («Отменить несохранённые изменения?» — «Продолжить редактирование» / «Отменить изменения») показывается перед этими действиями:

- клик по свободной ячейке;
- «Новая бронь» и CTA;
- клик по другой брони;
- смена даты в `DateNavigator`.

Кнопка «Отмена» в форме — явное действие, без подтверждения. Перезагрузка или закрытие вкладки при изменённой форме → `beforeunload`.

#### 7.5.7. Просмотр (`BookingDetails`)

- Заголовок «Бронь (только просмотр)».
- `<dl>` с полями: дата, время, длительность, название, статус («прошла» / «идёт сейчас»).
- Кнопка «Закрыть». Контролов формы нет.

### 7.6. Обработка ошибок мутаций

| Ошибка                          | Что видит пользователь                                                                                                                                                                                                                                                                                                                                                                              | Что происходит                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **409 CONFLICT**                | Alert (warning, `role="alert"`) вверху формы. Сначала: «Пока вы заполняли форму, это время заняли: 10:00–11:00 «Занято другим сотрудником». Обновляем список…». После рефетча: «…Список обновлён — выберите другое время». Если рефетч не удался: «…Не удалось обновить список» + «Повторить». На мобильной ширине в alert есть ссылка «Показать на таймлайне» (скролл к первой подсвеченной брони) | Форма открыта, **все значения сохранены**. Фокус **сразу** переходит на select «Начало». После рефетча ревалидация помечает ошибку `interval`. Брони из `conflicts` подсвечены |
| **422 `reason=BOOKING_LOCKED`** | Переход в `view` с alert про несохранённые изменения (§7.5.4)                                                                                                                                                                                                                                                                                                                                       | Рефетч                                                                                                                                                                         |
| **422 `fieldErrors`**           | Ошибки под полями (`serverErrors`), фокус на первое поле с ошибкой                                                                                                                                                                                                                                                                                                                                  | Данные сохранены                                                                                                                                                               |
| **404** (edit)                  | «Эта бронь уже удалена» + кнопка «Создать новую с этими данными». Кнопка переводит форму в `create` с теми же значениями и делает дату страницы равной дате формы                                                                                                                                                                                                                                   | Рефетч                                                                                                                                                                         |
| **500 / NETWORK**               | «Не удалось сохранить. Проверьте соединение и попробуйте ещё раз»                                                                                                                                                                                                                                                                                                                                   | Данные сохранены, повтор той же кнопкой                                                                                                                                        |
| **400**                         | «Некорректный запрос» + `console.error`                                                                                                                                                                                                                                                                                                                                                             | Ошибка программиста                                                                                                                                                            |

- **Время жизни alert 409 и подсветки:** до следующего submit, закрытия панели или смены даты страницы. Пока пользователь подбирает новое время, alert остаётся видимым.
- **Несколько конфликтов** перечисляются через «; ». Бронь без названия выводится как «Без названия».

### 7.7. Удаление

- «Удалить» в форме edit открывает `AlertDialog` с текстом «Удалить бронь 10:00–11:00 «Планёрка»?». Кнопки: «Удалить» (danger) и «Отмена». Фокус по умолчанию на «Отмена».
- Пока идёт запрос: спиннер на кнопке, диалог не закрывается.
- **Успех** или **404:** диалог и панель закрываются, toast (§7.9). Фокус — по цепочке §7.5.5 без пункта 1.
- **422 `BOOKING_LOCKED`** и **500 / сеть:** ошибка внутри диалога, данные не теряются.
- Рефетч выполняется при любом исходе.

### 7.8. DevPanel

- Контролы:
  - latency;
  - вероятность гонки (0 / 25 / 50 / 100%);
  - «Следующая мутация вернёт 409»;
  - «Следующий запрос: 500 / сетевая ошибка» (с выбором метода);
  - тумблер «Обновлять при возврате на вкладку» (D12);
  - «Сбросить данные»;
  - (P2) «Зафиксировать время».
- Подпись «Только для демонстрации: управляет mock-сервером».
- Инструкция по воспроизведению 409 тремя способами.

### 7.9. Тексты уведомлений (`features/booking/messages.ts`)

| Событие       | Toast                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Создание      | «Бронь создана: 10:00–11:00»                                                |
| Сохранение    | «Изменения сохранены»                                                       |
| Перенос       | «Бронь перенесена на 15 октября» + действие «Перейти» (не исчезает сам, A6) |
| Удаление      | «Бронь удалена»                                                             |
| Удаление, 404 | «Бронь уже была удалена»                                                    |

---

## 8. Доступность

- `<html lang="ru">`. Есть `header` и `main`, секции подписаны через `aria-labelledby`.
- У каждого поля есть `<label>`, у разных полей разные accessible names («Показать дату» ≠ «Дата брони»). Ошибки связаны через `aria-describedby`, у невалидного поля `aria-invalid`.
- Toast — `aria-live="polite"`. Ошибки отправки — `role="alert"`.
- Всё доступно с клавиатуры. Видимый `:focus-visible`. Недоступные действия — `aria-disabled` с видимой причиной, а не `disabled`.
- Фокус:
  - при открытии панели — на её заголовок;
  - после закрытия — по цепочке §7.5.5;
  - диалоги держат фокус внутри (Radix).
- Состояние не передаётся только цветом: иконки и текст «прошла» / «идёт сейчас» / «Только что занято».
- Контраст ≥ 4.5:1. `prefers-reduced-motion` отключает анимации.
- **Как проверяется:** axe (E62), проход только клавиатурой (E61), доступные селекторы в Playwright.
- Проверка скринридерами (VoiceOver/NVDA) агенту недоступна. В README она указана в разделе «не сделано».

---

## 9. Тестирование и приёмочная проверка

### 9.1. Vitest

- **Unit** (`domain/*.test.ts`) — все граничные случаи §3. `now` передаётся явно.
- **Handlers** (`mocks/handlers.test.ts`) — по одному тесту на каждый статус и `reason`, плюс инвариант «нет пересечений после гонки» (POST и PATCH). Полное покрытие контракта — в §9.3, здесь его не дублируем.
- **Интеграционные** (`features/booking/*.test.tsx`, RTL + `setupServer`):
  - `clock` внедряется через провайдер, без fake timers; `latencyMs: 0`;
  - перед каждым тестом свежие memory-хранилища.

  Сценарии:
  1. Загрузка, пустое состояние, ошибка (`failNext` GET × 2) → «Повторить».
  2. Создание.
  3. **409 сохраняет все значения формы.**
  4. Редактирование без самоконфликта.
  5. Перенос на другую дату.
  6. Удаление.
  7. Сегодня `now = 10:07`.
  8. 422 `BOOKING_LOCKED` от сервера → `view`. Включается через `server.use` с принудительным ответом, потому что клиент в норме ловит блокировку раньше сервера.

### 9.2. Проверка UI через Playwright (D15)

**Слой 1 — интерактивный проход агентом (основной, обязателен по всем сценариям).**
Агент сам управляет браузером через Playwright (Playwright MCP или скрипты) на `vite preview` (продакшен-сборка с MSW) и проходит **каждый** E-сценарий из таблиц ниже:

- кликает, вводит с клавиатуры, переключает DevPanel, открывает вторую вкладку;
- снимает скриншоты, **просматривает их** и оценивает вёрстку: наложения, обрезанный текст, прыжки раскладки, понятность сообщений, видимость фокуса;
- собирает `console` и `pageerror`: ни ошибок, ни React-warnings быть не должно;
- проходит на десктопе 1280×800 и мобильном 375×812, для E63 ещё 320 и 768.

Скриншоты обязательны для перечисленного ниже. Формат — PNG с оптимизацией или WebP, путь `docs/qa/screenshots/<ID>-<состояние>-<viewport>.png`.
Мобильные скриншоты нужны только для строк, помеченных «+ mobile».

| Что снять                                                                | Сценарии           |
| ------------------------------------------------------------------------ | ------------------ |
| Скелетон, пусто, ошибка загрузки (+ mobile)                              | E01, E02, E03      |
| День с бронями, сегодня (штриховка, «сейчас»), прошедшая дата (+ mobile) | E10, E15, E06      |
| Форма: начальная, с ошибками, отправка, просмотр (+ mobile)              | E23, E14, E20, E35 |
| 409: alert, сохранённые значения, подсветка (+ mobile)                   | E50, E53           |
| Ошибки 500 / сеть / 404, блокировка во время edit                        | E55, E56, E57, E36 |
| Диалоги удаления и отмены изменений, DevPanel                            | E40, E22, E52      |

Итог — `docs/qa/REPORT.md`:

- таблица «ID → ✅ / ❌ / ⚠️ → скриншот → комментарий»;
- список найденных и исправленных багов;
- время прохода.

Каждый баг исправляется, после чего сценарий проходится заново со свежим скриншотом.

**Слой 2 — автотесты `e2e/` (регрессия).**

- Обязательный минимум — сценарии с тегом `@smoke`.
- Остальные E-сценарии — по мере времени (T17).
- Автотесты нужны, чтобы после исправлений быстро перепроверить, что ничего не сломалось. Интерактивный проход они не заменяют.

**Конфигурация (`playwright.config.ts`):**

- `webServer: npm run build && npm run preview`; `baseURL = E2E_BASE_URL ?? http://localhost:4173`.
- Проекты: `desktop-chromium` 1280×800, `mobile-chromium` (Pixel 7). `@smoke` также на `webkit`.
- `serviceWorkers: 'allow'` (явно: при `'block'` MSW не работает). `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `retries: 0`.
- **Фикстура:**
  1. `page.clock.setFixedTime(...)`, если нужно;
  2. `goto` и ожидание `window.__mswReady`;
  3. через `page.evaluate(fetch)`: `__dev/reset {seed:false}`, затем `__dev/bookings` с нужными бронями (в том числе прошедшими и идущими);
  4. `__dev/simulation`: one-shot флаги в `sessionStorage` переживают reload;
  5. `page.reload()`;
  6. проверки.

  `BrowserContext` изолирует `localStorage` и `sessionStorage`, поэтому тесты можно параллелить.

- **Время:**
  - `setFixedTime` замораживает `Date`: в UI, в handlers и в TanStack Query (свежесть данных не меняется), при этом таймеры идут;
  - чтобы «сдвинуть» время, повторно вызывается `setFixedTime`;
  - тик `useNow` (30 с) ускоряется через `page.clock.runFor` или ожиданием после `install`.
- **Подсчёт запросов** (E20, E58) — по `requestLog` из `GET /api/__dev/state`, а не через `page.on('request')`.
- **Селекторы** — `getByRole` / `getByLabel` / `getByText`. `data-testid` — только для геометрии таймлайна.

**Сценарии** (ID с пропусками для группировки; всего 51):

_Отображение и состояния_

| ID           | Сценарий                                                | Ожидание                                                                                     |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| E01 `@smoke` | latency 1500, открыть страницу                          | Скелетон + `aria-busy`, затем брони                                                          |
| E02          | Дата без броней                                         | Пустое состояние + CTA                                                                       |
| E03          | `failNext {kind:'500', method:'GET', count:2}` → reload | `ErrorState` → «Повторить» → данные                                                          |
| E04          | ← / → / «Сегодня» / ввод в «Показать дату»              | Брони меняются, `?date=` обновляется, reload сохраняет дату                                  |
| E05          | `?date=abc`, `?date=2026-02-30`                         | Сегодняшняя дата, ошибок нет                                                                 |
| E06          | Прошедшая дата с бронями                                | Бейдж; «Новая бронь» `aria-disabled` с причиной, фокусируется; брони открываются в просмотре |
| E07          | Рефетч при latency 1500                                 | Данные на месте, «Обновление…»                                                               |
| E08          | Смена даты при latency 1500                             | Старые брони приглушены; клики по ячейкам заблокированы до загрузки                          |

_Создание_

| ID           | Сценарий                                                                      | Ожидание                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| E10 `@smoke` | «Новая бронь» → время → название → «Создать»                                  | Toast, бронь на таймлайне, панель закрыта, фокус на новой брони                                                                             |
| E11          | Границы дня                                                                   | Первое начало 09:00, последнее 17:30. Для 17:30 единственное окончание 18:00, бронь создаётся                                               |
| E12          | Длительность для начала 10:00                                                 | Окончания 10:30…12:00 с подписями длительности                                                                                              |
| E13          | Есть 10:00–11:00                                                              | 11:00–12:00 и 09:00–10:00 создаются (касание)                                                                                               |
| E14          | Есть 10:00–11:00                                                              | 10:00–10:45 — «занято»; 09:45 — «меньше 30 мин свободно»; для 09:30 окончания после 10:00 — «занято»                                        |
| E15          | Сегодня, `now = 10:07`                                                        | Начала до 10:00 включительно отсутствуют, первое — 10:15. Штриховка до 10:07, линия «сейчас»                                                |
| E16          | `now = 10:15:30`, затем `now = 10:15:00.000`                                  | В обоих случаях первое доступное начало 10:30                                                                                               |
| E17          | Сегодня, `now = 17:30`                                                        | «Новая бронь» `aria-disabled`, «На сегодня бронирование уже недоступно». Клик по таймлайну ничего не открывает. CTA пустого состояния скрыт |
| E18          | Будущий день, занятый целиком (через `__dev/bookings`)                        | «На эту дату нет свободного времени (от 30 мин)»                                                                                            |
| E19          | Название: 100 символов / попытка 101 / пробелы / « abc »                      | Сохраняется; ввод ограничен, «100/100»; «Без названия»; сохранено как «abc»                                                                 |
| E20          | Двойной клик и Enter×2 по «Создать» при latency 1500                          | В `requestLog` ровно один POST, «Сохранение…», fieldset disabled                                                                            |
| E21          | Клик по ячейке 14:00; рядом бронь 14:30                                       | Форма 14:00–14:30. Клик по 14:15 ничего не делает (`title`: «меньше 30 мин свободно»)                                                       |
| E22          | Изменённая форма → клик по другой ячейке / брони / «Новая бронь» / смена даты | `ConfirmDiscardDialog`. «Продолжить» сохраняет данные, «Отменить изменения» выполняет действие                                              |
| E23          | «Новая бронь» на будущей дате с бронью 09:00–10:00                            | Начальные значения 10:00–11:00, форма не изменена (`isDirty = false`)                                                                       |
| E24          | Бронь 12:00–13:00 на дате. Форма 10:00–11:30 → начало 11:00 → начало 11:15    | При 11:00 конец 11:30 остаётся (валиден). При 11:15 конец 11:30 недопустим (15 мин) → 12:00 + «Окончание скорректировано: 12:00»            |
| E25          | Create, изменить «Дату брони» в форме                                         | Дата страницы и таймлайн следуют за полем                                                                                                   |

_Редактирование_

| ID  | Сценарий                                             | Ожидание                                                                                                           |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| E30 | Продлить 10:00–11:00 до 11:30                        | Сохранено, свои опции не disabled (R7)                                                                             |
| E31 | Продлить в соседнюю бронь                            | Опции «занято». Если сосед появился после открытия формы (через `__dev/bookings` + рефетч), видна ошибка интервала |
| E32 | Перенос на свободную дату                            | Пометка «Перенос на …»; исчезла с исходной даты; toast «Перейти» → на целевой дате есть                            |
| E33 | Перенос на дату, где слот занят                      | Валидация по целевой дате, submit заблокирован                                                                     |
| E34 | Очистить название                                    | «Без названия»                                                                                                     |
| E35 | Идущая бронь; бронь прошедшего дня                   | `BookingDetails`: статус, «Закрыть», нет полей и кнопок изменения                                                  |
| E36 | Edit открыт, `setFixedTime` за `start`, тик `useNow` | Переход в просмотр, alert с несохранёнными значениями, PATCH не отправлялся                                        |
| E37 | Edit → бронь удалена во второй вкладке → «Сохранить» | «Эта бронь уже удалена» → «Создать новую с этими данными» → форма create с теми же значениями → успешно            |

_Удаление_

| ID           | Сценарий                                                    | Ожидание                                         |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------ |
| E40          | «Удалить» → «Отмена»                                        | Фокус по умолчанию на «Отмена», бронь на месте   |
| E41 `@smoke` | «Удалить» → подтвердить                                     | Toast, брони нет, после reload тоже              |
| E42          | Удалена во второй вкладке → удалить в первой                | «Бронь уже была удалена», список обновлён        |
| E43          | `failNext {kind:'500', method:'DELETE', count:1}` → удалить | Ошибка в диалоге, бронь на месте, повтор успешен |

_Серверные ошибки и конфликты_

| ID           | Сценарий                                                                                                   | Ожидание                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| E50 `@smoke` | `forceConflictNext`, заполнить **все** поля, отправить                                                     | Alert с временем конфликта, «Обновляем…» → «Список обновлён». Все значения сохранены, фокус на «Начало», ошибка интервала, «чужая» бронь подсвечена |
| E51          | После E50 выбрать другое время → отправить                                                                 | Успех, alert и подсветка исчезли                                                                                                                    |
| E52          | DevPanel: вероятность гонки 100% → создать; затем PATCH с расширением 10:00–11:00 → 11:30                  | 409 в обоих случаях. При PATCH «чужая» бронь 11:00–11:30, пересечений в хранилище нет                                                               |
| E53 `@smoke` | Две страницы, тумблер обновления выключен. A заполняет форму, B создаёт бронь на то же время, A отправляет | Поведение E50                                                                                                                                       |
| E54          | То же, тумблер включён. В A `document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))`     | A перезапросил список без отправки. Форма сохранила данные и показывает ошибку интервала                                                            |
| E55          | `failNext {kind:'500', method:'POST', count:1}`                                                            | Сообщение, данные сохранены, повтор успешен                                                                                                         |
| E56          | `failNext {kind:'network', method:'POST', count:1}`                                                        | Текст про соединение, данные сохранены                                                                                                              |
| E57          | 409 + рефетч падает (`failNext` GET × 2 сразу после `forceConflictNext`)                                   | «Не удалось обновить список» + «Повторить»                                                                                                          |
| E58          | После каждой ошибки мутации из E50–E57                                                                     | В `requestLog` есть GET нужной даты после мутации                                                                                                   |

_Сохранность, доступность, адаптивность_

| ID           | Сценарий                                                                                                                                | Ожидание                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| E60          | Создать → reload                                                                                                                        | Бронь на месте                                                                                                                                       |
| E61          | Создание, редактирование и удаление только клавиатурой                                                                                  | Всё достижимо, фокус видим и возвращается по §7.5.5                                                                                                  |
| E62          | axe: список, пусто, ошибка, форма с ошибками, диалоги, DevPanel                                                                         | 0 critical/serious                                                                                                                                   |
| E63 `@smoke` | 320 / 375 / 768 / 1280                                                                                                                  | `scrollWidth ≤ clientWidth`. На < 1024 панель над таймлайном и получает фокус. Блоки 30 мин читаемы. Ссылка «Показать на таймлайне» при 409 работает |
| E64          | `prefers-reduced-motion: reduce`                                                                                                        | Анимаций нет                                                                                                                                         |
| E65 (P2)     | `api-parity.spec.ts`: A01, A13, A15, A17, A23 через `page.evaluate(fetch)` и через Node-сервер (оба запущены, одинаковый `__dev/clock`) | Совпадают статусы и тела без учёта `id`                                                                                                              |

`@smoke` дополнительно прогоняется против деплоя: `E2E_BASE_URL=https://… npx playwright test --grep @smoke`.

### 9.3. Проверка API через curl (D16)

`scripts/api-check.sh` (`npm run test:api`) — curl + jq.

- Если `API_URL` не задан, скрипт поднимает `mock:server` и гасит его через `trap`.
- На каждом кейсе проверяются статус, тело и `Content-Type`.
- При несовпадении печатает запрос и ответ, код выхода ≠ 0. В конце — сводка «N/N passed».
- Системные требования: `curl`, `jq`.

**Время и даты:**

- В начале каждой группы — `__dev/reset {seed:false}` и `PUT __dev/clock {now: "T12:00:00.000"}`.
- **T** — реальная сегодняшняя дата, **D = T+1**, **Y = T−1**.
- Брони в прошлом создаются через `__dev/bookings`.

| ID  | Запрос                                                                                                                                     | Ожидание                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A01 | `GET ?date=D` (две брони, вставлены в обратном порядке)                                                                                    | `200`, отсортированы по `start`, схема `Booking`                                         |
| A02 | `GET` без `date`; `date=abc`; `date=2026-02-30`                                                                                            | `400 BAD_REQUEST`                                                                        |
| A03 | `POST D 10:00–11:00 "Планёрка"`                                                                                                            | `201`, есть `id`, поля совпадают                                                         |
| A04 | `POST`: битый JSON; без `start`; `start="9:00"`; `start="25:00"`; `title: null`; `start: 900`                                              | `400`                                                                                    |
| A05 | `POST D 10:10–11:00`                                                                                                                       | `422`, `fieldErrors.start.code = NOT_ALIGNED`                                            |
| A06 | `POST D 08:45–09:30`; `D 17:30–18:15`                                                                                                      | `422 OUT_OF_WORKING_HOURS` (start; end)                                                  |
| A07 | `POST D 11:00–11:00`; `D 12:00–11:00`                                                                                                      | `422 START_NOT_BEFORE_END`                                                               |
| A08 | `POST D 10:00–10:15`; `D 10:00–12:15`                                                                                                      | `422 TOO_SHORT`; `422 TOO_LONG`                                                          |
| A09 | `POST D 09:00–09:30`; `D 13:00–15:00`; `D 17:30–18:00`                                                                                     | `201` × 3                                                                                |
| A10 | `POST Y 10:00–11:00`                                                                                                                       | `422 PAST_DATE`                                                                          |
| A11 | Clock `T 12:00:00.000`: `POST T 11:45–12:30`; `T 12:00–12:30`; `T 12:15–12:45`. Clock `T 11:59:59.999`: `POST T 12:00–12:30` (после reset) | `422 PAST_TIME`; `422 PAST_TIME`; `201`; `201`                                           |
| A12 | `title`: 101 символ; 100 символов; `"   "`; `"  abc "`                                                                                     | `422 TITLE_TOO_LONG`; `201`; `201` без `title`; `201` с `title: "abc"`                   |
| A13 | Есть `D 10:00–11:00`: `POST` 10:30–11:30; 09:30–10:30; 10:15–10:45; 10:00–11:00; 09:30–11:30                                               | `409 CONFLICT`, `conflicts` содержит 10:00–11:00, нет `fieldErrors`                      |
| A14 | Есть `D 10:00–11:00`: `POST` 11:00–12:00 и 09:00–10:00                                                                                     | `201` (касание)                                                                          |
| A15 | `PATCH` своей 10:00–11:00 → `{end:"11:30"}`                                                                                                | `200` (R7)                                                                               |
| A16 | `PATCH {title:"Новое"}`                                                                                                                    | `200`, время не изменилось                                                               |
| A17 | Есть 10:00–11:00 и 11:30–12:30: `PATCH` первой → `{end:"12:00"}`                                                                           | `409`, в `conflicts` только 11:30–12:30 (своей брони нет)                                |
| A18 | `PATCH /unknown`; `DELETE /unknown`                                                                                                        | `404 NOT_FOUND`                                                                          |
| A19 | `PATCH {date: D+1}`                                                                                                                        | `200`; `GET D` без неё, `GET D+1` с ней                                                  |
| A20 | `PATCH {date: D+1}` в занятый там слот                                                                                                     | `409`                                                                                    |
| A21 | `PATCH {title:""}`                                                                                                                         | `200`, поля `title` нет                                                                  |
| A22 | `PATCH {end:"13:00"}` к 10:00–11:00                                                                                                        | `422 TOO_LONG` (валидируется итог)                                                       |
| A23 | `__dev/bookings`: `T 12:00–13:00` (идёт при clock 12:00), `Y 10:00–11:00`. `PATCH {title}` и `DELETE` каждой                               | `422`, `reason = BOOKING_LOCKED`, нет `fieldErrors`                                      |
| A24 | `PATCH {}` к будущей брони; `PATCH {id:"x", foo:1, title:"A"}`                                                                             | `200` без изменений; `200`, `id` прежний, `foo` нет                                      |
| A25 | `DELETE` существующей → повторный `DELETE`                                                                                                 | `204` → `404`; `GET` её не содержит                                                      |
| A26 | Есть `D 09:00–10:00`: `POST D 08:45–09:30`                                                                                                 | `422 OUT_OF_WORKING_HOURS`, не 409 (маскирование)                                        |
| A27 | `failNext {500, GET, 1}` → `GET __dev/state` → `GET bookings` ×2                                                                           | `200` (dev не расходует флаг) → `500 INTERNAL` → `200`                                   |
| A28 | `failNext {network, ANY, 1}` → `GET`                                                                                                       | curl exit 52/56 (соединение оборвано), следующий запрос `200`                            |
| A29 | `forceConflictNext` → валидный `POST`                                                                                                      | `409`; `GET` содержит «Занято другим сотрудником»                                        |
| A30 | `raceProbability: 1` → `POST`; `PATCH 10:00–11:00 → end 11:30`; `PATCH {title}`; затем `0` → `POST`                                        | `409`; `409` (+ «чужая» 11:00–11:30, пересечений нет); `200` (новой части нет); `201`    |
| A31 | `latencyMs: 1500` → `GET`                                                                                                                  | `time_total ≥ 1.5`; dev-эндпоинты отвечают без задержки                                  |
| A32 | Каждый ответ с ошибкой выше                                                                                                                | Соответствует `ApiErrorBody`; `conflicts` только у 409; `Content-Type: application/json` |
| A33 | `__dev/reset {seed:true}`; `__dev/reset {seed:false}` → `GET`                                                                              | Seed-брони на T и D; `[]` без повторного seed                                            |

### 9.4. Definition of Done для проверки

- Интерактивный проход (слой 1) выполнен по **всем** E-сценариям, кроме E65 (P2).
- В консоли браузера нет ошибок.
- `docs/qa/REPORT.md` и скриншоты закоммичены.
- `lint`, `typecheck`, `test`, `test:api` зелёные. `test:e2e` зелёный в объёме, который реализован в T16–T17 (минимум `@smoke`).
- `@smoke` зелёный против деплоя.
- Найденные баги исправлены, либо описаны в REPORT.md и README с ID сценария.

---

## 10. Сборка, деплой, сдача

- **Скрипты:** `dev`, `build` (`tsc -b && vite build`), `preview`, `test`, `lint`, `typecheck`, `mock:server`, `test:api`, `test:e2e`, `export:chat`.
- **`vercel.json`:**
  - SPA-rewrite `/((?!api/).*)` → `/index.html`. Запросы `/api/*` без MSW отдают понятный 404, а не HTML;
  - `Cache-Control: no-cache` для `/mockServiceWorker.js`.
- **Проверка в T18:** жёсткая перезагрузка (Shift+Reload) на деплое. Страница без контроля Service Worker не должна показывать ошибку «INTERNAL» — MSW должен перерегистрироваться. Результат фиксируется в REPORT.md.
- **Env:** `VITE_USE_MOCKS` (по умолчанию `true`), `VITE_API_BASE_URL` (по умолчанию `''`). Есть `.env.example`.
- **README (кратко, рус.):**
  - как запустить;
  - ссылка на демо;
  - архитектура и схема слоёв;
  - принятые решения со ссылкой на SPEC §1;
  - как воспроизвести 409;
  - что сделано и что нет;
  - **время раздельно: разработка и проверка**;
  - ссылки на `docs/qa/REPORT.md` и `docs/ai-chat.md`.

  Таблицы сценариев в README не дублируются.

- **Переписка с AI** (`npm run export:chat`): `scripts/export-chat.ts` конвертирует JSONL-транскрипты Claude Code из `~/.claude/projects/-home-viqtor-projects-tz/` в `docs/ai-chat.md`.
  - Включаются основная сессия и сессии субагентов (ревью, проверка), в хронологическом порядке.
  - Результаты инструментов сокращаются до 20 строк.
  - E-mail и токены редактируются.

---

## 11. Вне скоупа / что можно добавить потом

Несколько комнат, повторяющиеся брони, drag-to-resize, optimistic updates, синхронизация вкладок в реальном времени (`storage`-событие / SSE), i18n, CI (GitHub Actions с e2e), авторизация, проверка скринридерами.
