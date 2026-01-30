import Game from "@/components/Game";

export default function HomePage() {
  return (
    <main className="min-h-screen px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 shadow-soft ring-1 ring-pink-100">
            <span className="text-lg font-bold text-pink-700">识字小公主</span>
            <span className="text-sm text-pink-600/80">（5 题一组）</span>
          </div>
          <div className="text-xs font-semibold text-pink-700/70 md:text-sm">
            iPad 横屏更宽；手机竖屏更紧凑
          </div>
        </header>

        <Game />

        <footer className="mt-5 text-center text-xs text-pink-700/70 md:mt-8">
          轻轻点选答案；不会也没关系，慢慢来。
        </footer>
      </div>
    </main>
  );
}
