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
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Location, Position } from "vscode-languageserver";

/** PDF Whitespace from Table 1, ISO 32000-2:2020 */
const pdfWhitespaceRegex = new RegExp(/ \\t\\r\\n\\0\\x0C/);

/** PDF Delimiters including PDF whitespace, from Tables 1 and 2, ISO 32000-2:2020 */
const pdfDelimitersRegex = new RegExp(
  pdfWhitespaceRegex.source + /%\\(\\)<>\\[\\]\//
);

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
  for (let i: number = 0; i < topLines.length; i++) {
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
  const regex = /(\d+) (\d+) R(?=[^G])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lineText)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (matchStart <= position.character && position.character <= matchEnd) {
      console.log(`Sematic Token: "${lineText}" --> indirectReference`);
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
    console.log(`Sematic Token: "${lineText}" --> indirectObject`);
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
    console.log(`Sematic Token: "${lineText}" --> xrefTableEntry`);
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
    console.log(`Sematic Token: "${lineText}" --> endobjKeyword`);
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
    console.log(`Sematic Token: "${lineText}" --> endstreamKeyword`);
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

  console.log(`Sematic Token: "${lineText}" --> ???`);
  return null;
}


export class EntryNode {
  constructor(
    public lineNbr: number, // ABSOLUTE line number in VSCode's PDF TextDocument
    public objectNum: number, // Object number (determined by cross reference subsection lines)
    public first: number, // \d{10}: in-use = byte offset, free = next object number in free list
    public generationNumber: number, // \d{5}: generation number
    public inUse: boolean // (f|n): true iff "n", false if "f"
  ) {}
}

export class XrefInfoMatrix {
  /** 
   * 1st index = object number
   * 2nd index = file revision 
   *    0 = original PDF
   *    1 = oldest (1st) incremental update, etc.
   */
  private matrix: EntryNode[][] = [];

  /** Set of diagnostics generated when building cross-reference information */
  public diagnostics: Diagnostic[] = [];

  /** 
   * Dumps out the matrix to console.log(), sorted by Object Number, then file revision
   */
  public dumpMatrix(): void {
    let i;
    let j;
    let use: string;
    for (i = 0; i < this.matrix.length; i++) {
      if (this.matrix[i]) {
        for (j =0; j < this.matrix[i].length; j++) {
          if (this.matrix[i][j]) {
            use = (this.matrix[i][j].inUse ? "in-use" : "free  ");
            console.log(`${i.toString().padStart(5)} ${this.matrix[i][j].generationNumber.toString().padStart(5)} obj: ` +
                        `rev. ${j} was ${use} @ line ${this.matrix[i][j].lineNbr}`);
          }
        }
      }
    }
  }

  /** 
   * Has this Object Number been defined as free or in-use (with any generation number)?
   */
  public isObjectNumberValid(objectNumber: number): boolean {
    return this.matrix[objectNumber] !== undefined;
  }

  /** 
   * Was this object ID (object number and generation number pair) ever defined as in-use?
   * This means a "X Y obj" should exist in PDF.
   */
  public isObjectIDInUse(objectNumber: number, generationNumber: number): boolean {
    if (this.matrix[objectNumber] !== undefined) {
      let e: EntryNode;
      for (e of this.matrix[objectNumber]) {
          if (e && (generationNumber === e.generationNumber) && e.inUse) {
            return true;
        }
      }
    }
    return false;
  }

  /** 
   * Find the Object Number of the cross reference table entry at lineNumber, which should have
   * the same generation number. Returns the object number or -1 if not found.
   */
  public getObjectNumberBasedOnByteOffset(byteOffset: number, generationNumber: number, flag: string): number {
    let o: EntryNode[];
    let e: EntryNode;
    for (o of this.matrix) {
      if (o) {
        for (e of o) {
          if (e) {
            if ((byteOffset === e.first) && (generationNumber === e.generationNumber) && (e.inUse == (flag === "n"))) {
                return e.objectNum;
            }
          }
        }
      }
    }
    return -1;
  }

  /** 
   * Was this object ID (object number and generation number pair) ever defined as in-use?
   * This means a "X Y obj" should exist in PDF. Returns the byte offset in the PDF or -1 if not found.
   *
   * This PDF byte offset then needs to be converted to a VSCode line number to estimate where 
   * the PDF object "X Y obj" ... "endobj" is approximately located.
   */
  public getByteOffsetOfInuseObjectID(objectNumber: number, generationNumber: number): number {
    if (this.matrix[objectNumber] !== undefined) {
      let e: EntryNode;
      for (e of this.matrix[objectNumber]) {
          if (e && (generationNumber === e.generationNumber) && e.inUse) {
            return e.first;
        }
      }
    }
    return -1;
  }

  /**
   * Returns the _first_ cross reference table entry line number for a given Object ID (object number and 
   * generation number pair, such as from "X Y R" or "X Y obj"). Returns -1 if no match.
   */
  public getFirstLineNumberForObjectID(objectNumber: number, generationNumber: number): number {
    if (this.matrix[objectNumber] !== undefined) {
      let e: EntryNode;
      for (e of this.matrix[objectNumber]) {
          if (e && (generationNumber === e.generationNumber) && e.inUse) {
            return e.lineNbr;
        }
      }
    }
    return -1;
  }

  /** 
   * Get the complete list of in-use object ID's across all incremental updates. 
   * Might be empty array [] if the object ID was not in any cross reference table. 
   */
  public getInUseEntriesForObjectID(objectNumber: number, generationNumber: number): EntryNode[] {
    const entries: EntryNode[] = [];
    if (this.matrix[objectNumber] !== undefined) {
      let e: EntryNode;
      for (e of this.matrix[objectNumber]) {
          if (e && (generationNumber === e.generationNumber) && e.inUse) {
            entries.push(e);
        }
      }
    }
    return entries;
  }

  /** 
   * Get the complete revision list of an object's changes across all incremental updates. 
   * Might be empty array [] if the object number was not in any cross reference table. 
   */
  public getObjectNumberEntries(objectNumber: number): EntryNode[]  {
    return this.isObjectNumberValid(objectNumber) ? this.matrix[objectNumber] : [];
  }

  /**
   * Finds ALL conventional cross reference tables and merges them into a single mega-matrix.
   * Conventional cross reference table start with "xref" and end with "trailer" or "startxref"
   * keyword (for hybrid reference PDFs). Starts from TOP of the PDF for revision numbers.
   */
  public mergeAllXrefTables(pdfFile: TextDocument) {
    let revision = 0;
    let pdf = pdfFile.getText();

    /////////////////////////////////////////
    // Normalize line endings to \n so Position <--> Offsets work. BUT DON'T ALTER BYTE COUNTS!
    pdf = pdf.replace('\\r\\n', ' \\n');
    pdf = pdf.replace('\\r', '\\n');

    let xrefStart = 0;
    let startXref = 0;
    do {
      // NOTE: indexOf("xref") will ALSO match "startxref" so need special handling!!!
      xrefStart = pdf.indexOf("xref", startXref + "startxref".length);
      startXref = pdf.indexOf("startxref", startXref + "startxref".length);
    }
    while (startXref === xrefStart + 5);

    // Did we find the "xref" start to a conventional cross reference table?
    if (xrefStart === -1) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `No conventional cross reference tables were found - "xref" keyword missing`,
        range: { start: Position.create(0, 0), end: Position.create(0, Number.MAX_VALUE) },
        source: "pdf-cos-syntax"
      });
    }

    // Did we find the "startxref" start that is near the end of a file revision?
    if (startXref === -1) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `"startxref" keyword missing`,
        range: { start: Position.create(0, 0), end: Position.create(0, Number.MAX_VALUE) },
        source: "pdf-cos-syntax"
      });
    }

    // Locate end of conventional cross reference table: "trailer" or "startxref" keywords
    let xrefEnd = pdf.indexOf("trailer", xrefStart + "xref".length);
    if (xrefEnd < 0) {
      // Hybrid PDFs may not have "trailer" keyword, so rely on "startxref"
      xrefEnd = startXref;
    }
    let xrefTable: string;

    while ((xrefEnd > 0) && (startXref > 0)) {
      if (xrefEnd < 0) {
        xrefTable = pdf.slice(xrefStart);
      }
      else {
        xrefTable = pdf.slice(xrefStart, xrefEnd);
      }
      ///////////////////////////////
      /// WHY IS  positionAt(offset).line always 0 for any offset???
      console.log(`Revision ${revision}: found cross reference table at offset ${xrefStart} to ${xrefEnd}`);
      console.log(pdfFile.positionAt(xrefStart));
      console.log(pdfFile.positionAt(xrefEnd));
      this.addXrefTable(pdfFile.positionAt(xrefStart).line, revision, xrefTable);
      ///////////////////////////////
      revision++;
      do {
        // NOTE: indexOf("xref") will ALSO match "startxref" so need special handling!!!
        xrefStart = pdf.indexOf("xref", startXref + "startxref".length);
        startXref = pdf.indexOf("startxref", startXref + "startxref".length);
      }
      while (startXref === xrefStart + 5); // will also stop on -1
      if (xrefStart > 0) {
        xrefEnd = pdf.indexOf("trailer", xrefStart + "xref".length);
        if (xrefEnd < 0) {
          xrefEnd = startXref;
        }
      }
      else {
        xrefEnd = -1;
      }
    }

    console.log(`Found ${revision} conventional cross reference tables`);
    return;
  }

  /**
   * Merges a _single_ conventional cross reference table into the matrix. "xref"
   * keyword can be the first line. Stops if "trailer", "startxref" or "%%EOF" is found.
   * startLineNbr is an ABSOLUTE line number in VSCode's PDF TextDocument.
   * Also captures basic sanity check/validation issues.
   */
  private addXrefTable(startLineNbr: number, revision: number, xref: string) {
    let currentObjectNum: number | null = null;
    let entryCount: number | null = null;
    let nextFreeObj: number = 0; // Free list always starts with object 0

    let xrefLines = xref.split('\n');

    // Remove any first line that is "xref" keyword
     if (xrefLines[0].startsWith("xref")) {
      startLineNbr++;
      xrefLines = xrefLines.slice(1);
    }
    
    for (const entryStr of xrefLines) {
      const trueLen = entryStr.length; // before any trim!

      console.log(`${startLineNbr}: "${entryStr}"`);

      // Skip blank or whitespace-only lines
      if (!entryStr.trim()) {
        startLineNbr++;
        continue;
      }

      if (entryStr.trim().startsWith("trailer") || entryStr.trim().startsWith("startxref") || entryStr.trim().startsWith("%%EOF")) {
        // came to the end of this cross reference table
        break;
      }

      // Check if cross-reference table contains any prohibited stuff such as
      // comments, names, dicts, etc. (i.e. anything that is NOT: '0'-'9', 'f', 'n', or
      // PDF whitespace or PDF EOLs).
      let entryPatternMatch = entryStr.match(/([^0-9 fn\t\r\n\0\f]+)/);
      if (entryPatternMatch) {
        this.diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, Number.MAX_VALUE) },
          message: `PDF cross reference table contains illegal characters: "${entryPatternMatch[1]}"`,
          source: "pdf-cos-syntax"
        });
      }
      entryPatternMatch = entryStr.match(/\b(\d{10}) (\d{5}) (f|n)\b/);

      if (entryPatternMatch && (entryPatternMatch.length === 4)) {
        const genNum = parseInt(entryPatternMatch[2]);
        const letter = entryPatternMatch[3];
        if (currentObjectNum === null || entryCount === null || entryCount < 0 || currentObjectNum < 0) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Unexpected xref entry without a preceding valid subsection marker: ${entryStr}`,
            range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, 20) },
            source: "pdf-cos-syntax"
          });
          startLineNbr++;
          continue;
        }

        // Check chaining of free list (singly linked list by \d{10} object numbers)
        if (letter === "f") {
          const freeObjNumber = parseInt(entryPatternMatch[1]);
          if (nextFreeObj != currentObjectNum) {
            this.diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, 20) },
              message: `Expected next free object to be object ${nextFreeObj}, not object ${currentObjectNum}. Free list of objects not chained correctly`,
              source: "pdf-cos-syntax"
            });
          }
          nextFreeObj = freeObjNumber;
        }

        // console.log(`Revision ${revision}: adding object ${currentObjectNum} at line ${startLineNbr}`);
        const entry = new EntryNode(
            startLineNbr,                   // line number in VSCode's PDF TextDocument
            currentObjectNum,               // object number
            parseInt(entryPatternMatch[1]), // \d{10} in-use = offset, free = next object number in free list
            genNum,                         // \d{5} generation number
            (letter === 'n')                // true iff in-use object ("n"). false if "f"
        );

        if (!this.matrix[currentObjectNum]) {
          this.matrix[currentObjectNum] = [];
          // Check if very first object 0 in revision 0 of original PDF had correct free list 
          if ((currentObjectNum == 0) && (genNum !== 65535)) {
            this.diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, 20) },
              message: `Object 0 at start of free list did not have a generation number of 65535 (was "${genNum}")`,
              source: "pdf-cos-syntax"
            });
          }
        }

        // Because of split("\n") above, the "\n" is removed so -1!!
        if (trueLen != 19) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, 20) },
            message: `Cross reference table entries should always be 20 bytes (was ${entryStr.length + 1})`,
            source: "pdf-cos-syntax"
          });
        }
        
        // add entry to our matrix
        this.matrix[currentObjectNum][revision] = entry;

        entryCount--;
        if (entryCount < 0) entryCount = null;
        currentObjectNum++;
        startLineNbr++;
        continue;
      } // \d{10} \d{5} (f|n) = entry

      const subsectionMatch = entryStr.match(/\b(\d+) (\d+)\b/);

      if (subsectionMatch && (subsectionMatch.length == 3)) {
        const newCurrentObjectNum = parseInt(subsectionMatch[1], 10);
        const newEntryCount = parseInt(subsectionMatch[2], 10);

        // Special case for "X 0" subsection marker (no objects)
        if (newEntryCount === 0) {
          entryCount = null;
          currentObjectNum = null;
          startLineNbr++;
          continue;
        }

        if (newEntryCount < 0) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Subsection object count was negative: ${newEntryCount}`,
            range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, Number.MAX_VALUE) },
            source: "pdf-cos-syntax"
          });
          entryCount = null;
          currentObjectNum = null;
          startLineNbr++;
          continue;
        }

        if (newCurrentObjectNum < 0) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Subsection object number was negative: ${newCurrentObjectNum}`,
            range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, Number.MAX_VALUE) },
            source: "pdf-cos-syntax"
          });
          entryCount = null;
          currentObjectNum = null;
          startLineNbr++;
          continue;
        }

        if ((entryCount !== null) && (entryCount > 0)) {
          this.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Expected ${entryCount} more entries before this subsection marker: ${entryStr}`,
            range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, Number.MAX_VALUE) },
            source: "pdf-cos-syntax"
          });
        }
        entryCount = newEntryCount;
        currentObjectNum = newCurrentObjectNum;
      } // \d+ \d+ = subsection marker

      startLineNbr++;
    } // for-each line in this cross reference table

    // Was free list terminated with an object number of 0?
    if (nextFreeObj != 0) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, Number.MAX_VALUE) },
        message: `Expected next free object to be object ${nextFreeObj}, but cross reference table ended. Free list of objects not chained correctly`,
        source: "pdf-cos-syntax"
      });
    }

    // Were there too few entries according to last subsection marker?
    if ((entryCount !== null) && (entryCount > 0)) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `Expected ${entryCount} more entries before end of cross reference table`,
        range: { start: Position.create(startLineNbr, 0), end: Position.create(startLineNbr, Number.MAX_VALUE) },
        source: "pdf-cos-syntax"
      });
    }
  }
}
