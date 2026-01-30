import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TtsRequest = {
  text?: string;
};

function getTextFromUrl(req: Request) {
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("text") ?? "").trim();
  } catch {
    return "";
  }
}

function base64ToBuffer(b64: string) {
  return Buffer.from(b64, "base64");
}

function pcm16MonoToWav(pcm: Buffer, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
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

  return handleTts(text, apiKey);
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
  return handleTts(text, apiKey);
}

async function handleTts(text: string, apiKey: string) {
  const model = process.env.ZHIPU_VOICE_MODEL || "glm-4-voice";

  const prompt = `请用清晰、儿童友好、略慢一点的语速朗读以下词语：${text}`;

  const upstream = await fetch(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      })
    }
  );

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

  const json = (await upstream.json()) as {
    choices?: Array<{
      message?: {
        audio?: { data?: string };
      };
    }>;
  };

  const audioB64 = json.choices?.[0]?.message?.audio?.data;
  if (!audioB64) {
    return NextResponse.json(
      { error: "No audio data in response" },
      { status: 502 }
    );
  }

  const pcm = base64ToBuffer(audioB64);
  const wav = pcm16MonoToWav(pcm, 44100);

  return new NextResponse(wav, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      // GET: allow CDN/browser cache; POST: typically not cached by browsers, but header is harmless.
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
