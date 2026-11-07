// ULIDs for card ids: 26 characters of Crockford's base32, a 48-bit millisecond time followed by
// 80 random bits, so ids sort by creation time. See https://github.com/ulid/spec.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_BYTES = 10;

/**
 * A new ULID. The clock and the randomness are passed in, so core stays free of platform APIs:
 * apps pass `Date.now()` and their secure random source, such as `crypto.getRandomValues`.
 */
export function ulid(now: number, randomBytes: (count: number) => Uint8Array): string {
  if (!Number.isInteger(now) || now < 0 || now >= 2 ** 48) {
    throw new RangeError(`ULID time must be a whole number of milliseconds below 2^48: ${now}`);
  }
  let time = "";
  for (let rest = now, index = 0; index < TIME_LENGTH; index++) {
    time = (ALPHABET[rest % 32] ?? "") + time;
    rest = Math.floor(rest / 32);
  }

  const bytes = randomBytes(RANDOM_BYTES);
  if (bytes.length !== RANDOM_BYTES) throw new RangeError(`Expected ${RANDOM_BYTES} random bytes`);
  // 80 bits make exactly 16 base32 characters: read them 5 bits at a time.
  let random = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      random += ALPHABET[(value >> bits) & 31] ?? "";
    }
    value &= (1 << bits) - 1;
  }
  return time + random;
}
