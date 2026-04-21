export default function BodyshopLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="h-7 w-44 bg-slate-200 rounded-lg" />
          <div className="h-4 w-64 bg-slate-100 rounded-lg mt-2" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-64 bg-slate-100 rounded-xl" />
          <div className="h-10 w-28 bg-blue-100 rounded-xl" />
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <div className="h-5 w-24 bg-slate-100 rounded" />
              <div className="h-5 w-20 bg-slate-50 rounded" />
              <div className="h-5 flex-1 bg-slate-50 rounded" />
              <div className="h-5 w-28 bg-slate-100 rounded" />
              <div className="h-7 w-20 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
