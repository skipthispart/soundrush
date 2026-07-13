import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

    const [items, total] = await Promise.all([
      db.download.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.download.count(),
    ]);

    return NextResponse.json({ ok: true, items, total });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "خطای ناشناخته." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      await db.download.deleteMany({ where: { id } });
    } else {
      await db.download.deleteMany({});
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "خطای ناشناخته." },
      { status: 500 },
    );
  }
}
