/**
 * @brief A PDF parser that classifies ranges of bytes as certain types of "object"  
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
 * 
 * Notes on JavaScript/TypeScript regular expression and PDF lexical rules based on:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions
 *
 * - PDF whitespace are ONLY the 6 characters / \t\n\r\f\0/
 *    - this is DIFFERENT to  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space
 *
 * - PDF EOL sequences are ONLY the 3: \r, \n, or \r\n
 *    - PDF files are NOT required to use consistent EOLs so there can be a mix!
 *    - this is DIFFERENT to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#line_terminators
 *
 * - official PDF delimiters (in addition to whitespace and EOL): / <>[]()\//
 *
 * - object IDs (object number and generation number pairs) CANNOT have '+'/'-' so /\d+\ is OK
 *
 * - JS space, Word and word boundary character classes (\w, \W, \b, \B, \s, \S) CANNOT be
 *    used as they do not match PDF's definition!!!
 *
 * - once all PDF EOLs are normalized to ONLY \n, can then rely on string.startsWith(), etc.
 * 
 * - non-regex searching for "xref", "stream" and "obj" can mismatch to "startxref", "endstream" and "endobj"!
 *   Should use a regex with look-before for PDF whitespace or EOLs. BE CAREFUL WITH indexOf()!
 *
 */
import { TextDocument, Range } from "vscode-languageserver-textdocument";
import PDFObject from '../models/PdfObject';

export default class PDFParser {
  content: string;

  /** Start of an object ` obj` - does not account for object ID! 
   *  Includes a leading SPACE to avoid mismatch with `endobj` in case 
   * of malformed PDFs.
   */
  private readonly _objKeyword: string = " obj"; 

  /** Complete object from `X Y obj` to `endobj`. 
   * Non-greedy for body data. Anything allowed between keywords.
   * 2 match expressions for `X Y obj` and `endobj`. 
   */
  /*eslint no-control-regex: 0 */
  private readonly _completeObjectRegex: RegExp =
     /(\d+[ \t\r\n\f\0]+\d+[ \t\r\n\f\0]+obj)[\x00-\xFF]*?[ \t\r\n\f\0](endobj)/;

  /** `stream` keyword. Will also mismatch `endstream`! */
  private readonly _streamKeyword: string = "stream"; 

  /** `stream` keyword regex. AVOIDS mismatch with `endstream` 
   * by using look-before for required whitespace and PDF EOLs! 
   */
  private readonly _streamRegex: RegExp = new RegExp(/(?<=[ \t\r\n\f\0])stream/);

  /** `endstream` keyword */
  private readonly _endstreamKeyword: string = "endstream";

  /** `xref` keyword. Will mismatch with `startxref`! */
  private readonly _xrefKeyword: string = "xref";

  /** 
   * `xref` regex. AVOIDS mismatch with `startxref`
   * by using look-before for required whitespace and PDF EOLs! 
   */
  private readonly _xrefRegex: RegExp = new RegExp(/(?<=[ \t\r\n\f\0])xref/);

  /** `trailer` keyword. */
  private readonly _trailerKeyword: string = "trailer";

  /** `trailer` keyword regex. No whitespace or EOL requirements. */
  private readonly _trailerRegex: RegExp = new RegExp(this._trailerKeyword);

  /** `startxref` keyword. */
  private readonly _startxrefKeyword: string = "startxref";

  /** `%%EOF` marker keyword. */
  private readonly _EOFKeyword: string = "%%EOF";

  /** `%%EOF` marker regex. No whitespace or EOL requirements. Global! */
  private readonly _EOFRegex = new RegExp(this._EOFKeyword, 'g');


  /** 
   * Normalize PDF line endings but keep character counts unchanged. 
   * This parser ONLY checks and splits with "\n"!
   */
  constructor(document: TextDocument) {
    this.content = document.getText();
    this.content = this.content.replace(/\r\n/g, " \n");
    this.content = this.content.replace(/\r/g, "\n");
  }


  /** Counts the number of lines from start of the PDF up to but **NOT**
   *  including offset {@link index}.
   */ 
  private countLinesUntil(index: number): number {
    if (index < 0) {
      console.warn(`PDFParser.countLinesUntil was -1 --> 0!`);
      return 0;
    }
    return this.content.slice(0, index).split("\n").length - 1;
  }

  /** Only checks for `%[PF]DF-`. Does not check for `\d\.\d` */
  hasHeader(): boolean {
    return this.content.startsWith("%PDF-") || this.content.startsWith("%FDF-");
  }

  /** Header range is from `%[PF]DF-` to line immediately before first `X Y obj` */
  getHeaderRange(): Range {
    let startIdx = this.content.indexOf("%PDF-");
    if (startIdx === -1) startIdx = this.content.indexOf("%FDF-");

    let endIdx = this.content.indexOf(this._objKeyword);

    // Header is missing or is AFTER the first "X Y obj"!?!
    if ((startIdx === -1) || (endIdx == -1) || (endIdx <= (startIdx + "%PDF-".length)))
      console.warn(`PDFParser.getHeaderRange was weird: startIdx=${startIdx}, endIdx=${endIdx}!`);

    // Normalize the data so range is always valid. Variables are now LINE NUMBERS!
    startIdx = Math.max(0, this.countLinesUntil(startIdx));
    endIdx = Math.max(0, this.countLinesUntil(startIdx), this.countLinesUntil(endIdx) - 1);
    return {
      start: { line: startIdx, character: 0 },
      end: { line: endIdx, character: this.content.split("\n")[endIdx].length },
    };
  }

  getHeaderEndPosition(): number {
    const headerEnd = this.content.indexOf(this._objKeyword);
    return headerEnd;
  }

  /** Ensures there is a complete object from "X Y obj" to "endobj" */
  hasOriginalContent(): boolean {
    const res: boolean = this._completeObjectRegex.test(this.content);
    console.log(`hasOriginalContent: ${res}`);
    return res;
  }

  getOriginalContentRange(): Range {
    // Locate the 1st full object `X Y obj` to `endobj`
    const match = this._completeObjectRegex.exec(this.content);
    if (match && (match.index >= 0)) {
      const startIdx = match.index; // start original body is from `X Y obj`
      console.log(`Matched full object: starting at ${match.index} for ${match[0].length} chars`);
      const endIdx = this.findFirstOccurrence(
        [ this._xrefKeyword, this._trailerKeyword, this._startxrefKeyword, this._EOFKeyword ], 
        startIdx + match[0].length
      );
      console.log(`getOriginalContentRange: offset ${startIdx} - ${endIdx}`);
      if (endIdx !== -1) 
        return {
          start: { line: this.countLinesUntil(startIdx), character: 0 },
          end: {
            line: this.countLinesUntil(endIdx),
            character: this.content.slice(0, endIdx).lastIndexOf("\n"),
          },
        };
    }
    console.error(`getOriginalContentRange: failed!`);
    return { start: {line: 0, character: 0}, end: {line: 0, character: 0} };
  }

  getObjects(): PDFObject[] {
    const objects: PDFObject[] = [];
    let match;
    const completeObjectRegexSticky = new RegExp(this._completeObjectRegex, "g");
    while ((match = completeObjectRegexSticky.exec(this.content)) !== null) {
      const startLine = this.countLinesUntil(match.index);
      const endLine = startLine + match[0].split("\n").length;
      console.log(`Found object ${match[1]}: at offset ${match.index} = line ${startLine}:0 to ${endLine}:${match[2].length}`);
      objects.push(
        new PDFObject(
          match[1], 
          {
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: match[2].length },
          },
          match.index
        )
      );
    }
    return objects;
  }

  /** Find the first occurence using simple strings and indexOf(). MAY GET MISMATCHES! */
  private findFirstOccurrence(keywords: string[], startIdx: number = 0): number {
    let firstOccurrence = this.content.length;
    let firstKeyword: string = "";
    for (const keyword of keywords) {
      const idx = this.content.indexOf(keyword, startIdx);
      if (idx !== -1 && idx < firstOccurrence) {
        firstOccurrence = idx;
        firstKeyword = keyword; 
      }
    }
    console.log(`findFirstOccurrence(${startIdx}): ${firstKeyword} at ${firstOccurrence}`);
    return firstOccurrence;
  }

  /** Find the first occurence using simple strings and indexOf(). MAY GET MISMATCHES! */
  private findFirstOccurrenceRegex(keywordRegexes: RegExp[], startIdx: number = 0): number {
    const s = this.content.slice(startIdx);
    let firstOccurrence = s.length;
    let firstRegex: string = "";
    for (const regex of keywordRegexes) {
      const m = s.match(regex);
      if (m && m.index && (m.index < firstOccurrence)) {
        firstOccurrence = m.index;
        firstRegex = regex.source;
      }
    }
    console.log(`findFirstOccurrenceRegex(${startIdx}): ${firstRegex} at ${firstOccurrence}`);
    return firstOccurrence + startIdx;
  }

  private findLastOccurrence(keywords: string[]): number {
    let lastOccurrence = -1;
    let lastKeyword: string = "";
    for (const keyword of keywords) {
      const idx = this.content.lastIndexOf(keyword);
      if (idx > lastOccurrence) {
        lastOccurrence = idx;
        lastKeyword = keyword;
      }
    }
    console.log(`findLastOccurrence: ${lastKeyword} at ${lastOccurrence}`);
    return lastOccurrence;
  }

  getTrailerRange(): Range {
    const startIdx = this.findLastOccurrence([this._xrefKeyword, this._trailerKeyword, this._startxrefKeyword]);
    const endIdx = this.findFirstOccurrence([this._EOFKeyword, this._objKeyword], startIdx);
    console.log(`getTrailerRange: offset ${startIdx} - ${endIdx}`);
    return {
      start: { line: this.countLinesUntil(startIdx), character: 0 },
      end: {
        line: this.countLinesUntil(endIdx),
        character: this.content.slice(0, endIdx).lastIndexOf("\n"),
      },
    };
  }

  hasStreamInsideObject(obj: PDFObject): boolean {
    const objContent = this.content.slice(
      obj.getStartOffset(),
      obj.getEndOffset()
    );
    const res: boolean = this._streamRegex.test(objContent);
    console.log(`hasStreamInsideObject for ${obj.getID()} from ${obj.getStartOffset()} to ${obj.getEndOffset()} --> ${res}`);
    return res;
  }

  /**
   * Determines if a PDF object `X Y obj` to `endobj`
   * contains a stream by the presence of **BOTH** keywords `stream`
   * and `endstream`.
   */
  getStreamRangeForObject(obj: PDFObject): Range | null {
    const objContent = this.content.slice(
      obj.getStartOffset(),
      obj.getEndOffset()
    );
    const objStreamStart = objContent.indexOf(this._streamKeyword);
    const objStreamEnd = objContent.indexOf(this._endstreamKeyword, this._streamKeyword.length);

    if (objStreamStart === -1 || objStreamEnd === -1) {
      console.log(`getStreamRangeForObject: not a stream!`);
      return null;
    }

    console.log(`getStreamRangeForObject: found a stream!`);
    return {
      start: { 
        line: this.countLinesUntil(obj.getStartOffset() + objStreamStart), 
        character: 0 
      },
      end: {
        line: this.countLinesUntil(obj.getStartOffset() + objStreamEnd),
        character: this._endstreamKeyword.length, // assumes "endstream" at start of line! POSSIBLY WRONG
      },
    };
  }

  hasTrailer(): boolean {
    const res = this._trailerRegex.test(this.content);
    console.log(`hasTrailer = ${res}`);
    return res;
  }

  getStreamRangeInsideObject(obj: PDFObject): Range | null {
    const objContent = this.content.slice(
      obj.getStartOffset(),
      obj.getEndOffset()
    );
    const objStreamStart = objContent.indexOf(this._streamKeyword);
    const objStreamEnd = objContent.indexOf(this._endstreamKeyword, this._streamKeyword.length);

    if (objStreamStart === -1 || objStreamEnd === -1)
      return null; // No stream found

    const startLine = this.content.slice(0, obj.getStartOffset() + objStreamStart).split("\n").length;
    const endLine = this.content.slice(0, obj.getStartOffset() + objStreamEnd).split("\n").length;

    console.log(`getStreamRangeInsideObject: found a stream from line ${startLine} to ${endLine}`);
    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: this._endstreamKeyword.length },
    };
  }

  getTrailerSelectionRange(): Range {
    const trailerRange = this.getTrailerRange();
    console.log(`getTrailerSelectionRange`);
    return trailerRange;
  }

  /**
   * Checks if PDF file has a conventional cross reference table anywhere.
   * @todo Shouldn't this be with a startPos???
   */
  hasCrossReferenceTable(): boolean {
    console.log(`hasCrossReferenceTable`);
    return this._xrefRegex.test(this.content);
  }

  /**
   * Gets a conventional cross reference table.
   * @todo Shouldn't this be with a startPos???
   */
  getCrossReferenceTableRange(): Range | null {
    const startIdx = this.content.indexOf(this._xrefKeyword);
    let endIdx = this.content.indexOf(this._trailerKeyword, startIdx);
    if (endIdx === -1)
      endIdx = this.content.indexOf(this._startxrefKeyword, startIdx);
    console.log(`getCrossReferenceTableRange: from ${startIdx} - ${endIdx}`);

    if (startIdx === -1 || endIdx === -1)
      return null;

    const startLine = this.content.slice(0, startIdx).split("\n").length;
    const endLine = this.content.slice(0, endIdx).split("\n").length - 1;

    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  /**
   * Returns true of there is more content after offset {@link position}
   * as defined by the presence of a `%%EOF` marker comment.
   */
  hasMoreContent(position: number): boolean {
    const remainingContent = this.content.slice(position);
    const EOFCount = (remainingContent.match(this._EOFRegex) || []).length;
    console.log(`hasMoreContent from ${position} = ${EOFCount > 1}`);
    return EOFCount > 1;
  }

  /**
   * Looks for the end of a body section (indirect objects) starting at {@link startPos}.
   * Indicated by the presence of the 1st keyword `trailer`, `startxref`, or `%%EOF`.
   */
  getBodyEndPosition(startPos: number): number {
    const endKeywords = [this._xrefKeyword, this._trailerKeyword, this._startxrefKeyword, this._EOFKeyword];
    let endPos = this.content.length;
    let keywordMarker: string = "";
    for (const keyword of endKeywords) {
      const idx = this.content.indexOf(keyword, startPos);
      if (idx !== -1 && idx < endPos) {
        keywordMarker = keyword;
        endPos = idx;
      }
    }
    console.log(`getBodyEndPosition from ${startPos}: found ${keywordMarker} at ${endPos}`);
    return endPos;
  }

  /**
   * Looks for the end of a conventional cross reference section starting at {@link startPos}.
   * Indicated by the presence of the 1st keyword `trailer`, `startxref`, or `%%EOF`.
   */
  getCrossReferenceEndPosition(startPos: number): number {
    let endPos = this.content.length;
    let keywordMarker: string = "";
    const endKeywords = [this._trailerKeyword, this._startxrefKeyword, this._EOFKeyword];
    for (const keyword of endKeywords) {
      const idx = this.content.indexOf(keyword, startPos);
      if (idx !== -1 && idx < endPos) {
        keywordMarker = keyword;
        endPos = idx;
      }
    }
    console.log(`getCrossReferenceEndPosition from ${startPos}: found ${keywordMarker} at ${endPos}`);
    return endPos;
  }

  getBodyRange(startPos?: number): Range {
    const start = startPos || this.getHeaderEndPosition();
    const end = this.getBodyEndPosition(start);
    const startLine = this.content.slice(0, start).split("\n").length - 1;
    const endLine = this.content.slice(0, end).split("\n").length - 1;
    console.log(`getBodyRange from ${startPos}: from line ${startLine} at ${endLine}`);
    return {
      start: { line: startLine, character: 0 },
      end: {
        line: endLine,
        character: this.content.slice(end, this.content.indexOf("\n", end))
          .length,
      },
    };
  }

  getCrossReferenceRange(startPos: number): Range {
    const start = startPos;
    const end = this.getCrossReferenceEndPosition(start);
    const startLine = this.content.slice(0, start).split("\n").length - 1;
    const endLine = this.content.slice(0, end).split("\n").length - 1;
    console.log(`getCrossReferenceRange from ${startPos}: from line ${startLine} at ${endLine}`);
    return {
      start: { line: startLine, character: 0 },
      end: {
        line: endLine,
        character: this.content.slice(end, this.content.indexOf("\n", end))
          .length,
      },
    };
  }

  getTrailerDictionaryRange(): Range | null {
    const startIdx = this.content.lastIndexOf(this._trailerKeyword);
    let endIdx = -1;

    let keywordMarker: string = "";
    const endKeywords = [this._startxrefKeyword, this._EOFKeyword];
    for (const keyword of endKeywords) {
      const idx = this.content.indexOf(keyword, startIdx);
      if (idx !== -1 && idx < endIdx) {
        keywordMarker = keyword;
        endIdx = idx;
      }
    }
    console.log(`getTrailerDictionaryRange: from offset ${startIdx} - ${endIdx}`);
    if (startIdx === -1 || endIdx === -1)
      return null;

    const startLine = this.content.slice(0, startIdx).split("\n").length - 1;
    const endLine = this.content.slice(0, endIdx).split("\n").length - 1;
    console.log(`getTrailerDictionaryRange: from line ${startLine} at ${endLine}`);
    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  getOriginalContentEndPosition(): number {
    const endKeywords = [this._xrefKeyword, this._trailerKeyword, this._startxrefKeyword, this._EOFKeyword];
    let endPos = this.content.length;
    for (const keyword of endKeywords) {
      const idx = this.content.indexOf(keyword);
      if (idx !== -1 && idx < endPos) {
        endPos = idx;
      }
    }
    console.log(`getOriginalContentEndPosition: ${endPos}`);
    return endPos;
  }

  getObjectsFromIncrementalUpdate(updateCount: number = 1): PDFObject[] {
    let startIdx = this.getOriginalContentEndPosition();
    let eofCount = 0;

    while (eofCount < updateCount) {
      startIdx = this.content.indexOf(this._EOFKeyword, startIdx + 1);

      if (startIdx === -1) {
        console.error(
          "The specified update count exceeds the number of updates in the PDF."
        );
        return [];
      }

      eofCount++;

      if (eofCount === updateCount) {
        startIdx = this.content.indexOf(this._xrefKeyword, startIdx + 1);

        if (startIdx === -1) {
          console.error(
            `Malformed PDF: Incremental update ${updateCount} doesn't have an associated xref.`
          );
          return [];
        }
      }
    }

    if (startIdx === -1) {
      console.error(
        `Unable to determine the start index for the incremental update ${updateCount}.`
      );
      return [];
    }

    const contentSlice = this.content.slice(startIdx);
    const parser = new PDFParser({ getText: () => contentSlice } as any);
    return parser.getObjects();
  }

  getBodySelectionRange(currentPosition: number): Range {
    const bodyStart = currentPosition;
    const bodyEnd = this.getBodyEndPosition(bodyStart);

    const startLine = this.content.slice(0, bodyStart).split("\n").length - 1;
    const endLine = this.content.slice(0, bodyEnd).split("\n").length - 1;

    console.log(`getBodySelectionRange`);

    return {
      start: { line: startLine, character: 0 },
      end: {
        line: endLine,
        character: this.content.slice(
          bodyEnd,
          this.content.indexOf("\n", bodyEnd)
        ).length,
      },
    };
  }

  getCrossReferenceTableRangeFromIncrement(updateCount: number): Range | null {
    let startIdx = this.content.indexOf(this._xrefKeyword);
    let endIdx = this.content.indexOf(this._trailerKeyword, startIdx);
    if (endIdx === -1)
      endIdx = this.content.indexOf(this._startxrefKeyword, startIdx);

    for (let i = 1; (i < updateCount) && (startIdx !== -1) && (endIdx !== -1); i++) {
      startIdx = this.content.indexOf(this._xrefKeyword, endIdx);
      endIdx = this.content.indexOf(this._trailerKeyword, startIdx);
      if (endIdx === -1)
        endIdx = this.content.indexOf(this._startxrefKeyword, startIdx);
    }

    if (startIdx === -1 || endIdx === -1) return null;

    const startLine = this.content.slice(0, startIdx).split("\n").length;
    const endLine = this.content.slice(0, endIdx).split("\n").length - 1;

    console.log(`getCrossReferenceTableRangeFromIncrement(${updateCount}: line ${startLine} - ${endLine})`);
    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  getTrailerRangeFromIncrement(updateCount: number): Range {
    const trailerStartKeyword = this._trailerKeyword;
    const trailerEndKeyword = this._startxrefKeyword;

    const trailerStart = this.findNthOccurrence(
      this.content,
      trailerStartKeyword,
      updateCount
    );
    const trailerEnd = this.content.indexOf(trailerEndKeyword, trailerStart);

    if (trailerStart === -1 || trailerEnd === -1) {
      throw new Error(`Trailer for update ${updateCount} not found.`);
    }

    return {
      start: { line: this.getLineFromPosition(trailerStart), character: 0 },
      end: {
        line: this.getLineFromPosition(trailerEnd),
        character: this.content.slice(trailerEnd).indexOf("\n"),
      },
    };
  }

  getTrailerSelectionRangeFromIncrement(updateCount: number): Range {
    return this.getTrailerRangeFromIncrement(updateCount);
  }

  getTrailerDictionaryRangeFromIncrement(updateCount: number): Range {
    const range = this.getTrailerRangeFromIncrement(updateCount);
    const dictEnd = this.content.lastIndexOf(">>", range.end.line);
    const dictStart = this.content.lastIndexOf("<<", dictEnd);

    return {
      start: { line: this.getLineFromPosition(dictStart), character: 0 },
      end: { line: this.getLineFromPosition(dictEnd + ">>".length), character: 0 },
    };
  }

  getTrailerDictionarySelectionRangeFromIncrement(updateCount: number): Range {
    return this.getTrailerDictionaryRangeFromIncrement(updateCount);
  }

  getIncrementalUpdateEndPosition(updateCount: number): number {
    const range = this.getTrailerRangeFromIncrement(updateCount);
    const startCharPosition = this.content
      .split("\n", range.start.line)
      .join("\n").length;

    const xrefEnd = this.content.indexOf(this._startxrefKeyword, startCharPosition);
    const endCharPosition = this.content
      .split("\n", range.end.line + 1)
      .join("\n").length;

    if (xrefEnd >= endCharPosition || xrefEnd === -1) {
      throw new Error(
        `Incremental update end for update ${updateCount} not found.`
      );
    }

    return xrefEnd + this._startxrefKeyword.length;
  }

  findNthOccurrence(
    str: string,
    subString: string,
    occurrence: number
  ): number {
    let times = 0;
    let index = 0;

    while (times < occurrence && (index = str.indexOf(subString, index) + 1)) {
      times++;
    }

    return index ? index - 1 : -1;
  }

  /** Maps an offset position to a line number (used by Range) */
  getLineFromPosition(position: number): number {
    return this.content.slice(0, position).split("\n").length;
  }


  getBodySectionRange(updateCount: number = 0): Range {
    console.log(`getBodySectionRange(${updateCount})`);

    if (updateCount == 0) {
      // Original PDF 
      const res = this.getOriginalContentRange();
      console.log(`getBodySectionRange() = lines ${res.start.line} - ${res.end.line}`);
      return res;
    } 
    else {
      // Incremental update 1..N
      const incrementalRange = this.getIncrementalUpdateRange(updateCount);

      const startSearchPos = this.content
        .split("\n", incrementalRange.start.line)
        .join("\n").length;
      const xrefPosition = this.content.indexOf(this._xrefKeyword, startSearchPos);

      console.log(`getBodySectionRange(${updateCount}) = lines ${incrementalRange.start.line} - ${this.countLinesUntil(xrefPosition)}`);
      return {
        start: incrementalRange.start,
        end: { line: this.countLinesUntil(xrefPosition), character: 0 },
      };
    }
  }

  getIncrementalUpdateRange(updateCount: number): Range {
    let startIdx = this.getOriginalContentEndPosition();

    for (let i = 1; i < updateCount; i++) {
      startIdx = this.content.indexOf(this._EOFKeyword, startIdx + 1);
      if (startIdx === -1) {
        throw new Error(
          "The specified update count exceeds the number of updates in the PDF."
        );
      }
    }

    startIdx = startIdx + this._EOFKeyword.length;

    const endIdx = this.content.indexOf(this._EOFKeyword, startIdx + 1);
    if (endIdx === -1) {
      throw new Error(
        "The specified update count exceeds the number of updates in the PDF."
      );
    }

    console.log(`getIncrementalUpdateRange(${updateCount}) = offset ${startIdx} - ${endIdx}`);
    return {
      start: { line: this.countLinesUntil(startIdx), character: 0 },
      end: { line: this.countLinesUntil(endIdx), character: 0 }
    };
  }
}
