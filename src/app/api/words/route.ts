import { NextResponse } from "next/server";
import { WORD_BANK } from "@/lib/wordbank";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { words: WORD_BANK, count: WORD_BANK.length },
    {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    }
  );
}

