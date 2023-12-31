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
import { Location, Position } from "vscode-languageserver";
import { XrefInfoMatrix } from '../parser/XrefInfoMatrix';

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


/**
 * Consrtuct a PDF hover for Date objects.
 * 
 * @param d  PDF date string (literal or hex string)
 * @returns Human-readable date for the valid parts of the PDF date string
 */
function parsePDFDateString(d: string): string {
  /// @todo - hex strings!

  // Parse a PDF Date string into consistuent fields
  const PDFDateRegex = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([-+Z])?(\d{2})?(')?(\d{2})?(')?/gm;

  let errorInFormat: boolean = false;
  let year: number = -1;
  let month: number = 1;
  let day: number = 1;
  let hour: number = 0;
  let minute: number = 0;
  let second: number = 0;
  let utc_char: string = ''; // Z, + or -
  let utc_hour: number = 0;
  let utc_minute: number = 0;
  let s: string = '';

  const m = PDFDateRegex.exec(d);
  if (m != null) {
    try {
      // console.log(m);

      if ((m.length >= 1) && (m[1] != null)) {
        year = parseInt(m[1]);
        if (year < 0) year = 0;
        s = year.toString().padStart(4, '0');
      }

      const MonthNames: string[] = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec' ];
      if ((m.length >= 2) && (m[2] != null)) {
        month = parseInt(m[2]);
        if ((month < 1) || (month > 12)) { month = 1; errorInFormat = true; }
      }
      s = MonthNames[month - 1] + ' ' + s;

      const DaysInMonth: number[] = [ 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ]; // Leap years not checked!
      if ((m.length >= 3) && (m[3] != null) && !errorInFormat) {
        day = parseInt(m[3]);
        if ((day < 1) || (day > DaysInMonth[month - 1])) { day = 1; errorInFormat = true; }
      }
      s = day + ' ' + s;

      if ((m.length >= 4) && (m[4] != null) && !errorInFormat) {
        hour = parseInt(m[4]);
        if ((hour < 0) || (hour > 23)) { hour = 0; errorInFormat = true; }
      }
      s = s + ', ' + hour.toString().padStart(2, '0');

      if ((m.length >= 5) && (m[5] != null) && !errorInFormat) {
        minute = parseInt(m[5]);
        if ((minute < 0) || (minute > 59)) { minute = 0; errorInFormat = true; }
      }
      s = s + ':' + minute.toString().padStart(2, '0');

      if ((m.length >= 6) && (m[6] != null) && !errorInFormat) {
        second = parseInt(m[6]);
        if ((second < 0) || (second > 59)) { second = 0; errorInFormat = true; }
      }
      s = s + ':' + second.toString().padStart(2, '0');

      if ((m.length >= 7) && (m[7] != null) && !errorInFormat) {
        utc_char = m[7];

        if ((m.length >= 8) && (m[8] != null) && !errorInFormat) {
          utc_hour = parseInt(m[8]);
          if ((utc_hour < 0) || (utc_hour > 23)) { utc_hour = 0; errorInFormat = true; }

          // skip m[9] (apostrophe)

          if ((m.length >= 10) && (m[10] != null) && !errorInFormat) {
            utc_minute = parseInt(m[10]);
            if ((utc_minute < 0) || (utc_minute > 59)) { utc_minute = 0; errorInFormat = true; }
          }
        }
        if (utc_char === 'Z')
          s = s + ' UTC';
        else // + or -
          s = s + ' UTC' + utc_char + utc_hour.toString().padStart(2, '0') + ':' + utc_minute.toString().padStart(2, '0');
      }
      else {
        s = s + ' GMT'; // Default as per PDF specification
      }

    }
    catch (e: any) {
      console.log("ERROR: ", e);
      s = 'ERROR: ' + e + ' - ' + s;
    }
  }

  return s;
}
