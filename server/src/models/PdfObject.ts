/**
 * Simple class representing metrics a single PDF indirect object   
 *
 * @copyright
 * Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * @remarks
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */

export default class PDFObject {
  private readonly _objectNumber: number;
  private readonly _generationNumber: number;
  private readonly _startOffset: number;
  private readonly _endOffset: number;
  private readonly _startStreamOffset: number;
  private readonly _endStreamOffset: number;

  /**
   * First line match for object identifier. Raw data can span lines.
   * Object starts with object number so no look-before is required.
   */
  private readonly _objectIdentifier: RegExp = 
    /(\d+)[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+obj/;

  /**
   * @param obj - the full PDF object data (from `X Y obj` to `endobj`)
   * @param start - the byte offset of the start of `X Y obj`
   * @param stmStartOffset - the byte offset of the start of the stream or -1
   * @param stmEndOffset - the byte offset of the start of the stream or -1
   */
  constructor(obj: string, start: number, stmStartOffset: number,  stmEndOffset: number, ) {
    this._startOffset = start;
    this._endOffset = start + obj.length;
    this._startStreamOffset = stmStartOffset;
    this._endStreamOffset = stmEndOffset;

    const match = obj.match(this._objectIdentifier);
    if (match && (match.length === 3)) {
      this._objectNumber = parseInt(match[1]);
      this._generationNumber = parseInt(match[2]);
    }
    else {
      throw new Error(`Could not find object ID in ${obj.slice(0,10)}!`);
    }

    if (stmStartOffset !== -1) {
      if ((stmStartOffset >= stmEndOffset) ||
          (stmStartOffset <= start) ||
          (stmEndOffset > this._endOffset)) {
        throw new Error(`Stream offsets are invalid for object ${this.getObjectID()}}!`);
      }
    }
  }

  /** Returns a single line, nicely spaced string of the object ID */
  getObjectID(): string {
    return `${this._objectNumber} ${this._generationNumber} obj`;
  }

  getStartOffset(): number {
    return this._startOffset;
  }

  getEndOffset(): number {
    return this._endOffset;
  }

  getStartStreamOffset(): number {
    return this._startStreamOffset;
  }

  getEndStreamOffset(): number {
    return this._endStreamOffset;
  }

  hasStream(): boolean {
    return (this._startStreamOffset !== -1) && (this._endStreamOffset !== -1);
  }
}
