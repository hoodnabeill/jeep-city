/** Items with grade variants, stock levels, movements, packages. Cost and profit are Admin-only (D-20). */
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { can, searchKey, uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { itemCategories, items, itemVariants, packageLines, servicePackages, stockLevels, stockMovements, users } from "../db/schema";
import { AppError, notFound } from "../errors";
import { move } from "./stock";
import { Id, int } from "../http";

const VariantIn = z.object({
  id: z.uuid().optional(),
  grade: z.enum(["original", "copy", "used"]).nullable().default(null),
  sellPricePt: int.nonnegative(),
  barcode: z.string().trim().max(64).nullable().optional(),
  minQtyMilli: int.nonnegative().default(0),
  active: z.boolean().default(true),
  /** opening stock when the variant is created (import / first setup) */
  openingQtyMilli: int.nonnegative().optional(),
  openingCostPt: int.nonnegative().optional(),
});
/** On PATCH an omitted variant field means "keep it"; the creation defaults would silently reset grade, minimum and active. */
const VariantPatch = VariantIn.extend({ grade: VariantIn.shape.grade.removeDefault().optional(), minQtyMilli: int.nonnegative().optional(), active: z.boolean().optional() });
const ItemIn = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().min(1).max(32),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).nullable().optional(),
  type: z.enum(["part", "oil", "material", "labor", "paint"]),
  categoryId: z.uuid().nullable().optional(),
  unit: z.string().trim().min(1).max(20),
  location: z.string().trim().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  trackStock: z.boolean().optional(),
  active: z.boolean().default(true),
  variants: z.array(VariantIn).min(1).max(5),
});

type VariantRow = typeof itemVariants.$inferSelect & { qtyMilli: number; avgCostPt?: number };

/** Items + their variants + on-hand; cost only when the caller may see it. */
export async function loadItems(db: Db, role: "admin" | "engineer", where?: ReturnType<typeof and>) {
  const its = await db.select().from(items).where(and(isNull(items.archivedAt), where)).orderBy(items.code).limit(500);
  if (!its.length) return [];
  const vs = await db.select({ v: itemVariants, qtyMilli: stockLevels.qtyMilli, avgCostPt: stockLevels.avgCostPt })
    .from(itemVariants).leftJoin(stockLevels, eq(stockLevels.variantId, itemVariants.id))
    .where(and(inArray(itemVariants.itemId, its.map((i) => i.id)), isNull(itemVariants.archivedAt)));
  const showCost = can(role, "cost.view");
  return its.map((i) => ({
    ...i,
    variants: vs.filter((r) => r.v.itemId === i.id).map((r): VariantRow => ({
      ...r.v, qtyMilli: r.qtyMilli ?? 0, ...(showCost ? { avgCostPt: r.avgCostPt ?? 0 } : {}),
    })),
  }));
}

export function itemRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const view = [auth, requirePerm("item.view")];
  const manage = [auth, requirePerm("item.manage")];

  app.get("/items", { preHandler: view }, async (req) => {
    const q = z.object({ q: z.string().max(80).optional(), type: z.enum(["part", "oil", "material", "labor", "paint"]).optional(), low: z.enum(["1", "true", "0", "false"]).optional() }).parse(req.query);
    const key = q.q ? searchKey(q.q) : "";
    let list = await loadItems(db, actorOf(req).role, and(
      q.type ? eq(items.type, q.type) : undefined,
      key ? or(ilike(items.nameKey, `%${key}%`), ilike(items.code, `%${q.q!.trim()}%`), ilike(items.nameEn, `%${q.q!.trim()}%`)) : undefined,
    ));
    if (key && !list.length) {
      // A scanner sends the full barcode: resolve it to its item.
      const [v] = await db.select({ itemId: itemVariants.itemId }).from(itemVariants).where(eq(itemVariants.barcode, q.q!.trim()));
      if (v) list = await loadItems(db, actorOf(req).role, eq(items.id, v.itemId));
    }
    if (q.low === "1" || q.low === "true") list = list.filter((i) => i.trackStock && i.variants.some((v) => v.minQtyMilli > 0 && v.qtyMilli <= v.minQtyMilli));
    return list;
  });

  /**
   * Barcodes for QR labels: a variant without one gets "JC" + 8 digits, once. Plain ASCII so any keyboard-wedge
   * scanner types it back correctly (Byte item codes are Arabic text).
   */
  app.post("/items/barcodes", { preHandler: view }, async (req) => {
    const { variantIds } = z.object({ variantIds: z.array(z.uuid()).min(1).max(500) }).parse(req.body);
    const rows = await db.select({ id: itemVariants.id, barcode: itemVariants.barcode }).from(itemVariants).where(inArray(itemVariants.id, variantIds));
    for (const r of rows.filter((x) => !x.barcode)) {
      for (let attempt = 0; !r.barcode; attempt++) {
        const code = `JC${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
        const [taken] = await db.select({ id: itemVariants.id }).from(itemVariants).where(eq(itemVariants.barcode, code));
        if (taken) { if (attempt > 20) throw new AppError(500, "barcode_space", "تعذر إنشاء باركود جديد."); continue; }
        await db.update(itemVariants).set({ barcode: code, updatedAt: new Date() }).where(and(eq(itemVariants.id, r.id), isNull(itemVariants.barcode)));
        r.barcode = code;
      }
    }
    if (rows.length) await audit(db, actorOf(req), "items.barcodes", "item_variant", undefined, null, rows.map((r) => ({ id: r.id, barcode: r.barcode })));
    return rows;
  });

  app.get("/items/low-stock", { preHandler: view }, async (req) => {
    const list = await loadItems(db, actorOf(req).role, eq(items.trackStock, true));
    return list.flatMap((i) => i.variants.filter((v) => v.minQtyMilli > 0 && v.qtyMilli <= v.minQtyMilli).map((v) => ({ item: { id: i.id, code: i.code, nameAr: i.nameAr, unit: i.unit }, variant: v })));
  });

  app.get("/items/:id", { preHandler: view }, async (req) => {
    const { id } = Id.parse(req.params);
    const [it] = await loadItems(db, actorOf(req).role, eq(items.id, id));
    if (!it) throw notFound("الصنف");
    const showCost = can(actorOf(req).role, "cost.view");
    const moves = await db.select({ m: stockMovements, by: users.displayName }).from(stockMovements).leftJoin(users, eq(users.id, stockMovements.createdBy))
      .where(inArray(stockMovements.variantId, it.variants.map((v) => v.id))).orderBy(desc(stockMovements.createdAt)).limit(100);
    return { ...it, movements: moves.map(({ m, by }) => ({ id: m.id, at: m.createdAt, variantId: m.variantId, kind: m.kind, qtyMilli: m.qtyMilli, refType: m.refType, refId: m.refId, reason: m.reason, by, ...(showCost ? { unitCostPt: m.unitCostPt } : {}) })) };
  });

  app.post("/items", { preHandler: manage }, async (req, reply) => {
    const input = ItemIn.parse(req.body);
    const actor = actorOf(req);
    const id = input.id ?? uuidv7();
    await db.transaction(async (tx) => {
      const [dup] = await tx.select({ id: items.id }).from(items).where(eq(items.code, input.code));
      if (dup) throw new AppError(409, "code_taken", `الكود ${input.code} مستخدم لصنف آخر.`);
      await tx.insert(items).values({
        id, code: input.code, nameAr: input.nameAr, nameEn: input.nameEn ?? null, nameKey: searchKey(`${input.nameAr} ${input.nameEn ?? ""}`), type: input.type,
        categoryId: input.categoryId ?? null, unit: input.unit, location: input.location ?? null, notes: input.notes ?? null,
        trackStock: input.trackStock ?? input.type !== "labor", active: input.active, createdBy: actor.id, deviceId: actor.deviceId ?? null,
      });
      for (const v of input.variants) {
        const vid = v.id ?? uuidv7();
        await tx.insert(itemVariants).values({ id: vid, itemId: id, grade: v.grade, sellPricePt: v.sellPricePt, barcode: v.barcode || null, minQtyMilli: v.minQtyMilli, active: v.active, createdBy: actor.id });
        if (v.openingQtyMilli) await move(tx, actor, { variantId: vid, qtyMilli: v.openingQtyMilli, kind: "opening", unitCostPt: v.openingCostPt ?? 0, refType: "item", refId: id });
      }
      await audit(tx, actor, "item.create", "item", id, null, input);
    });
    reply.status(201);
    return { id };
  });

  app.patch("/items/:id", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const input = ItemIn.partial().extend({ variants: z.array(VariantPatch).min(1).max(5).optional() }).parse(req.body);
    const actor = actorOf(req);
    await db.transaction(async (tx) => {
      const [it] = await tx.select().from(items).where(eq(items.id, id));
      if (!it) throw notFound("الصنف");
      const nameAr = input.nameAr ?? it.nameAr, nameEn = input.nameEn === undefined ? it.nameEn : input.nameEn;
      await tx.update(items).set({
        code: input.code ?? it.code, nameAr, nameEn, nameKey: searchKey(`${nameAr} ${nameEn ?? ""}`), type: input.type ?? it.type,
        categoryId: input.categoryId === undefined ? it.categoryId : input.categoryId, unit: input.unit ?? it.unit,
        location: input.location === undefined ? it.location : input.location, notes: input.notes === undefined ? it.notes : input.notes,
        trackStock: input.trackStock ?? it.trackStock, active: input.active ?? it.active, updatedAt: new Date(),
      }).where(eq(items.id, id));
      for (const v of input.variants ?? []) {
        const [old] = v.id ? await tx.select().from(itemVariants).where(and(eq(itemVariants.id, v.id), eq(itemVariants.itemId, id))) : [];
        if (old) {
          await tx.update(itemVariants).set({ grade: v.grade === undefined ? old.grade : v.grade, sellPricePt: v.sellPricePt, barcode: v.barcode === undefined ? old.barcode : v.barcode || null, minQtyMilli: v.minQtyMilli ?? old.minQtyMilli, active: v.active ?? old.active, updatedAt: new Date() }).where(eq(itemVariants.id, old.id));
          if (old.sellPricePt !== v.sellPricePt) await audit(tx, actor, "item.price_change", "variant", old.id, { sellPricePt: old.sellPricePt }, { sellPricePt: v.sellPricePt });
        } else {
          await tx.insert(itemVariants).values({ id: v.id ?? uuidv7(), itemId: id, grade: v.grade ?? null, sellPricePt: v.sellPricePt, barcode: v.barcode || null, minQtyMilli: v.minQtyMilli ?? 0, active: v.active ?? true, createdBy: actor.id });
        }
      }
      await audit(tx, actor, "item.update", "item", id, it, input);
    });
    return { id };
  });

  app.get("/item-categories", { preHandler: view }, async () => db.select().from(itemCategories).where(isNull(itemCategories.archivedAt)).orderBy(itemCategories.name));
  app.post("/item-categories", { preHandler: manage }, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const id = uuidv7();
    await db.insert(itemCategories).values({ id, name, createdBy: actorOf(req).id });
    reply.status(201);
    return { id };
  });

  app.get("/packages", { preHandler: view }, async () => {
    const pks = await db.select().from(servicePackages).where(isNull(servicePackages.archivedAt));
    const lines = pks.length ? await db.select().from(packageLines).where(inArray(packageLines.packageId, pks.map((p) => p.id))) : [];
    return pks.map((p) => ({ ...p, lines: lines.filter((l) => l.packageId === p.id) }));
  });
  app.post("/packages", { preHandler: manage }, async (req, reply) => {
    const p = z.object({ name: z.string().trim().min(2).max(80), lines: z.array(z.object({ variantId: z.uuid(), qtyMilli: int.positive() })).min(1).max(20) }).parse(req.body);
    const id = uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(servicePackages).values({ id, name: p.name, createdBy: actorOf(req).id });
      await tx.insert(packageLines).values(p.lines.map((l) => ({ id: uuidv7(), packageId: id, variantId: l.variantId, qtyMilli: l.qtyMilli })));
    });
    reply.status(201);
    return { id };
  });
}
