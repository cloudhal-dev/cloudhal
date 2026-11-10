// Run with `node -r ./preempt-sync-proxy.cjs` (#190, test/miniflare-patch.test.ts): 300
// synchronous D1 proxy calls (`prepare`/`bind`) under the simulated preemption. Prints "ok", or
// the first failure.
const { Miniflare } = require("miniflare");

(async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  process.env.PREEMPT = "1";
  let i = 0;
  try {
    for (; i < 300; i++) db.prepare("SELECT ?1").bind(i);
    console.log("ok");
  } catch (e) {
    console.log(`call ${i}: ${String(e?.message).split("\n").slice(0, 3).join(" ")}`);
  } finally {
    delete process.env.PREEMPT;
    await mf.dispose();
  }
})();
