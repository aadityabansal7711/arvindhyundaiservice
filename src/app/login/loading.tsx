export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-md px-4 py-6 sm:p-8">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl animate-pulse">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600/30 rounded-2xl mb-4" />
            <div className="h-7 w-40 bg-white/10 rounded-lg" />
            <div className="h-4 w-48 bg-white/5 rounded-lg mt-2" />
          </div>
          <div className="space-y-6">
            <div className="h-12 bg-white/5 rounded-xl" />
            <div className="h-12 bg-white/5 rounded-xl" />
            <div className="h-12 bg-blue-600/30 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
