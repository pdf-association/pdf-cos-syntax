/**
 * PDF utility functions 
 *
 * @copyright Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * Original portions: Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. 
 *
 * @remarks
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
'use strict';

import type { Range, TextDocument } from "vscode-languageserver-textdocument";
import type { DocumentUri, Location } from "vscode-languageserver";
import { Position } from "vscode-languageserver";
import { XrefInfoMatrix } from '../parser/XrefInfoMatrix';


/** PDF Whitespace from Table 1, ISO 32000-2:2020 */
// const pdfWhitespaceRegex = new RegExp(/ \\t\\r\\n\\0\\x0C/);

/**
 * Find all occurrences of "X Y R" in the text for a given object ID.
 *
 * @param objNum - object number. Should be greater than 0.
 * @param genNum - object generation number. Should be greater than or equal to 0.
 * @param document - the PDF (as text) document
 *
 * @returns an array of locations
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

  // Avoid minimal matches with larger object numbers (e.g. 10 matches 10 but also 110, 210, etc.)
  // Avoid false matches with PDF "RG" operator as it takes 3 numeric operands
  const referencePattern = new RegExp(
    `(?<!\\d)${objNum} ${genNum} R(?=[^G])`,
    "g"
  );

  const text = document.getText();
  let match;

  // Find all occurrences of "X Y R" in the text
  while ((match = referencePattern.exec(text)) != null) {
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
 * @param objNum - object number. Should be greater than 0.
 * @param genNum - object generation number. Should be greater than or equal to 0.
 * @param document - the PDF (as text) document
 *
 * @returns an array of definition locations. Might be empty.
 */
export function findAllDefinitions(
  objNum: number,
  genNum: number,
  document: TextDocument
): Location[] {
  if (objNum <= 0 || genNum < 0) { return []; }

  const definitions: Location[] = [];

  const objDefinitionPattern = new RegExp(
    `(?<!\\d)${objNum} ${genNum} obj`,
    "g"
  );

  const text = document.getText();
  let match;

  // Find all occurrences of "X Y obj" in the text
  while ((match = objDefinitionPattern.exec(text)) != null) {
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
 * the first preceding `X Y obj` 
 * 
 * @param cursor - cursor position in PDF
 * @param document - PDF document
 * 
 * @returns a line number of nearest `X Y obj` or -1 if not found 
 */
export function findPreviousObjectLineNumber(
  cursor: Position,
  document: TextDocument
): number {
  const topOfFile = document.getText({
    start: { line: 0, character: 0 },
    end: cursor
  });
  let topLines = topOfFile.split('\n');
  topLines = topLines.reverse();

  // Find 1st occurence of "X Y obj" in the REVERSED lines
  for (let i = 0; i < topLines.length; i++) {
    const m = topLines[i].search(/\b\d+ \d+ obj\b/g);
    if (m !== -1) {
      return (topLines.length - i - 1); 
    }
  }
  
  return -1;
}

/**
 * Determine if the given document is an FDF file based on its URI extension.
 *
 * @param document - the PDF document
 *
 * @returns true if the document is an FDF file, false otherwise
 */
export function isFileFDF(document: TextDocument): boolean {
  return document.uri.toLowerCase().endsWith(".fdf");
}

/**
 * Determine if the given document is a PDF file based on its URI extension.
 *
 * @param document - the document object containing information about the file
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
 * e.g. `[ 1 0 R 2 0 R 3 0 R ]` - which indirect reference is being queried?
 * @param document - the PDF document
 * @param position - the cursor position within the VSCode document
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

  while ((match = regex.exec(lineText)) != null) {
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
  while ((match = regex.exec(lineText)) != null) {
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
  while ((match = regex.exec(lineText)) != null) {
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

/**
 * Builds the cross-reference table (2D matrix) from all cross-reference sections
 * in the PDF.
 * 
 * @param docURI - URI of PDF document
 * @param content - PDF document text content
 */
export function buildXrefMatrix(docURI: DocumentUri, content: string): XrefInfoMatrix {
  console.log(`buildXrefMatrix(...)`);
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

  // Merge all conventional cross reference sections into the matrix
  xrefMatrix.mergeAllXrefSections(mockPDFDocument);
  // xrefMatrix.saveToCSV(docURI);
  return xrefMatrix;
}
