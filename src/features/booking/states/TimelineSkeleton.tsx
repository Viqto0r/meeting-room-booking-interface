export function TimelineSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse">
      <div className="relative h-[864px] rounded-xl border border-slate-200 bg-white">
        {[8, 38, 62].map((top) => (
          <div
            key={top}
            className="absolute left-16 right-3 rounded bg-slate-200"
            style={{ top: `${top}%`, height: '9%' }}
          />
        ))}
      </div>
      <output className="sr-only">Загрузка расписания…</output>
    </div>
  )
}
