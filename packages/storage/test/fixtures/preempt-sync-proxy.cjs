// Preloaded with `node -r` (#190, test/miniflare-patch.test.ts). Node loads `-r` modules in worker
// threads too, so this reaches Miniflare's synchronous binding proxy thread. On every other call
// it stalls the caller between posting its request and waiting, and the proxy thread between
// storing its "done" flag and notifying: the two preemptions behind cloudflare/workers-sdk#15552.
const { isMainThread, MessagePort } = require("node:worker_threads");

const spin = (ms) => {
  const end = process.hrtime.bigint() + BigInt(ms * 1_000_000);
  while (process.hrtime.bigint() < end);
};

if (isMainThread) {
  const post = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    const result = post.call(this, message, ...rest);
    if (process.env.PREEMPT && typeof message?.id === "number" && message.id % 2 === 0) spin(3);
    return result;
  };
} else {
  const notify = Atomics.notify;
  let calls = 0;
  Atomics.notify = (...args) => {
    if (calls++ % 2 === 0) spin(6);
    return notify(...args);
  };
}
