/**
 * The scopes rule of RFC-0046 §3: scope ids are compared exactly, with one exception. Workers
 * Admin (`workers-scripts.admin`) covers Workers Editor (`workers-scripts.edit`), which manifests
 * up to and including v0.9.0 name; an Editor cannot create the Workers a release installs (#225).
 */
export const IMPLIED_SCOPES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "workers-scripts.admin": Object.freeze(["workers-scripts.edit"]),
});

/** The manifest's `requiredScopes` that `granted` does not hold, in the manifest's order. */
export function missingScopes(
  manifest: { readonly requiredScopes: readonly string[] },
  granted: Iterable<string>,
): string[] {
  const held = new Set<string>();
  for (const s of granted) {
    held.add(s);
    const implied = Object.hasOwn(IMPLIED_SCOPES, s) ? IMPLIED_SCOPES[s] : undefined;
    for (const i of implied ?? []) held.add(i);
  }
  return manifest.requiredScopes.filter((s) => !held.has(s));
}
