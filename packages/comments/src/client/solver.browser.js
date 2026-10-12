/**
 * The proof-of-work solver (RFC-0007 §7.2–§7.3), a dedicated Web Worker served as
 * `/_cloudhal/cw.<hash>.js`. It receives `{ c: challenge, b: bits }` and answers with the smallest
 * decimal counter `x` such that `SHA-256(c ":" x)` starts with `b` zero bits — the same search as
 * `solveChallenge` in `@cloudhal/comments`.
 *
 * Pure-JS SHA-256 (no WebAssembly, no `crypto.subtle` round trip per hash): the state after the
 * challenge's whole 64-byte blocks is computed once, so each try hashes one or two blocks. The
 * round constants are derived from the primes, as the standard defines them, to keep the file
 * small. Plain JavaScript because it runs in the browser as built.
 */

/** @type {number[]} */
const K = [];
/** @type {number[]} */
const H = [];
for (let n = 2; K.length < 64; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
  if (!prime) continue;
  if (H.length < 8) H.push(((Math.sqrt(n) % 1) * 2 ** 32) | 0);
  K.push(((Math.cbrt(n) % 1) * 2 ** 32) | 0);
}

const w = new Int32Array(64);
const rot = (x, n) => (x >>> n) | (x << (32 - n));

/**
 * One compression of a 16-word block into a copy of `state`.
 * @param {number[]} state
 * @param {Int32Array} block
 */
const compress = (state, block) => {
  for (let i = 0; i < 64; i++) {
    if (i < 16) w[i] = block[i];
    else {
      const a = w[i - 15];
      const b = w[i - 2];
      w[i] =
        (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) +
        w[i - 16] +
        (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10)) +
        w[i - 7];
    }
  }
  let [a, b, c, d, e, f, g, h] = state;
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
    const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  return [a, b, c, d, e, f, g, h].map((v, i) => (v + state[i]) | 0);
};

/** Leading zero bits of a digest given as eight 32-bit words. */
const zeros = (digest) => {
  let n = 0;
  for (const word of digest) {
    if (word) return n + Math.clz32(word);
    n += 32;
  }
  return n;
};

/**
 * @param {string} challenge ASCII (base64url segments and dots)
 * @param {number} bits
 */
export const solve = (challenge, bits) => {
  const prefix = `${challenge}:`;
  const whole = prefix.length - (prefix.length % 64);
  const block = new Int32Array(16);
  let mid = H;
  for (let at = 0; at < whole; at += 64) {
    block.fill(0);
    for (let i = 0; i < 64; i++) block[i >> 2] |= prefix.charCodeAt(at + i) << (24 - (i % 4) * 8);
    mid = compress(mid, block);
  }
  const rest = prefix.slice(whole);
  const bytes = new Uint8Array(128);
  for (let x = 0; ; x++) {
    const tail = rest + x;
    const length = whole + tail.length;
    const blocks = tail.length + 9 > 64 ? 2 : 1;
    bytes.fill(0);
    for (let i = 0; i < tail.length; i++) bytes[i] = tail.charCodeAt(i);
    bytes[tail.length] = 0x80;
    // the message length in bits fits in 32 bits (challenges are ≤ 512 characters)
    const end = blocks * 64;
    const bitLength = length * 8;
    bytes[end - 4] = bitLength >>> 24;
    bytes[end - 3] = bitLength >>> 16;
    bytes[end - 2] = bitLength >>> 8;
    bytes[end - 1] = bitLength;
    let state = mid;
    for (let k = 0; k < blocks; k++) {
      for (let i = 0; i < 16; i++) {
        const o = k * 64 + i * 4;
        block[i] = (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
      }
      state = compress(state, block);
    }
    if (zeros(state) >= bits) return String(x);
  }
};

if (typeof WorkerGlobalScope !== "undefined")
  self.onmessage = (event) => {
    const { c, b } = event.data;
    postMessage(solve(String(c), Number(b)));
  };
