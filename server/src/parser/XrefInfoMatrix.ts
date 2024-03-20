/**
 * Manages the cross-reference table for a PDF file 
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
 * 
 * TERMINOLOGY
 * 
 * - conventional cross reference PDF = only PDF uses `xref` keyword for 
 *      all cross reference data. Supported by this VSCode extension.
 * 
 * - cross reference stream PDF = PDF 1.5 and later files that only use XRefStm streams.
 *      `xref` keyword does not exist.  NOT supported by this VSCode extension!!!
 * 
 * - hybrid reference PDF = PDF uses both `xref` keyword AND XRefStm streams as 
 *      per subclause 7.5.8.4 in ISO 32000-2. NOT supported by this VSCode extension!!!
 * 
 * - Linearized PDF
 * 
 * - original PDF = the PDF excluding all revisions (incremental updates)
 *      Needs to define object 0 as the start of the free list so first
 *      cross reference subsection marker line should be `0 \\d+` where \\d+
 *      are the number of objects in the original PDF  
 * 
 * - object number = mostly \> 0 (as object 0 is the start of freelist in the original PDF)
 * 
 * - generation number = always \>= 0
 * 
 * - object ID = object number AND generation number pair
 * 
 * - revision = PDF as defined by the addition of a single incremental update
 * 
 * - object entry = \\d\{10\} \\d\{5\} (f|n) - supposedly 20 byte entries
 *       Object number is only known by calculating from previous sub-section marker line
 * 
 * - sub-section marker line = line with 2 integers demarcating the start of a new subsection \\d+ \\d+
 *       1st number = starting object number - should only be ZERO in original PDF
 *       2nd number = number of objects - can be ZERO in a revision!
 * 
 * - sub-section = object entries below each sub-section marker line (\\d+ \\d+)
 *       Note that a cross reference sub-section is technically OPTIONAL in a revision 
 *       as the number of entries in a sub-section can be ZERO. Cannot be ZERO for the
 *       original PDF.
 * 
 * - section = comprises zero or more cross reference sub-sections.
 * 
 * - table = the amalgamation of one or more cross reference sections in a PDF
*/
'use strict';

import { Diagnostic, DiagnosticSeverity, DocumentUri, Position } from 'vscode-languageserver';
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from 'fs';
import * as path from 'path';


export class EntryNode {
  constructor(
    /** ABSOLUTE line number of a cross reference entry in VSCode's `TextDocument`.
     *  May not match line number in PDF due to binary data!
     */
    public lineNbr: number,   

    /** Object number (as determined by number of lines since previous cross reference subsection marker line) */        
    public objectNum: number,   

    /** \\d\{10\}: if in-use = PDF byte offset, if free = next object number in free list or 65535 (or 0?) */      
    public first: number,

    /** \\d\{5\}: generation number always \>= 0. Expected to match `Y` in `X Y obj` for in-use objects. */   
    public generationNumber: number,  

    /** (`f` (free) | `n` (in-use)): true iff `n`, false if `f` */
    public inUse: boolean             
  ) {}
}


export class XrefInfoMatrix {
  /** 
   * 2D sparse matrix cross reference table for the PDF 
   * (all sections + sub-sections):
   * - 1st index = object number (all generation numbers)
   * - 2nd index = file revision: 
   *     * 0 = original PDF
   *     * 1 = oldest (1st) revision (incremental update)
   *     * 2 = 2nd oldest revision, etc.
   */
  private matrix: EntryNode[][] = [];

  /**
   * total number of file revisions in the PDF
   */
  private maxRevision: number = 0;

  /** 
   * Set of diagnostics generated when building cross-reference 
   * information. May be empty. 
   */
  public diagnostics: Diagnostic[] = [];


  /** 
   * Saves the sparse cross reference matrix to a CSV file ("-xref.csv" appended) where:
   * - column A: object number
   * - columns B-: changes in each revision (incl. byte offset and line numbers)
   * 
   * @param uri - filename (will have ".csv" appended)
   */
  public saveToCSV(uri: DocumentUri): void {
    let csv: string = ""; // CSV = lines with "\n"

    // Add title row
    let line: string = `"Object Number","Original"`;
    for (let i = 1; i < this.maxRevision; i++) {
      line = line + `,"Revision ${i}"`;
    }
    csv = csv + line + "\n";

    /** @todo - doesn't take into account different generation numbers for objects */
    for (let objNum = 0; objNum < this.matrix.length; objNum++) {
      if (this.matrix[objNum]) {
        line = `${objNum}`;
        for (let revNum = 0; revNum < this.matrix[objNum].length; revNum++) {
          if (this.matrix[objNum][revNum]) {
            if (this.matrix[objNum][revNum].inUse) {
              // in-use object
              line = line + `,"in-use @ offset ${this.matrix[objNum][revNum].first} (line ${this.matrix[objNum][revNum].lineNbr})"`;
            }
            else {
              // free object
              line = line + `,"free (line ${this.matrix[objNum][revNum].lineNbr})"`;
            }
          }
          else {
            // revision "rev" did not redefine this object so skip this column
            line = line + `,`;
          }
        }
        csv = csv + line + "\n";
      }
      else {
        // object "objNum" was never explicitly defined (so free by implication) --> skip row entirely
      }
    }

    // Convert URI "file:///" to a local file reference
    let fname = uri.replace("file:///", ""); 
    fname = fname.replace("%3A", ":");
    fname = path.normalize(fname + "-xref.csv");
    fs.writeFile(fname, csv.toString(), function(err) {
      if (err) {
          return console.error(err);
      }
      console.log(`File "${fname}" created!`);
    });
  }


  /** 
   * Has this Object Number (with ANY generation number) ever been explicitly defined 
   * as free or in-use in any sub-section of any revision?
   */
  public isObjectNumberValid(objectNumber: number): boolean {
    return this.matrix[objectNumber] !== undefined;
  }

  /** 
   * Was this object ID (object number and generation number pair) ever defined as in-use?
   * This means `X Y obj`...`endobj` should exist somewhere in the PDF, even if it is free in the
   * final version PDF.
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
   * Find the Object Number of the entry in the cross reference data of an object that is at `byteOffset`
   * ensuring to match the generation number. 
   * @param byteOffset - byte offset (_as PDF byte offset, not VSCode offset!_) of start of `X Y obj` in a body section of the PDF.
   *     Note that due to VSCode mangling binary data, VSCode offsets need to be converted to PDF byte offsets. 
   * @param generationNumber - the generation number `Y` of `X Y obj` in a body section of the PDF
   * @param flag - either `n` for an in-use object or `f` for a free object
   * @returns the object number as determined by the cross-reference table data or -1 if not found.
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
   * Was this **object ID** (object number and generation number pair) ever defined as in-use?
   * This means a `X Y obj` should also exist in PDF. 
   * 
   * @returns the byte offset in the PDF or -1 if not found.
   * This PDF byte offset then needs to be converted to a VSCode line number to estimate where 
   * the PDF object `X Y obj` ... `endobj` is approximately located.
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
   * @returns the _first_ cross reference section entry line number for a given Object ID (object number and 
   * generation number pair, such as from `X Y R` or `X Y obj`). Returns -1 if no match.
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
   * @returns Get the complete list of in-use object ID's across all revisions. 
   * Might be empty array `[]` if the object ID was not in any cross reference section. 
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
   * @returns Get the complete revision list of an object's changes across all revisions. 
   * Might be empty array `[]` if the object number was not in any cross reference section. 
   */
  public getObjectNumberEntries(objectNumber: number): EntryNode[]  {
    return this.isObjectNumberValid(objectNumber) ? this.matrix[objectNumber] : [];
  }

  /**
   * Finds ALL conventional cross reference sections and merges them into a single mega-matrix.
   * Conventional cross reference sections start with `xref` and end with `trailer`, or `startxref`
   * keyword for hybrid reference PDFs - assuming no syntax errors. 
   * Starts from TOP of the PDF for zero-based revision numbering.
   * @param pdfFile - text of a PDF file
   */
  public mergeAllXrefSections(pdfFile: TextDocument) {
    let revision = 0;
    let pdf = pdfFile.getText();

    // Normalize PDF EOLs to `\n` so Position <--> Offsets work. DOESN'T ALTER BYTE OFFSETS!
    pdf = pdf.replace('\\r\\n', ' \\n');
    pdf = pdf.replace('\\r', '\\n');

    let xrefStart = 0;
    let startXref = 0;
    do {
      // NOTE: indexOf("xref") will ALSO match "startxref" so need special handling!!!
      xrefStart = pdf.indexOf("xref", startXref + "startxref".length);
      startXref = pdf.indexOf("startxref", startXref + "startxref".length);
    }
    while (startXref === xrefStart + "start".length);

    // Did we find the `xref` keyword start to a conventional cross reference section?
    if (xrefStart === -1) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `No conventional cross reference sections were found - "xref" keyword missing`,
        range: { start: Position.create(0, 0), end: Position.create(0, Number.MAX_VALUE) },
        source: "pdf-cos-syntax"
      });
    }

    // Did we find the `startxref` start that is near the end of a file revision?
    if (startXref === -1) {
      this.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `"startxref" keyword missing`,
        range: { start: Position.create(0, 0), end: Position.create(0, Number.MAX_VALUE) },
        source: "pdf-cos-syntax"
      });
    }

    // Locate end of conventional cross reference section: "trailer" or "startxref" keywords
    let xrefEnd = pdf.indexOf("trailer", xrefStart + "xref".length);
    if (xrefEnd < 0) {
      // Hybrid PDFs may not have `trailer` keyword, so rely on `startxref`
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

      // Add this cross-reference section
      this.addXrefSection(pdfFile.positionAt(xrefStart).line, revision, xrefTable);
      revision++;

      do {
        // NOTE: indexOf("xref") will ALSO match "startxref" so need special handling!!!
        xrefStart = pdf.indexOf("xref", startXref + "startxref".length);
        startXref = pdf.indexOf("startxref", startXref + "startxref".length);
      }
      while (startXref === (xrefStart + "start".length)); // will also stop on -1

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

    this.maxRevision = revision;
    console.log(`Found ${revision} conventional cross reference sections.`);
  }

  /**
   * Merges a _single_ conventional cross reference section into the matrix. `xref`
   * keyword can be the first line. Stops if `trailer`, `startxref` or `%%EOF` is found.
   * Also captures basic sanity check/validation issues.
   * 
   * @param startLineNbr - is an ABSOLUTE line number in VSCode's PDF TextDocument.
   * @param revision - revision of PDF file (0 = original PDF, 1 = 1st revision, etc)
   * @param xref - the text of the cross-reference section (from VSCode so any binary data
   *     may be messed up - but there shouldn't be any!) 
   */
  private addXrefSection(startLineNbr: number, revision: number, xref: string) {
    let currentObjectNum: number | null = null;
    let entryCount: number | null = null;
    let nextFreeObj: number | null = null; // Free list always starts with object 0

    let xrefLines = xref.split('\n');

    // Remove any first line that is "xref" keyword
     if (xrefLines[0].startsWith("xref")) {
      startLineNbr++;
      xrefLines = xrefLines.slice(1);
    }
    
    for (const entryStr of xrefLines) {
      const trueLen = entryStr.length; // before any trim!

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
          if (nextFreeObj && (nextFreeObj != currentObjectNum)) {
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
        if (entryCount <= 0) entryCount = null;
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
    if (nextFreeObj && (nextFreeObj != 0)) {
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
