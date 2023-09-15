/**
 * @brief VSCode PDF COS syntax LSP server 
 *
 * @copyright
 * Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * Original portions: Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. 
 *
 * @remark
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
*/
import { Range, TextDocument } from "vscode-languageserver-textdocument";
import {  Location, Position, SemanticTokensBuilder } from "vscode-languageserver";
import { XrefInfoMatrix } from '../parser/XrefInfoMatrix';
import { TOKEN_TYPES } from '../types/constants';

/** PDF Whitespace from Table 1, ISO 32000-2:2020 */
const pdfWhitespaceRegex = new RegExp(/ \\t\\r\\n\\0\\x0C/);

/**
 * Takes a number, assumed to be a 32 bit signed integer and
 * converts to groups of 8 bits for display as a PDF bitmask.
 */
export function flags32_to_binary(num: number): string {
  const flag = Math.abs(num) & 0xFFFFFFFF;

  let s = (flag & 0x000000FF).toString(2).padStart(8, "0");
  s = ((flag & 0x0000FF00) >>  8).toString(2).padStart(8, "0") + ' ' + s;
  s = ((flag & 0x00FF0000) >> 16).toString(2).padStart(8, "0") + ' ' + s;
  s = ((flag & 0x8F000000) >> 24).toString(2).padStart(7, "0") + ' ' + s;
  if (num < 0) {
    s = "1" + s;
  }
  else {
    s = "0" + s;
  }
  return "Bitmask: " + s;
}


/**
 * Process a conventional cross-reference table looking for an in-use entry for object ID.
 *
 * @param  {number} objNum - object number. Should be > 0
 * @param  {number} genNum - object generation number. Should be >= 0.
 * @param {string} xrefTable - a full conventional cross reference table without the "xref" keyword
 *
 * @returns {number} a byte offset for the object or -1 if no such in-use object.
 */
function getByteOffsetForObj(
  objNum: number,
  genNum: number,
  xrefTable: string
): number {
  if (objNum <= 0 || genNum === -1) {
    return -1;
  }

  // Normalize line endings so split(), etc work as expected
  let xref = xrefTable.replace("\r\n", " \n"); // CR+LF --> SPACE+LF (byte count unchanged)
  xref = xrefTable.replace("\r", "\n"); // single CR --> single LF (byte count unchanged)
  xref = xrefTable.replace("\n\n", "\n"); // remove any blank lines
  const lines = xref.split("\n");

  let startObjNum = 1;
  let totalEntries = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(" f") || lines[i].includes(" n")) {
      // 20-byte entry: in-use (n) or free (f)
      const parts = lines[i].split(" ");
      if (objNum === i + startObjNum - 1 && parts.length >= 3) {
        // Found the object
        if (parts[2].includes("n") && parseInt(parts[1]) === genNum) {
          return parseInt(lines[i].split(" ")[0]);
        } else {
          return -1; // was a free object
        }
      }
    } else {
      // cross reference table sub-section line with 2 integers
      const parts = lines[i].split(" ");
      if (parts.length < 2) {
        return -1;
      }
      startObjNum = parseInt(parts[0]);
      totalEntries = parseInt(parts[1]);
    }
  }

  return -1;
}

/**
 * Given a PDF byte offset, work out equivalent VSCode line number.
 *
 * @param {TextDocument} document - the PDF (as text) document
 * @param {number} byteOffset - the PDF file byte offset. Always > 0.
 *
 * @returns {number} VSCode line number or -1 on error
 */
function getLineFromByteOffset(
  document: TextDocument,
  byteOffset: number
): number {
  if (byteOffset < 0) {
    return -1;
  }

  const text = document.getText();
  const buffer = Buffer.from(text, "utf8");
  let count = 0;
  let lineCount = 0;

  for (const byte of buffer) {
    if (byte === "\n".charCodeAt(0)) {
      lineCount++;
    }

    if (count === byteOffset) {
      return lineCount;
    }

    count++;
  }

  return -1;
}

/**
 * Find all occurrences of "X Y R" in the text for a given object ID.
 *
 * @param {number} objNum - object number. Should be > 0.
 * @param {number}genNum - object generation number. Should be >= 0.
 * @param {TextDocument} document - the PDF (as text) document
 *
 * @returns {Location[]} an array of locations
 */
export function findAllReferences(
  objNum: number,
  genNum: number,
  document: TextDocument
): Location[] {
  if (objNum <= 0 || genNum < 0) {
    return [];
  }

  const references: Location[] = [];

  // Avoid minimal matches with larger object numbers (e.g. 10 matches 10 but also 110, 210)
  // Avoid false matches with PDF "RG" operator as it takes 3 numeric operands
  const referencePattern = new RegExp(
    `(?<!\\d)${objNum} ${genNum} R(?=[^G])`,
    "g"
  );

  const text = document.getText();
  let match;

  // Find all occurrences of "X Y R" in the text
  while ((match = referencePattern.exec(text)) !== null) {
    const position = document.positionAt(match.index);
    references.push({
      uri: document.uri,
      range: {
        start: position,
        end: Position.create(
          position.line,
          position.character + match[0].length
        ),
      },
    });
  }
  return references;
}

/**
 * Find all occurrences of "X Y obj" in the text for a given object ID.
 *
 * @param {number} objNum - object number. Should be > 0.
 * @param {number} genNum - object generation number. Should be >= 0.
 * @param {TextDocument} document - the PDF (as text) document
 *
 * @returns {Location[]} an array of definition locations. Might be empty.
 */
export function findAllDefinitions(
  objNum: number,
  genNum: number,
  document: TextDocument
): Location[] {
  if (objNum <= 0 || genNum < 0) return [];

  const definitions: Location[] = [];

  const objDefinitionPattern = new RegExp(
    `(?<!\\d)${objNum} ${genNum} obj`,
    "g"
  );

  const text = document.getText();
  let match;

  // Find all occurrences of "X Y obj" in the text
  while ((match = objDefinitionPattern.exec(text)) !== null) {
    const position = document.positionAt(match.index);
    definitions.push({
      uri: document.uri,
      range: {
        start: position,
        end: Position.create(
          position.line,
          position.character + match[0].length
        ),
      },
    });
  }
  return definitions;
}


/**
 * Looks from given cursor position BACK up the file to locate
 * the first preceding "X Y obj" 
 * 
 * @returns a line number of nearest "X Y obj" or -1 if not found 
 */
export function findPreviousObjectLineNumber(
  cusor: Position,
  document: TextDocument
): number {
  const topOfFile = document.getText({
    start: { line: 0, character: 0 },
    end: cusor
  });
  let topLines = topOfFile.split('\n');
  topLines = topLines.reverse();

  // Find 1st occurence of "X Y obj" in the REVERSED lines
  for (let i = 0; i < topLines.length; i++) {
    const m = topLines[i].search(/\b\d+ \d+ obj\b/g);
    if (m != -1)
      return (topLines.length - i - 1); 
  }
  
  return -1;
}

/**
 * Determine if the given document is an FDF file based on its URI extension.
 *
 * @param document - the document object containing information about the file
 *
 * @returns true if the document is an FDF file, false otherwise
 */
export function isFileFDF(document: TextDocument): boolean {
  return document.uri.toLowerCase().endsWith(".fdf");
}

/**
 * Determine if the given document is a PDF file based on its URI extension.
 *
 * @param[in] document - the document object containing information about the file
 *
 * @returns true if the document is a PDF file, false otherwise
 */
export function isFilePDF(document: TextDocument): boolean {
  return document.uri.toLowerCase().endsWith(".pdf");
}

interface SemanticTokenInfo {
  type: string;
  range: Range;
}

/**
 * Works out the kind of semantic token at the given cursor position.
 * Only looks at the current line, but checks to ensure position is on
 * the token in case of multiple potential tokens on one line:
 * e.g. [ 1 0 R 2 0 R 3 0 R ] - which indirect reference is being queried?
 */
export function getSemanticTokenAtPosition(
  document: TextDocument,
  position: Position
): SemanticTokenInfo | null {
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: Number.MAX_VALUE },
  });

  // Check for an indirect reference pattern "X Y R"
  let regex = /(\d+) (\d+) R(?=[^G])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lineText)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (matchStart <= position.character && position.character <= matchEnd) {
      return {
        type: "indirectReference",
        range: {
          start: { line: position.line, character: matchStart },
          end: { line: position.line, character: matchEnd },
        },
      };
    }
  }

  // Check for "X Y obj" pattern - see clause 7.3.10 Indirect objects
  const objMatch = lineText.match(/(\d+) (\d+) obj/);
  if (objMatch) {
    const matchStart = objMatch.index!;
    return {
      type: "indirectObject",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + objMatch[0].length,
        },
      },
    };
  }

  // Check for conventional cross reference table entry pattern - both in-use and free objects
  const xrefMatch = lineText.match(/\b(\d{10}) (\d{5}) (n|f)\b/);
  if (xrefMatch) {
    const matchStart = xrefMatch.index!;
    return {
      type: "xrefTableEntry",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + xrefMatch[0].length,
        },
      },
    };
  }

  // "endobj" keyword
  const endobjMatch = lineText.match(/\b(endobj)\b/);
  if (endobjMatch) {
    const matchStart = endobjMatch.index!;
    return {
      type: "endobjKeyword",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + endobjMatch[0].length,
        },
      },
    };
  }

  // "endstream" keyword
  const endstreamMatch = lineText.match(/\b(endstream)\b/);
  if (endstreamMatch) {
    const matchStart = endstreamMatch.index!;
    return {
      type: "endstreamKeyword",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + endstreamMatch[0].length,
        },
      },
    };
  }

  // Check for a bitmask name: /F, /Ff, /Flags followed by a signed integer
  regex = /(\/(F|Ff|Flags))[ \t\r\n\f\0]([+-]?\d+)/g;
  while ((match = regex.exec(lineText)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (matchStart <= position.character && position.character <= matchEnd) {
      return {
        type: "bitMask",
        range: {
          start: { line: position.line, character: matchStart },
          end: { line: position.line, character: matchEnd },
        },
      };
    }
  }

  // Check for a hex string
  regex = /<[0-9a-fA-F \t\n\r\f\0]+>/g;
  while ((match = regex.exec(lineText)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (matchStart <= position.character && position.character <= matchEnd) {
      return {
        type: "hexString",
        range: {
          start: { line: position.line, character: matchStart },
          end: { line: position.line, character: matchEnd },
        },
      };
    }
  }
  
  return null;
}

export function tokenizeDocument(document: TextDocument): any {
  const tokensBuilder = new SemanticTokensBuilder();

  for (let line = 0; line < document.lineCount; line++) {
    const currentLine = document.getText({
      start: { line: line, character: 0 },
      end: { line: line, character: Number.MAX_VALUE },
    });

    const pattern = new RegExp(/(\d+ \d+ R)/, "g");
    let match;
    while ((match = pattern.exec(currentLine)) !== null) {
      tokensBuilder.push(
        line,
        match.index,
        match[0].length,
        TOKEN_TYPES.indexOf("indirectReference"),
        0 // assuming no modifier
      );
    }
  }

  return tokensBuilder.build();
}

export function buildXrefMatrix(content: string): XrefInfoMatrix {
  // Create a new instance of the XrefInfoMatrix
  const xrefMatrix = new XrefInfoMatrix();
  const lines = content.split("\n");

  const mockPDFDocument: TextDocument = {
    getText: () => content,
    uri: "mockURI",
    languageId: "pdf",
    version: 1, // mock version
    positionAt: (offset: number) => {
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length >= offset) {
          return { line: i, character: offset - charCount };
        }
        charCount += lines[i].length + 1;
      }
      return {
        line: lines.length - 1,
        character: lines[lines.length - 1].length,
      };
    },
    offsetAt: (position: Position) => {
      let offset = 0;
      for (let i = 0; i < position.line; i++) {
        offset += lines[i].length + 1;
      }
      return offset + position.character;
    },
    lineCount: content.split("\n").length,
  };

  // Merge all xref tables found in the document into the matrix
  xrefMatrix.mergeAllXrefTables(mockPDFDocument);

  return xrefMatrix;
}


