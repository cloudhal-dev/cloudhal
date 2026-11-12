/**
 * The theme's own icon drawings (RFC-0026 26d): names of the curated set this theme draws itself.
 * Empty: every icon is Phosphor's, in the site's weight. `defineIconSet` checks each drawing
 * (shapes only, `currentColor`), so an icon can never carry markup, links or scripts into pages.
 *
 *   export const iconSet = defineIconSet({
 *     star: { viewBox: "0 0 24 24", body: '<path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z"/>' },
 *   });
 */
import { defineIconSet } from "@cloudhal/core-ts/icons";

export const iconSet = defineIconSet({});
