# 识字小公主（粉色识字网页游戏）

给 5 岁女孩的识字小游戏：随机出现小学常见词汇（显示拼音 + 横线空格），自动朗读；下方 A/B/C/D 选择；每 5 题为一组，完成后有庆贺仪式。

## 本地运行

```bash
npm install
npm run dev
```

打开：`http://localhost:3000`

## 语音（优先云端，失败本地兜底）

- 云端：智谱 `glm-4-voice`（通过 `src/app/api/tts/route.ts` 走服务端调用，不暴露 Key）
- 兜底：浏览器自带 `SpeechSynthesis`（云端失败/未配置时自动回退）

配置方式：

1. 复制 `.env.example` 为 `.env.local`
2. 填入 `ZHIPU_API_KEY=...`

## 部署到 Vercel（建议）

1. 把代码推到 GitHub（你稍后给我仓库链接，我再帮你接上 remote/推送）。
2. 在 Vercel 新建项目，选择该 GitHub 仓库，Framework 选 Next.js（一般会自动识别）。
3. 部署成功后，在 Vercel 项目里添加自定义域名（你的 Cloudflare 域名）。
4. 在 Vercel 项目 Settings → Environment Variables 配置 `ZHIPU_API_KEY`（以及可选的 `ZHIPU_VOICE_MODEL`）。

## Cloudflare 域名绑定（常用做法）

- 在 Cloudflare DNS 里给域名添加记录：
  - `CNAME`：`www` -> Vercel 给的域名（例如 `cname.vercel-dns.com` 或你的项目域名）
  - 或按 Vercel 的提示添加 `A` / `CNAME` 记录
- 回到 Vercel 完成校验即可。
