import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TtsRequest = {
  text?: string;
  voice?: string;
  speed?: number;
};

function getTextFromUrl(req: Request) {
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("text") ?? "").trim();
  } catch {
    return "";
  }
}

function getVoiceFromUrl(req: Request) {
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("voice") ?? "").trim();
  } catch {
    return "";
  }
}

function getSpeedFromUrl(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("speed") ?? "").trim();
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ZHIPU_API_KEY is not set" },
      { status: 500 }
    );
  }

  let body: TtsRequest | null = null;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    body = null;
  }

  const text = (body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voice = (body?.voice ?? "").trim();
  const speed = typeof body?.speed === "number" ? body.speed : null;

  return handleTts({ text, apiKey, voice, speed });
}

export async function GET(req: Request) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ZHIPU_API_KEY is not set" },
      { status: 500 }
    );
  }
  const text = getTextFromUrl(req);
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  const voice = getVoiceFromUrl(req);
  const speed = getSpeedFromUrl(req);
  return handleTts({ text, apiKey, voice, speed });
}

async function handleTts({
  text,
  apiKey,
  voice,
  speed
}: {
  text: string;
  apiKey: string;
  voice: string;
  speed: number | null;
}) {
  const model = "glm-tts";
  const chosenVoice = voice || process.env.ZHIPU_TTS_VOICE || "tongtong";
  const chosenSpeed = Number.isFinite(speed ?? NaN)
    ? (speed as number)
    : Number(process.env.ZHIPU_TTS_SPEED ?? "1");

  const upstream = await fetch("https://open.bigmodel.cn/api/paas/v4/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: chosenVoice,
      speed: chosenSpeed,
      response_format: "wav"
    })
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Upstream TTS failed",
        status: upstream.status,
        detail: detail.slice(0, 2000)
      },
      { status: 502 }
    );
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
