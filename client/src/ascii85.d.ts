/**
 * Type definitions for ascii85 1.0.2
 */

declare module 'ascii85'  {
  interface Ascii85Static {
    encode(data: Buffer | Uint8Array, options?: { delimiter?: boolean }): string;
    decode(data: string): Buffer;
  }

  const Ascii85: Ascii85Static;
  export = Ascii85;
}
