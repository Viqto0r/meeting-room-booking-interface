import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { setRefetchOnFocus } from '@/app/queryClient'
import { formatLocalDate } from '@/domain/time'
import { CLOCK_CHANGED_EVENT } from '@/shared/clockOverride'
import { useNow } from '@/shared/useNow'
import { Button } from '@/shared/ui/Button'
import { readRefetchOnFocus, writeRefetchOnFocus } from '@/shared/refetchSetting'
import {
  devApi,
  type DevState,
  type FailKind,
  type FailMethod,
  type SimulationState,
} from './devApi'

const LATENCIES = [0, 400, 1500] as const
const RACES = [0, 0.25, 0.5, 1] as const
const METHODS: FailMethod[] = ['ANY', 'GET', 'POST', 'PATCH', 'DELETE']

/** Collapsible demo controls for the mock server (SPEC §7.8). Rendered only with mocks on. */
export function DevPanel() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<DevState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refetchOnFocus, setRefetchOnFocusState] = useState(readRefetchOnFocus)
  const [failMethod, setFailMethod] = useState<FailMethod>('POST')
  const [failCount, setFailCount] = useState(1)
  const [pinTime, setPinTime] = useState('10:07')
  const queryClient = useQueryClient()
  const now = useNow()
  const panelId = useId()

  const refresh = useCallback(async () => {
    try {
      setState(await devApi.getState())
      setError(null)
    } catch {
      setError('Mock-сервер недоступен')
    }
  }, [])

  // The one-shot flags are spent by the app itself, so the view is polled while open.
  useEffect(() => {
    if (!open) return
    const first = setTimeout(() => void refresh(), 0)
    const id = setInterval(() => void refresh(), 1500)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [open, refresh])

  const sim = state?.simulation
  const update = async (patch: Partial<SimulationState>) => {
    // optimistic: controls are bound to this state, so they respond at once
    setState((prev) => (prev ? { ...prev, simulation: { ...prev.simulation, ...patch } } : prev))
    try {
      const next = await devApi.setSimulation(patch)
      setState((prev) => (prev ? { ...prev, simulation: next } : prev))
    } catch {
      setError('Не удалось применить настройку')
    }
  }

  const toggleRefetch = (enabled: boolean) => {
    setRefetchOnFocusState(enabled)
    writeRefetchOnFocus(enabled)
    setRefetchOnFocus(queryClient, enabled)
  }

  const reset = async () => {
    try {
      await devApi.reset(true)
      await queryClient.invalidateQueries()
      await refresh()
    } catch {
      setError('Не удалось сбросить данные')
    }
  }

  const pinClock = async (pinned: string | null) => {
    try {
      await devApi.setClock(pinned)
      window.dispatchEvent(new Event(CLOCK_CHANGED_EVENT))
      await queryClient.invalidateQueries()
      await refresh()
    } catch {
      setError('Не удалось изменить время')
    }
  }

  const fail = (kind: FailKind) =>
    update({ failNext: { kind, method: failMethod, count: failCount } })

  return (
    <section aria-label="Панель симуляции" className="mx-auto mt-6 max-w-6xl px-4 pb-8">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium shadow-sm"
      >
        {open ? (
          <ChevronDown aria-hidden="true" size={16} />
        ) : (
          <ChevronRight aria-hidden="true" size={16} />
        )}
        Панель симуляции
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm"
      >
        <p className="text-slate-700">Только для демонстрации: управляет mock-сервером</p>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="font-medium">Задержка ответов</legend>
          <div className="flex flex-wrap gap-2">
            {LATENCIES.map((ms) => (
              <label
                key={ms}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3"
              >
                <input
                  type="radio"
                  name="latency"
                  disabled={!sim}
                  checked={sim?.latencyMs === ms}
                  onChange={() => void update({ latencyMs: ms })}
                />
                {ms} мс
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-medium">Вероятность «чужой» брони при сохранении</legend>
          <div className="flex flex-wrap gap-2">
            {RACES.map((p) => (
              <label
                key={p}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3"
              >
                <input
                  type="radio"
                  name="race"
                  disabled={!sim}
                  checked={sim?.raceProbability === p}
                  onChange={() => void update({ raceProbability: p })}
                />
                {Math.round(p * 100)}%
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              disabled={!sim}
              checked={sim?.forceConflictNext ?? false}
              onChange={(e) => void update({ forceConflictNext: e.target.checked })}
            />
            Следующая мутация вернёт 409
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="font-medium">Следующий запрос завершится ошибкой</legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block">Метод</span>
              <select
                value={failMethod}
                onChange={(e) => {
                  const method = e.target.value as FailMethod
                  setFailMethod(method)
                  // a GET is retried once by the client, so two failures are needed to see an error
                  setFailCount(method === 'GET' ? 2 : 1)
                }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2"
              >
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block">Сколько запросов</span>
              <input
                type="number"
                min={1}
                max={10}
                value={failCount}
                onChange={(e) => setFailCount(Math.max(1, Number(e.target.value) || 1))}
                className="min-h-11 w-24 rounded-lg border border-slate-300 bg-white px-2"
              />
            </label>
            <Button onClick={() => void fail('500')}>Ошибка 500</Button>
            <Button onClick={() => void fail('network')}>Сетевая ошибка</Button>
            <Button onClick={() => void update({ failNext: null })}>Сбросить</Button>
          </div>
          <p className="text-slate-700" data-testid="fail-next-state">
            {sim?.failNext
              ? `Запланировано: ${sim.failNext.kind === '500' ? '500' : 'сетевая ошибка'}, ${sim.failNext.method}, осталось ${sim.failNext.count}`
              : 'Не запланировано'}
          </p>
        </fieldset>

        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={refetchOnFocus}
            onChange={(e) => toggleRefetch(e.target.checked)}
          />
          Обновлять при возврате на вкладку
        </label>

        <fieldset className="space-y-2">
          <legend className="font-medium">Подмена текущего времени</legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block">Зафиксировать время: сегодня</span>
              <input
                type="time"
                value={pinTime}
                onChange={(e) => setPinTime(e.target.value)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2"
              />
            </label>
            <Button
              onClick={() => {
                const today = formatLocalDate(now)
                if (pinTime) void pinClock(`${today}T${pinTime}:00.000`)
              }}
            >
              Зафиксировать
            </Button>
            <Button onClick={() => void pinClock(null)}>Сбросить время</Button>
          </div>
          <p className="text-slate-700" data-testid="clock-state">
            {state?.now ? `Время зафиксировано: ${state.now}` : 'Время системное'}
          </p>
        </fieldset>

        <div>
          <Button variant="danger" onClick={() => void reset()}>
            Сбросить данные
          </Button>
        </div>

        <div className="space-y-1 border-t border-slate-200 pt-3 text-slate-800">
          <h3 className="font-medium">Как воспроизвести 409</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              «Вероятность чужой брони» — 100%: любое сохранение вернёт 409, а чужая бронь появится
              на таймлайне.
            </li>
            <li>Включите «Следующая мутация вернёт 409» и отправьте форму.</li>
            <li>
              Выключите «Обновлять при возврате на вкладку», откройте приложение во второй вкладке,
              создайте там бронь на то же время и отправьте форму в первой.
            </li>
          </ol>
        </div>
      </div>
    </section>
  )
}
