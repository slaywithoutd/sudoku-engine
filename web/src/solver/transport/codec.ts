const MAX_CHUNK = 64 * 1024;
export function encodeRecords(records: readonly unknown[], limit = MAX_CHUNK): Uint8Array[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CHUNK) throw Error("codec-limit");
  const bytes = new TextEncoder().encode(
      records.map((record) => JSON.stringify(record)).join("\n"),
    ),
    result: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length;) {
    let end = Math.min(bytes.length, offset + limit);
    while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    if (end === offset) throw Error("codec-boundary");
    result.push(bytes.slice(offset, end));
    offset = end;
  }
  if (!result.length) result.push(new Uint8Array());
  return result;
}
export function decodeRecords(chunks: readonly Uint8Array[]): unknown[] {
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  if (total > 1024 * 1024) throw Error("codec-byte-limit");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}
