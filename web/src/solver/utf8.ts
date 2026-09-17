/**
 * Exact UTF-8 byte length of `text`, matching `new TextEncoder().encode(text).length`
 * (lone surrogates count as the 3-byte replacement character) without allocating.
 */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i++; } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** UTF-8 byte length of the JSON serialization of `value`. */
export function jsonByteLength(value: unknown): number {
  return utf8Length(JSON.stringify(value));
}
