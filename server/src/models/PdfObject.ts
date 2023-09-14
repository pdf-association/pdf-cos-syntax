/**
 * @brief Simple class representing a PDF object with a Range  
 *
 * @copyright
 * Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * @remark
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
import { Range } from 'vscode-languageserver-textdocument';
import PDFParser from '../parser/PdfParser';


export default class PDFObject {
  /** The content of the PDF object as a VSCode (UTF-8) string */
  private readonly _id: string;

  /** 
   * Range as start and end Line / Character pairs in the full PDF file. 
   * 
   * NOT AS BYTE OFFSET!! 
   */
  private readonly _range: Range;

  /** 
   * Start position offset in the full PDF file. NOT A LINE / CHARACTER POSITION!!
   * 
   * Ending position is {@link startOffset} + {@link id}.length
   */
  private readonly _startOffset: number;

  constructor(id: string, range: Range, start: number) {
    this._id = id;
    this._range = range;
    this._startOffset = start;
    this._validateRange("constructor", range);
  }

  private _validateRange(ctx: string, r: Range) {
    // Validate the range is sensible
    if ((r.start.line < 0) || (r.end.line < 0))
      console.error(`PDFObject validation failure for ${ctx} "${this._id}": bad range.*.line`);
    if ((r.start.character < 0) || (r.end.character < 0))
      console.error(`PDFObject validation failure for ${ctx} "${this._id}": bad range.*.character`);
    if (r.end.line < r.start.line)
      console.error(`PDFObject validation failure for ${ctx} "${this._id}": bad start vs end line`);
    if (r.end.line === r.start.line) {
      // "id" on one line
      if (r.end.character < r.start.character)
        console.error(`PDFObject validation failure for ${ctx} "${this._id}": bad start vs end characters on same line`);
      if ((r.end.character === r.start.character) || (this._id.length === 0))
        console.error(`PDFObject validation failure for ${ctx} "${this._id}": zero characters on a line`);
      if ((r.end.character - r.start.character) !== this._id.length)
        console.error(`PDFObject validation failure for ${ctx} "${this._id}": character length != id.length`);
    }
  }

  /** Returns the VSCode version of the data associated with the object (UTF-8) */
  getID(): string {
    return this._id;
  }

  /**
   *  Returns the Range (start and end line/character pairs!) associated with the object.
   *  Based on \n line endings.
   */
  getRange(): Range {
    return this._range;
  }

  /** 
   * Returns the absolute starting byte offset associated with the object in the PDF file.
   * Always >= 0.
   */
  getStartOffset(): number {
    return this._startOffset;
  }

  /** 
   * Returns the absolute end byte offset associated with the object in the PDF file.
   * This is the NEXT byte in the PDF after the end of {@link getID()}
   */
  getEndOffset(): number {
    return this._startOffset + this._id.length;
  }

  /**
   *  If this object is a stream, then return the Range (start and end line/character pairs!)
   *  associated with the stream data. Returns null if not a stream.
   *  This range will always be within {@link getRange()}.
   */
  getStreamRange(parser: PDFParser): Range | null {
    const r = parser.getStreamRangeForObject(this);
    if (r)
      this._validateRange("getStreamRange", r);
    return r;
  }
}
