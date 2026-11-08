/** Request-validation pieces every route module shares. */
import { z } from "zod";

export const Id = z.object({ id: z.uuid() });
export const int = z.number().int().safe();
/** Optional trimmed text with a length cap; null clears the field. */
export const opt = (max: number) => z.string().trim().max(max).nullable().optional();
