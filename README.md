# 识字小公主（粉色识字网页游戏）

给 5 岁女孩的识字小游戏：随机出现小学常见词汇（显示拼音 + 横线空格），自动朗读；下方 A/B/C/D 选择；每 5 题为一组，完成后有庆贺仪式。

## 功能

- 每题显示：拼音 + 横线空格（不直接显示汉字），点击选项作答
- A/B/C/D 四选一（当前默认按屏幕显示为 2×2，更适合手机竖屏）
- 5 题一组：完成有彩带庆祝与提示音
- 错题巩固：答错会记录到本地（localStorage），后续出题会更容易再出现，答对会逐步减少出现频率
- 词库：1000 个适合 5 岁的日常词汇（家庭/幼儿园/礼貌/卫生/食物/玩具/动物/天气/出行/颜色大小等）
- 语音：优先云端（智谱 GLM-TTS），失败则静音（可通过点击“再听一遍”触发播放手势）

## 本地运行

```bash
npm install
npm run dev
```

打开：`http://localhost:3000`

## 词库与错题机制

- 词库由服务端接口提供：`GET /api/words`（带长期缓存），避免把 1000 词打进前端包导致首屏变慢。
- 错题记录存于浏览器 `localStorage`（key：`literacy.mistakes.v2`），按“答错 +1、答对 -1”的方式逐步巩固。

## 语音（优先云端，失败静音）

- 云端：智谱 **GLM-TTS**（通过 `src/app/api/tts/route.ts` 走服务端调用，不暴露 Key）
- 本地兜底：浏览器自带 `SpeechSynthesis`（目前默认不自动使用，避免“听起来不像云端”的体验）

### 语音配置

1. 复制 `.env.example` 为 `.env.local`
2. 填入 `ZHIPU_API_KEY=...`
3. （可选）设置 `ZHIPU_TTS_VOICE` / `ZHIPU_TTS_SPEED`（默认音色：`tongtong`）

### iPad / 微信内置浏览器注意

在 iPad Safari / 微信内置浏览器中，音频往往需要用户手势解锁：第一次请点一次“开始朗读”，后续如果出现“云端有但没声音”，点“再听一遍”即可。

## 部署到 Vercel（建议）

1. 把代码推到 GitHub。
2. 在 Vercel 新建项目，选择该 GitHub 仓库，Framework 选 Next.js（一般会自动识别）。
3. 部署成功后，在 Vercel 项目里添加自定义域名（你的 Cloudflare 域名）。
4. 在 Vercel 项目 Settings → Environment Variables 配置 `ZHIPU_API_KEY`。
   - 可选：`ZHIPU_TTS_VOICE`、`ZHIPU_TTS_SPEED`

## Cloudflare 域名绑定（常用做法）

- 在 Cloudflare DNS 里给域名添加记录：
  - `CNAME`：`www` -> Vercel 给的域名（例如 `cname.vercel-dns.com` 或你的项目域名）
  - 或按 Vercel 的提示添加 `A` / `CNAME` 记录
- 回到 Vercel 完成校验即可。

## 安全提示

- 不要把真实 `ZHIPU_API_KEY` 写进 `.env.example` 或提交到 GitHub。
- 真实 Key 只放 `.env.local`（本地）或 Vercel 环境变量（线上）。

## 常见问题

- 手机竖屏看不下 4 个选项：已针对小屏做了默认 2×2 选项布局与间距/字号压缩；仍不够时可直接向下滑动（页面允许滚动）。
- 云端很慢：正常现象；为了保证“真的是云端”，当前默认会更愿意等云端而不是自动切回本地兜底。

## 代码位置速查

- 词库：`src/lib/wordbank.ts`
- 词库接口：`src/app/api/words/route.ts`
- 游戏逻辑：`src/components/Game.tsx`
- 语音接口：`src/app/api/tts/route.ts`
- 语音播放（前端）：`src/lib/tts.ts`
