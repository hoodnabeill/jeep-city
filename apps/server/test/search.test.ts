/** Quick search finds the car the user meant: every car with the typed plate number comes before looser matches. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { plateKey, searchKey, uuidv7 } from "@jc/core";
import { customers, vehicles } from "../src/db/schema";
import { setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const get = (url: string) => t.app.inject({ method: "GET", url, headers: t.as(t.engineerToken) });

async function car(letters: string, digits: string, owner = "عميل بحث") {
  const customerId = uuidv7();
  await t.db.insert(customers).values({ id: customerId, name: owner, nameKey: searchKey(owner), mobile: "01000000000" });
  await t.db.insert(vehicles).values({ id: uuidv7(), customerId, plateType: "private", plateLetters: letters, plateDigits: digits, plateKey: plateKey({ letters, digits }), chassis: `CH${digits}${letters.length}` });
}

describe("quick search", () => {
  it("lists every car with plate number 123 first, even with 40 other cars containing 123", async () => {
    await car("ص ط ب", "123", "صاحب العربية المطلوبة");
    for (let i = 0; i < 40; i++) await car("م ر", `${1230 + i}`);
    await car("ن ج", "123");
    const hits = (await get("/lookup?q=123")).json() as { vehicle: { plateDigits: string; plateLetters: string } }[];
    expect(hits.slice(0, 2).map((h) => h.vehicle.plateDigits)).toEqual(["123", "123"]);
    expect(hits.slice(0, 2).map((h) => h.vehicle.plateLetters).sort()).toEqual(["ن ج", "ص ط ب"].sort());
  });

  it("the full plate comes first", async () => {
    const hits = (await get(`/lookup?q=${encodeURIComponent("صطب 123")}`)).json();
    expect(hits[0].vehicle.plateLetters).toBe("ص ط ب");
  });

  it("the customers page finds a customer by plate", async () => {
    const r = (await get(`/customers?q=${encodeURIComponent("123 ص ط ب")}`)).json();
    expect(r.rows.map((c: { name: string }) => c.name)).toContain("صاحب العربية المطلوبة");
  });
});
