// Needs to match definition in ./client/src/extension.ts

export interface PDFToken {
  line: number,
  start: number;
  end: number;
  type: string;
  [key: string]: any;
}
