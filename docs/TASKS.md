# План задач

Спецификация: [SPEC.md](./SPEC.md) v1.1. Таймбокс задания — 4–6 ч. Журнал ревью — [REVIEW.md](./REVIEW.md).

**Приоритеты:**

- **P0** — без этого не сдаём.
- **P1** — ожидается проверяющим.
- **P2** — если останется время; иначе описываем в README.

Оценки даны в рабочем времени с AI-ассистентом. Фактическое время фиксируется по каждой задаче отдельно — разработка и проверка (для README).

| ID  | Задача                                                                                       | Пр.                            | Оценка | Зависит от |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------ | ------ | ---------- |
| T01 | Инициализация проекта                                                                        | P0                             | 25 м   | —          |
| T02 | Доменный слой + unit-тесты                                                                   | P0                             | 55 м   | T01        |
| T03 | API-клиент и ошибки                                                                          | P0                             | 20 м   | T02        |
| T04 | Ядро mock-сервера: storage, repo, seed, handlers, симуляция, dev-эндпоинты, запуск MSW       | P0                             | 60 м   | T02        |
| T05 | Node mock-сервер (`@msw/serve`)                                                              | P0                             | 20 м   | T04        |
| T06 | Проверка API через curl (A01–A33) + исправления                                              | P0                             | 35 м   | T05        |
| T07 | Слой запросов (TanStack Query)                                                               | P0                             | 15 м   | T03        |
| T08 | Каркас страницы, DateNavigator, состояния, BookingPanel                                      | P0                             | 35 м   | T07        |
| T09 | Таймлайн                                                                                     | P0                             | 45 м   | T08        |
| T10 | Форма: поля, валидация, отправка, ошибки, 409                                                | P0                             | 80 м   | T08        |
| T11 | Удаление, ConfirmDiscardDialog, просмотр                                                     | P0                             | 25 м   | T10        |
| T12 | DevPanel UI                                                                                  | P0                             | 20 м   | T04, T08   |
| T13 | Интеграционные тесты Vitest                                                                  | P0 (сц. 2, 3) / P1 (остальные) | 35 м   | T10–T11    |
| T14 | Проход по доступности и адаптивности                                                         | P1                             | 20 м   | T09–T12    |
| T15 | **Интерактивная проверка UI агентом через Playwright** + скриншоты + REPORT.md + исправления | P0                             | 150 м  | T09–T12    |
| T16 | E2E-автотесты `@smoke`                                                                       | P0                             | 30 м   | T15        |
| T17 | E2E-автотесты: остальные сценарии                                                            | P1                             | 60 м   | T16        |
| T18 | Деплой, README, экспорт переписки, smoke против деплоя                                       | P0                             | 35 м   | T15, T16   |
| T19 | UI фиксации времени в DevPanel                                                               | P2                             | 10 м   | T12        |
| T20 | `api-parity.spec.ts` (E65)                                                                   | P2                             | 20 м   | T16        |

**Итого:** P0 ≈ 11.3 ч, P0+P1 ≈ 12.7 ч, всё ≈ 13.2 ч.
Из P0 около 4 ч — проверка (T06, T15, T16), обязательная по решениям D15/D16. Сама разработка P0 ≈ 7.3 ч.

**Порядок выполнения:**
T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T18 → T17 → T19/T20.
T06 стоит сразу после mock-сервера, до UI: ошибки контракта ловятся до того, как на них начнёт опираться интерфейс.

**Контрольные точки:**

- **КТ1, после T12.** Если на разработку ушло больше 6 ч:
  - T13 урезается до сценариев 2 и 3;
  - T14 сводится к чек-листу внутри T15;
  - T17, T19, T20 переходят в «не сделано».
- **КТ2, перед T18.** На деплой и README всегда резервируется 45 минут. Если время на исходе, T15 завершается с текущим REPORT.md: оставшиеся сценарии отмечаются «не проверено», в README пишется честно.
- Порядок урезания: T20 → T19 → T17 → T14 → T13 (до сц. 2, 3). T06, T15, T16 и T18 не урезаются.

---

## T01. Инициализация · P0

- Vite (react-ts), `git init` (remote `origin` уже задан), `.gitignore` (в том числе `playwright-report/`, `test-results/`).
- TS: `strict`, `noUncheckedIndexedAccess`, alias `@/`.
- Tailwind. ESLint: typescript-eslint, react-hooks, jsx-a11y, а также `no-restricted-imports` для `mocks/**` (SPEC §6). Prettier.
- Зависимости (версии фиксируются):
  - `@tanstack/react-query@5`, `react-hook-form`, `@hookform/resolvers`, `zod`;
  - `@radix-ui/react-alert-dialog`, `sonner`, `lucide-react`;
  - `msw@3`, `@msw/serve` (+ `express`, если понадобится по SPEC §5.5).
- Dev-зависимости: `vitest`, `@testing-library/{react,user-event,jest-dom}`, `jsdom`, `@playwright/test`, `@axe-core/playwright`, `tsx`.
- `npx msw init public/`, `npx playwright install chromium webkit`.
- Проверить наличие `jq` и `curl`.

**Готово, когда:** `dev`, `build`, `test`, `lint`, `typecheck` проходят на пустом приложении, сделан первый коммит.

## T02. Доменный слой · P0

Файлы: `src/domain/*`, `src/shared/clock.ts`.

- `time.ts`: `toMinutes`, `fromMinutes`, `formatLocalDate`, `addDays`, `isValidDateString`, `isValidTimeString`, `startDateTime`, `formatDuration`.
- `rules.ts`: всё из SPEC §3 — порядок, одна ошибка на target, маскирование R5, строгое `>` в R6b, `canStartAt` с причиной `short`, `getDefaultEnd`, `getDayAvailability`.
- `messages.ts`: тексты нарушений (формат конфликтов — SPEC §3, R5).
- `createClock(getOverride)`.
- Unit-тесты на **все** граничные случаи SPEC §3.

**Готово, когда:** тесты зелёные, а `grep -nE "Date\.now|new Date\(\)" src/domain` пуст.

## T03. API-клиент · P0

Файлы: `src/api/{errors,http,schemas,bookingsApi,ApiProvider}.ts(x)`.

- `ApiError` (`status`, `code`, `reason`, `fieldErrors`, `conflicts`).
- URL через `new URL(base + path, location.origin)`.
- zod-разбор ответов. `TypeError` → `NETWORK`.
- `BookingsApi` + `httpBookingsApi` + `ApiProvider`.

**Готово, когда:** unit-тест `http.ts` на разбор ошибки 409, на `NETWORK` и на HTML вместо JSON проходит; ESLint не находит импорта `mocks` в `api/`.

## T04. Ядро mock-сервера · P0

Файлы: `src/mocks/{storage,store,seed,simulation,handlers,devHandlers,browser,server}.ts`, `src/main.tsx`.

- `KeyValueStorage` (web / memory), `createRepository`, `createSimulation`, `createHandlers({repo, sim, clock})` — явное внедрение (SPEC §5.1).
- Seed, только если ключа нет.
- Handlers по шагам SPEC §5.2. Wildcard-пути, `requestLog`.
- Симуляция SPEC §5.3:
  - latency;
  - `failNext` с методом и счётчиком;
  - `forceConflictNext`;
  - гонка (на PATCH — только на новую часть интервала).
- Dev-эндпоинты SPEC §5.6: `reset`, `bookings`, `simulation`, `clock`, `state`. Без логирования, задержки и расхода флагов.
- `main.tsx`: dynamic import, `worker.start`, `window.__mswReady`.
- `handlers.test.ts`: по одному тесту на каждый статус и `reason` + инвариант «нет пересечений» после гонки (POST и PATCH).

**Готово, когда:** `handlers.test.ts` зелёный и приложение открывается с seed-данными в `vite dev`.

## T05. Node mock-сервер · P0

Файл: `src/mocks/node-server.ts`, скрипт `mock:server`.

- `createServer(...handlers)` из `@msw/serve`, memory-хранилища, порт `MOCK_PORT`.
- Сетевая ошибка → обрыв сокета (SPEC §5.5). Если standalone-режим этого не позволяет, перейти на `@msw/serve/express` и зафиксировать выбор в README.

**Готово, когда:** `curl localhost:3001/api/bookings?date=…` отвечает JSON, а `PUT /api/__dev/clock` меняет результат `PAST_TIME`.

## T06. Проверка API через curl · P0

Файл: `scripts/api-check.sh`, скрипт `test:api`.

- Кейсы A01–A33 (SPEC §9.3): даты T/D/Y, clock через `__dev/clock`, прошедшие брони через `__dev/bookings`.
- Скрипт сам поднимает и гасит сервер (`trap`). При несовпадении печатает запрос и ответ, выходит с кодом ≠ 0. В конце — сводка.
- Найденные расхождения исправляются в handlers и домене, затем полный прогон повторяется.

**Готово, когда:** `npm run test:api` даёт «33/33 passed». Вывод сохранён в `docs/qa/api-check.log`.

## T07. Слой запросов · P0

Файлы: `src/api/queries.ts`, `src/app/queryClient.ts`.

- По SPEC §4.4: `keepPrevious` только для таймлайна, `onSettled` возвращает промис инвалидации, у update в переменных есть `oldDate`.
- `refetchOnWindowFocus`: `'always'` / `false` по настройке из DevPanel.

**Готово, когда:** интеграционный тест подтверждает, что после ошибочной мутации (409) выполнен GET нужной даты.

## T08. Каркас страницы и состояния · P0

Файлы: `app/*`, `features/booking/{BookingPage,DateNavigator,BookingPanel}.tsx`, `states/*`, `shared/{useSelectedDate,useNow}.ts`, `shared/ui/*`.

- Раскладка по SPEC §7.1, включая плейсхолдер панели на десктопе.
- DateNavigator по SPEC §7.2: подпись «Показать дату», `?date=`, закрытие панели с guard при смене даты.
- Все состояния SPEC §7.4.
- Состояние панели: `closed | create(prefill) | edit(booking) | view(booking)`.

**Готово, когда:** через `failNext` и latency в `vite dev` видны скелетон, пусто, ошибка и фоновое обновление. Скриншоты этих состояний сняты для самопроверки.

## T09. Таймлайн · P0

Файлы: `DayTimeline.tsx`, `TimelineBooking.tsx`.

- Геометрия и компактные блоки по SPEC §7.3.
- `<ol>` из `<button>`, `aria-label`.
- Заблокированные брони открывают просмотр.
- Штриховка прошлого и линия «сейчас».
- Слой кликов через `canStartAt` с `title`-причиной.
- «Новая бронь» и CTA через `getDayAvailability` с `aria-disabled` и причиной.
- Подсветка `conflicts`.

**Готово, когда:** на скриншотах брони 15 / 30 / 45 / 120 мин читаемы, соседние разделены, а 30-минутный блок ≥ 44px.

## T10. Форма · P0

Файлы: `BookingForm.tsx`, `useBookingForm.ts`, `formSchema.ts`, `messages.ts`.

- Режимы create / edit и связь с датой страницы (SPEC §7.5.1).
- Поля (SPEC §7.5.2): optgroup, причины disabled, подписи длительности, fieldset «Время», подсказка свободных окон.
- Начальные значения и автокоррекция (SPEC §7.5.3).
- Валидация (SPEC §7.5.4):
  - resolver = zod + `validateBookingInput`;
  - `serverErrors` отдельно;
  - ревалидация только затронутых полей;
  - без placeholder-данных;
  - проверка блокировки на тике `useNow`.
- Отправка и успех (SPEC §7.5.5): `<fieldset disabled>`, цепочка фокуса, toast.
- Ошибки по матрице SPEC §7.6, включая 409: фокус, «Обновляем…» → «обновлён» / «не удалось», ссылка «Показать на таймлайне» на мобильных. Плюс 404 → «Создать новую с этими данными».

**Готово, когда:** E10, E14, E19–E25, E30–E37, E50, E55–E57 пройдены в браузере (предварительно, в рамках самопроверки). Окончательно — в T15.

## T11. Удаление, отмена изменений, просмотр · P0

Файлы: `DeleteBookingDialog.tsx`, `ConfirmDiscardDialog.tsx`, `BookingDetails.tsx`.

- Удаление по SPEC §7.7.
- Guard на все действия из SPEC §7.5.6 + `beforeunload`.
- `BookingDetails` по SPEC §7.5.7.

**Готово, когда:** E22, E35, E40–E43 пройдены в браузере.

## T12. DevPanel UI · P0

Файлы: `dev/DevPanel.tsx`, `dev/devApi.ts`.

- Контролы SPEC §7.8 через dev-эндпоинты. Тумблер обновления при фокусе.
- Инструкция по воспроизведению 409 тремя способами.
- Рендер только при `VITE_USE_MOCKS`.

**Готово, когда:** каждый контрол даёт ожидаемый эффект в `vite preview` (E52, E53).

## T13. Интеграционные тесты Vitest · P0 (сц. 2, 3) / P1

Файлы: `src/test/*`, `features/booking/*.test.tsx`.

- Сценарии 1–8 из SPEC §9.1.
- `clock` через провайдер, `latencyMs: 0`, свежие memory-хранилища на каждый тест.

**Готово, когда:** `npm run test` зелёный, сценарии 2 и 3 — обязательно.

## T14. Доступность и адаптивность · P1

- Чек-лист SPEC §8.
- axe на всех состояниях, проход клавиатурой.
- Ширины 320 / 375 / 768 / 1280.

**Готово, когда:** E61–E64 пройдены интерактивно. При урезании пункт выполняется внутри T15.

## T15. Интерактивная проверка UI через Playwright · P0

Агент **сам** проходит приложение в браузере (`vite preview`) по **всем** E-сценариям SPEC §9.2, кроме E65.

- Действия:
  - клики, ввод, DevPanel, вторая вкладка;
  - `page.clock.setFixedTime` для сценариев со временем;
  - `__dev/*` для подготовки данных.
- Скриншоты по таблице SPEC §9.2 — **каждый просматривается**, вёрстка и тексты оцениваются.
- Сбор `console` и `pageerror`.
- Каждый баг исправляется, затем сценарий проходится повторно со свежим скриншотом.
- Итог — `docs/qa/REPORT.md`:
  - таблица ID → статус → скриншот → комментарий;
  - список багов (найден → исправлен / не исправлен);
  - время прохода.

**Готово, когда:** выполнены условия SPEC §9.4 для слоя 1.

## T16. E2E `@smoke` · P0

Файлы: `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/smoke.spec.ts`, скрипт `test:e2e`.

- Конфигурация и фикстура по SPEC §9.2: `serviceWorkers: 'allow'`, порядок `goto → __mswReady → __dev/* → reload`, `requestLog`.
- Сценарии E01, E10, E41, E50, E53, E63. Проекты desktop / mobile chromium + webkit.

**Готово, когда:** `npm run test:e2e -- --grep @smoke` зелёный локально.

## T17. E2E — остальные сценарии · P1

- Остальные сценарии SPEC §9.2 (кроме E65) оформляются тестами в `e2e/*.spec.ts` по группам.

**Готово, когда:** весь реализованный набор зелёный. Нереализованные ID перечислены в REPORT.md.

## T18. Деплой и сдача · P0

- `vercel.json` по SPEC §10. Деплой — через импорт репозитория в Vercel (делает пользователь) или через CLI после `vercel login`.
- Проверка жёсткой перезагрузки на деплое.
- `@smoke` против деплоя.
- README по SPEC §10, время раздельно: разработка и проверка.
- `npm run export:chat` → `docs/ai-chat.md` (в том числе транскрипты субагентов ревью и проверки). Просмотреть результат на предмет приватных данных.
- Финальный прогон `lint`, `typecheck`, `test`, `test:api`, `build`.
- Push в `origin`.

**Готово, когда:** демо открывается по ссылке, `@smoke` против него зелёный, README и `ai-chat.md` в репозитории.

## T19. UI фиксации времени · P2

- В DevPanel: «Зафиксировать время: сегодня HH:mm» / «Сбросить». Работает через `PUT __dev/clock`; `useNow` подписывается на изменения.

**Готово, когда:** фиксация 10:07 в DevPanel воспроизводит E15 без Playwright.

## T20. api-parity (E65) · P2

- `e2e/api-parity.spec.ts` по SPEC §9.2, E65.

**Готово, когда:** тест зелёный при одновременно запущенных `preview` и `mock:server`.
