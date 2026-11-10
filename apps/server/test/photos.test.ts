/** Car photos from the phone: stored as files, listed on the work order, refused when not a JPEG. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeWorkOrder, setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST", url: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(t.engineerToken), payload: payload as object });
// A real 1x1 JPEG.
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe("car photos", () => {
  it("saves a photo on the work order and serves it back", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    const up = await call("POST", `/work-orders/${wo.id}/photos`, { dataUrl: JPEG, note: "الرفرف الأمامي" });
    expect(up.statusCode).toBe(201);
    const list = (await call("GET", `/work-orders/${wo.id}/photos`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ note: "الرفرف الأمامي", by: "محمود سمير" });
    expect((await call("GET", `/photos/${list[0].id}`)).json().dataUrl).toBe(JPEG);
  });

  it("refuses something that is not a JPEG photo", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    expect((await call("POST", `/work-orders/${wo.id}/photos`, { dataUrl: "data:image/jpeg;base64," + Buffer.from("not a picture at all, just some text pretending".repeat(4)).toString("base64") })).statusCode).toBe(422);
    expect((await call("POST", `/work-orders/${wo.id}/photos`, { dataUrl: "data:image/png;base64,AAAA" })).statusCode).toBe(422);
  });
});
