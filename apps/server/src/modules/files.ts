/**
 * Stored files (signatures and car photos). Content-addressed on disk under FILES_DIR (sha256), one `files` row each.
 * The customer's on-screen signature on a work order prints on the Job Card (D-62).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { asc, eq } from "drizzle-orm";
import { uuidv7 } from "@jc/core";
import { z } from "zod";
import { actorOf, requirePerm } from "../auth/auth";
import { audit, type Actor } from "../audit";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { files, users, workOrderPhotos, workOrders } from "../db/schema";
import { AppError } from "../errors";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_PREFIX = "data:image/jpeg;base64,";

export async function saveFile(db: Db, cfg: Config, actor: Actor, buf: Buffer, mime: string, ext: string) {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const rel = join(sha256.slice(0, 2), `${sha256}.${ext}`);
  await mkdir(join(cfg.filesDir, sha256.slice(0, 2)), { recursive: true });
  await writeFile(join(cfg.filesDir, rel), buf);
  const id = uuidv7();
  await db.insert(files).values({ id, sha256, mime, size: buf.length, path: rel, createdBy: actor.id, deviceId: actor.deviceId ?? null });
  return id;
}

export function fileRoutes(app: FastifyInstance, db: Db, cfg: Config, auth: preHandlerHookHandler) {
  app.post("/work-orders/:id/signature", { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const { dataUrl } = z.object({ dataUrl: z.string().max(600_000).startsWith("data:image/png;base64,") }).parse(req.body);
    const buf = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    if (buf.length < 57 || !buf.subarray(0, 8).equals(PNG)) throw new AppError(422, "bad_signature", "صورة التوقيع غير صالحة. امسح وأعد التوقيع.");
    const [wo] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id));
    if (!wo) throw new AppError(404, "not_found", "أمر الشغل غير موجود.");
    const actor = actorOf(req);
    const fileId = await saveFile(db, cfg, actor, buf, "image/png", "png");
    await db.update(workOrders).set({ signatureFileId: fileId, updatedAt: new Date() }).where(eq(workOrders.id, id));
    await audit(db, actor, "work_order.signature", "work_order", id, null, { fileId });
    reply.status(201);
    return { fileId };
  });

  /** A car photo from the phone camera, already shrunk to about 1600px JPEG on the device. */
  app.post("/work-orders/:id/photos", { preHandler: [auth, requirePerm("workOrder.edit")], bodyLimit: 4_000_000 }, async (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const b = z.object({ dataUrl: z.string().max(3_500_000).startsWith(JPEG_PREFIX), note: z.string().trim().max(200).optional() }).parse(req.body);
    const buf = Buffer.from(b.dataUrl.slice(JPEG_PREFIX.length), "base64");
    if (buf.length < 100 || !buf.subarray(0, 3).equals(JPEG)) throw new AppError(422, "bad_photo", "الصورة مش صالحة. صوّر تاني.");
    const [wo] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id));
    if (!wo) throw new AppError(404, "not_found", "أمر الشغل غير موجود.");
    const actor = actorOf(req);
    const fileId = await saveFile(db, cfg, actor, buf, "image/jpeg", "jpg");
    const photoId = uuidv7();
    await db.insert(workOrderPhotos).values({ id: photoId, workOrderId: id, fileId, note: b.note ?? null, createdBy: actor.id, deviceId: actor.deviceId ?? null });
    await audit(db, actor, "work_order.photo", "work_order", id, null, { photoId, note: b.note ?? null });
    reply.status(201);
    return { id: photoId };
  });

  app.get("/work-orders/:id/photos", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return db.select({ id: workOrderPhotos.id, at: workOrderPhotos.createdAt, note: workOrderPhotos.note, by: users.displayName })
      .from(workOrderPhotos).leftJoin(users, eq(users.id, workOrderPhotos.createdBy)).where(eq(workOrderPhotos.workOrderId, id)).orderBy(asc(workOrderPhotos.createdAt));
  });

  app.get("/photos/:id", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const [row] = await db.select({ f: files }).from(workOrderPhotos).innerJoin(files, eq(files.id, workOrderPhotos.fileId)).where(eq(workOrderPhotos.id, id));
    if (!row) throw new AppError(404, "not_found", "الصورة غير موجودة.");
    const buf = await readFile(join(cfg.filesDir, row.f.path)).catch(() => null);
    if (!buf) throw new AppError(404, "not_found", "ملف الصورة غير موجود على السيرفر.");
    return { dataUrl: `data:${row.f.mime};base64,${buf.toString("base64")}` };
  });

  app.get("/work-orders/:id/signature", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const [row] = await db.select({ f: files }).from(workOrders).innerJoin(files, eq(files.id, workOrders.signatureFileId)).where(eq(workOrders.id, id));
    if (!row) return { dataUrl: null, at: null };
    const buf = await readFile(join(cfg.filesDir, row.f.path)).catch(() => null);
    return { dataUrl: buf ? `data:${row.f.mime};base64,${buf.toString("base64")}` : null, at: row.f.createdAt };
  });
}
