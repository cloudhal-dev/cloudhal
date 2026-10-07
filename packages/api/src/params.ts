import type { Context } from "hono";
import { badRequest } from "./errors.ts";

/** Reads a path parameter declared by a parent route (Hono types those as possibly undefined). */
export function param(c: Context, name: string): string {
  const value = c.req.param(name);
  if (value === undefined) throw badRequest(`missing route parameter ${name}`);
  return value;
}
