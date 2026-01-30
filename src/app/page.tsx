import Game from "@/components/Game";

export default function HomePage() {
  return (
    <main className="min-h-[100svh] px-3 py-3 md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col md:min-h-[calc(100svh-3rem)]">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3 md:mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 shadow-soft ring-1 ring-pink-100">
            <span className="text-lg font-bold text-pink-700">识字小公主</span>
            <span className="text-sm text-pink-600/80">（5 题一组）</span>
          </div>
          <div className="text-xs font-semibold text-pink-700/70 md:text-sm">
            iPad 横屏更宽；手机竖屏更紧凑
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <Game />
        </div>

        <footer className="mt-5 text-center text-xs text-pink-700/70 md:mt-8">
          轻轻点选答案；不会也没关系，慢慢来。
        </footer>
      </div>
    </main>
  );
}
