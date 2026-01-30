import Game from "@/components/Game";

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 shadow-soft ring-1 ring-pink-100">
            <span className="text-lg font-bold text-pink-700">识字小公主</span>
            <span className="text-sm text-pink-600/80">（5 题一组）</span>
          </div>
        </header>
        <Game />
        <footer className="mt-8 text-center text-xs text-pink-700/70">
          轻轻点选答案；不会也没关系，慢慢来。
        </footer>
      </div>
    </main>
  );
}

