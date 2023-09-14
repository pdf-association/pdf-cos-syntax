import { TextDocument, Range } from "vscode-languageserver-textdocument";
import PDFObject from '../models/PdfObject';


/**
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
 */

export default class PDFParser {
  content: string;

  constructor(document: TextDocument) {
    this.content = document.getText();
  }

  private countLinesUntil(index: number): number {
    return this.content.slice(0, index).split("\n").length - 1;
  }

  hasHeader(): boolean {
    return this.content.startsWith("%PDF-") || this.content.startsWith("%FDF-");
  }

  getHeaderRange(): Range {
    let startIdx = this.content.indexOf("%PDF-");
    if (startIdx === -1) startIdx = this.content.indexOf("%FDF-");

    const endIdx = this.content.indexOf(" obj");
    return {
      start: { line: this.countLinesUntil(startIdx), character: 0 },
      end: { line: this.countLinesUntil(endIdx), character: 0 },
    };
  }

  getHeaderSelectionRange(): Range {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: this.content.split("\n")[0].length },
    };
  }

  hasOriginalContent(): boolean {
    return /obj/.test(this.content);
  }

  getOriginalContentRange(): Range {
    const startIdx = this.content.indexOf("obj") + 3;
    const endIdx = this.findFirstOccurrence([
      "xref",
      "trailer",
      "startxref",
      "%%EOF",
    ]);
    return {
      start: { line: this.countLinesUntil(startIdx), character: 0 },
      end: {
        line: this.countLinesUntil(endIdx),
        character: this.content.slice(0, endIdx).lastIndexOf("\n"),
      },
    };
  }

  getOriginalContentSelectionRange(): Range {
    const range = this.getOriginalContentRange();
    return {
      start: range.start,
      end: { line: range.start.line, character: 0 },
    };
  }

  getObjects(): PDFObject[] {
    const objects: PDFObject[] = [];
    const regex = /(\d+ \d+ obj)[\s\S]+?(endobj)/g;
    let match;
    while ((match = regex.exec(this.content)) !== null) {
      const startLine = this.countLinesUntil(match.index);
      const endLine = startLine + match[0].split("\n").length;
      objects.push(
        new PDFObject(match[1], {
          start: { line: startLine - 1, character: 0 },
          end: { line: endLine, character: match[2].length },
        })
      );
    }
    return objects;
  }

  private findFirstOccurrence(keywords: string[], startIdx = 0): number {
    let firstOccurrence = this.content.length;
    for (const keyword of keywords) {
      const idx = this.content.indexOf(keyword, startIdx);
      if (idx !== -1 && idx < firstOccurrence) {
        firstOccurrence = idx;
      }
    }
    return firstOccurrence;
  }

  private findLastOccurrence(keywords: string[]): number {
    let lastOccurrence = -1;
    for (const keyword of keywords) {
      const idx = this.content.lastIndexOf(keyword);
      if (idx > lastOccurrence) {
        lastOccurrence = idx;
      }
    }
    return lastOccurrence;
  }

  getTrailerRange(): Range {
    const startIdx = this.findLastOccurrence(["xref", "trailer", "startxref"]);
    const endIdx = this.findFirstOccurrence(["%%EOF", "obj"], startIdx);
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
      obj.range.start.character,
      obj.range.end.character
    );
    return /stream/.test(objContent);
  }

  getStreamRangeForObject(obj: PDFObject): Range | null {
    const objContentStart = this.content.indexOf(
      "stream",
      obj.range.start.character
    );
    const objContentEnd = this.content.indexOf(
      "endstream",
      obj.range.start.character
    );

    if (objContentStart === -1 || objContentEnd === -1) return null;

    return {
      start: { line: this.countLinesUntil(objContentStart), character: 0 },
      end: {
        line: this.countLinesUntil(objContentEnd),
        character: "endstream".length,
      },
    };
  }

  hasTrailer(): boolean {
    return /trailer/.test(this.content);
  }

  getStreamRangeInsideObject(obj: PDFObject): Range {
    const objContentStart = this.content
      .slice(obj.range.start.line)
      .indexOf("stream");
    const objContentEnd = this.content
      .slice(obj.range.start.line)
      .indexOf("endstream");

    if (objContentStart === -1 || objContentEnd === -1)
      return { start: obj.range.start, end: obj.range.start }; // No stream found

    const startLine = this.content.slice(0, objContentStart).split("\n").length;
    const endLine = this.content.slice(0, objContentEnd).split("\n").length;

    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: "endstream".length },
    };
  }

  getStreamSelectionRangeInsideObject(obj: PDFObject): Range {
    const streamRange = this.getStreamRangeInsideObject(obj);
    return {
      start: streamRange.start,
      end: { line: streamRange.start.line, character: "stream".length },
    };
  }

  getTrailerSelectionRange(): Range {
    const trailerRange = this.getTrailerRange();

    return {
      start: trailerRange.start,
      end: { line: trailerRange.start.line, character: "trailer".length },
    };
  }

  hasCrossReferenceTable(): boolean {
    return this.content.includes("xref");
  }

  getCrossReferenceTableRange(): Range {
    const startIdx = this.content.indexOf("xref");
    const endIdx = this.content.indexOf("trailer", startIdx);

    if (startIdx === -1 || endIdx === -1)
      return {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      };

    const startLine = this.content.slice(0, startIdx).split("\n").length - 1;
    const endLine = this.content.slice(0, endIdx).split("\n").length - 1;

    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  getCrossReferenceTableSelectionRange(): Range {
    const range = this.getCrossReferenceTableRange();

    return {
      start: range.start,
      end: { line: range.start.line, character: "xref".length },
    };
  }

  getHeaderEndPosition(): number {
    const headerEnd = this.content.indexOf("obj");
    return headerEnd;
  }

  hasMoreContent(position: number): boolean {
    const remainingContent = this.content.slice(position);

    const EOFCount = (remainingContent.match(/%%EOF/g) || []).length;

    return EOFCount > 1;
  }

  getBodyEndPosition(startPos: number): number {
    const endKeywords = ["xref", "trailer", "startxref", "%%EOF"];
    let endPos = this.content.length;

    for (const keyword of endKeywords) {
      const idx = this.content.indexOf(keyword, startPos);
      if (idx !== -1 && idx < endPos) {
        endPos = idx;
      }
    }

    return endPos;
  }

  getCrossReferenceEndPosition(startPos: number): number {
    const endKeyword = "trailer";
    const endPos = this.content.indexOf(endKeyword, startPos);
    return endPos !== -1 ? endPos : this.content.length;
  }

  getBodyRange(startPos?: number): Range {
    const start = startPos || this.getHeaderEndPosition();
    const end = this.getBodyEndPosition(start);
    const startLine = this.content.slice(0, start).split("\n").length - 1;
    const endLine = this.content.slice(0, end).split("\n").length - 1;
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
    return {
      start: { line: startLine, character: 0 },
      end: {
        line: endLine,
        character: this.content.slice(end, this.content.indexOf("\n", end))
          .length,
      },
    };
  }

  getTrailerDictionaryRange(): Range {
    const startIdx = this.content.lastIndexOf("trailer");
    const endIdx = this.content.indexOf("startxref", startIdx);
    if (startIdx === -1 || endIdx === -1) {
      return {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      };
    }
    const startLine = this.content.slice(0, startIdx).split("\n").length - 1;
    const endLine = this.content.slice(0, endIdx).split("\n").length - 1;
    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  getTrailerDictionarySelectionRange(): Range {
    const range = this.getTrailerDictionaryRange();
    return {
      start: range.start,
      end: { line: range.start.line, character: "trailer".length },
    };
  }

  getOriginalContentEndPosition(): number {
    const endKeywords = ["xref", "trailer", "startxref", "%%EOF"];
    let endPos = this.content.length;
    for (const keyword of endKeywords) {
      const idx = this.content.indexOf(keyword);
      if (idx !== -1 && idx < endPos) {
        endPos = idx;
      }
    }
    return endPos;
  }

  getObjectsFromIncrementalUpdate(updateCount = 1): PDFObject[] {
    let startIdx = this.getOriginalContentEndPosition();

    let eofCount = 0;

    while (eofCount < updateCount) {
      startIdx = this.content.indexOf("%%EOF", startIdx + 1);

      if (startIdx === -1) {
        console.error(
          "The specified update count exceeds the number of updates in the PDF."
        );
        return [];
      }

      eofCount++;

      if (eofCount === updateCount) {
        startIdx = this.content.indexOf("xref", startIdx + 1);

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

  getCrossReferenceTableRangeFromIncrement(updateCount: number): Range {
    let startIdx = this.content.indexOf("xref");
    let endIdx = this.content.indexOf("trailer", startIdx);

    for (let i = 1; i < updateCount && startIdx !== -1 && endIdx !== -1; i++) {
      startIdx = this.content.indexOf("xref", endIdx);
      endIdx = this.content.indexOf("trailer", startIdx);
    }

    if (startIdx === -1 || endIdx === -1) {
      return {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      };
    }

    const startLine = this.content.slice(0, startIdx).split("\n").length - 1;
    const endLine = this.content.slice(0, endIdx).split("\n").length - 1;

    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: 0 },
    };
  }

  getCrossReferenceTableSelectionRangeFromIncrement(
    updateCount: number
  ): Range {
    const range = this.getCrossReferenceTableRangeFromIncrement(updateCount);
    return {
      start: range.start,
      end: { line: range.start.line, character: "xref".length },
    };
  }

  getTrailerRangeFromIncrement(updateCount: number): Range {
    const trailerStartKeyword = "trailer";
    const trailerEndKeyword = "startxref";

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
      end: { line: this.getLineFromPosition(dictEnd + 2), character: 0 },
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

    const xrefKeyword = "startxref";
    const xrefEnd = this.content.indexOf(xrefKeyword, startCharPosition);
    const endCharPosition = this.content
      .split("\n", range.end.line + 1)
      .join("\n").length;

    if (xrefEnd >= endCharPosition || xrefEnd === -1) {
      throw new Error(
        `Incremental update end for update ${updateCount} not found.`
      );
    }

    return xrefEnd + xrefKeyword.length;
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

  getLineFromPosition(position: number): number {
    return this.content.slice(0, position).split("\n").length;
  }

  getBodySectionRange(updateCount?: number): Range {
    if (updateCount == undefined) {
      const startIdx = this.getHeaderRange().end.line;
      const endIdx = this.getOriginalContentRange().end.line;
      return {
        start: { line: startIdx, character: 0 },
        end: { line: endIdx, character: 0 },
      };
    } else {
      const incrementalRange = this.getIncrementalUpdateRange(updateCount);

      const startSearchPos = this.content
        .split("\n", incrementalRange.start.line)
        .join("\n").length;
      const xrefPosition = this.content.indexOf("xref", startSearchPos);

      return {
        start: incrementalRange.start,
        end: { line: this.countLinesUntil(xrefPosition), character: 0 },
      };
    }
  }

  getBodySectionSelectionRange(updateCount?: number): Range {
    const bodyRange = this.getBodySectionRange(updateCount);
    return {
      start: bodyRange.start,
      end: {
        line: bodyRange.start.line,
        character: this.content.split("\n")[bodyRange.start.line].length,
      },
    };
  }

  getIncrementalUpdateRange(updateCount: number): Range {
    let startIdx = this.getOriginalContentEndPosition();

    for (let i = 1; i < updateCount; i++) {
      startIdx = this.content.indexOf("%%EOF", startIdx + 1);
      if (startIdx === -1) {
        throw new Error(
          "The specified update count exceeds the number of updates in the PDF."
        );
      }
    }

    startIdx = startIdx + "%%EOF".length;

    const endIdx = this.content.indexOf("%%EOF", startIdx + 1);
    if (endIdx === -1) {
      throw new Error(
        "The specified update count exceeds the number of updates in the PDF."
      );
    }

    return {
      start: { line: this.countLinesUntil(startIdx), character: 0 },
      end: {
        line: this.countLinesUntil(endIdx),
        character: 0,
      },
    };
  }

  
}
