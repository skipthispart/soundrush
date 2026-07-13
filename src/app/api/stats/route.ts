import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [total, completed, processing, failed, byPlatform] = await Promise.all([
      db.download.count(),
      db.download.count({ where: { status: "completed" } }),
      db.download.count({ where: { status: "processing" } }),
      db.download.count({ where: { status: "failed" } }),
      db.download.groupBy({
        by: ["platform"],
        _count: true,
        orderBy: { _count: { platform: "desc" } },
      }),
    ]);

    const totalBytesAgg = await db.download.aggregate({
      _sum: { fileSize: true },
      where: { status: "completed" },
    });

    return NextResponse.json({
      ok: true,
      stats: {
        total,
        completed,
        processing,
        failed,
        totalBytes: totalBytesAgg._sum.fileSize ?? 0,
        byPlatform: byPlatform.map((b) => ({ platform: b.platform, count: b._count })),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "خطای ناشناخته." },
      { status: 500 },
    );
  }
}
