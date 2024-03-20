/**
 * A marker-based PDF parser that classifies ranges of bytes as certain types of "object"  
 *
 * @copyright Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * @remarks
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 *
 **************************************************************************
 * 
 * Notes on JavaScript/TypeScript regular expression and PDF lexical rules based on:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions
 *
 * - PDF whitespace are ONLY the 6 characters / \\t\\n\\r\\f\\0/
 *    - this is DIFFERENT to  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space
 *
 * - PDF EOL sequences are ONLY the 3: \\r, \\n, or \\r\\n
 *    - PDF files are NOT required to use consistent EOLs so there can be a mix!
 *    - this is DIFFERENT to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#line_terminators
 *
 * - official PDF delimiters (in addition to whitespace and EOL): / \<\>[]()\//
 *
 * - object IDs (object number and generation number pairs) CANNOT have '+'/'-' so /\\d+\\ is OK
 *
 * - JS space, Word and word boundary character classes (\\w, \\W, \\b, \\B, \\s, \\S) CANNOT be
 *    used as they do not match PDF's definition!!!
 *
 * - once all PDF EOLs are normalized to ONLY \\n, can then rely on string.startsWith(), etc.
 * 
 * - non-regex searching for "xref", "stream" and "obj" can mismatch to "startxref", "endstream" and "endobj"!
 *   Should use a regex with look-before for PDF whitespace or EOLs. BE CAREFUL WITH indexOf()!
 * 
 ******************************************************************************* 
 * 
 * This parser does a one-pass, start to end, forward scan of a full PDF file looking for start "markers" 
 * that indicate the physical arrangement of the PDF file. End markers (such as `endobj`, `endstream`) are 
 * processed afterwards on-demand, allowing determination of "cavities" or malformed objects as a result
 * of editing. The start markers are somewhat flexible in their matching to allow for editing (e.g. don't 
 * have be at the start of a line or even on one line). The PDF is treated as a single `string` and is
 * normalized to have `\n` EOLs.
 * 
 * The start markers are stored in a **sorted** array (by byte offset into the VSCode UTF-8 text).
 * `Position` and `Range` objects with line and character values are calculated based on the "master" offsets.
 * 
 * The concepts and terminology behind this marker-based parser are based around:
 *  - "revisions" where revision 0 is the original PDF, revision 1 is the 1st (oldest) 
 *     incremental update, etc.
 *  - a "section" is either a "header", "body", "cross-reference", or "footer" where:
 *     - "header" starts with `%[PF]DF-x.y` and continues until the next section
 *     - "body" starts with an indirect object `X Y obj` and ends when either a "cross 
 *       reference" or "footer" section starts. Revsion 0 should have a body (but may not 
 *       during editing) whereas incremental updates do _not_ require a body (e.g. if only
 *       the trailer dictionary is being modified). 
 *     - "cross reference" is _optional_ and is for conventional cross reference tables
 *       that start with keyword `xref` and end with the next section which should be the
 *       `trailer` keyword (but may not be during editing)
 *     - "footer" (not defined in ISO 32000!) starts with either the `trailer` or `startxref`
 *       keywords and continues to include either `%%EOF` or if that is missing the start
 *       of the next section.
 */
'use strict';

import { TextDocument, Position, Range } from "vscode-languageserver-textdocument";
import PDFObject from '../models/PdfObject';


/** The various different types of section supported by this parser */
export enum PDFSectionType {
  unset = '???', // must never occur!
  Header = 'Header',
  Body = 'Body',
  CrossReference = 'Cross Reference Table',
  Footer = 'Footer',
}


/** Simple start markers with the marker text and it's absolute offset position */
class PDFMarker {
  /** the text of the start marker */
  public readonly marker: string;

  /** the absolute byte offset to the start of the marker into the VSCode (UTF-8) text */
  public readonly offset: number;

  /** Revision number. -1 = unset. 0 = original PDF, 1 = oldest incremental update, etc. */
  public revision: number = -1;

  /** The section kind as classified by this parser */
  public section: PDFSectionType = PDFSectionType.unset;

  constructor(m: string, o: number) {
    this.marker = m;
    this.offset = o;
  }
}


/** Our marker-based PDF parser */
export default class PDFParser {
  /**
   *  The reference content of the PDF as a single VSCode (UTF-8) string.
   *  PDF line endings have been normalized to "\\n" 
   */
  private readonly _content: string;

  /**
   *  An **_ORDERED_** list of offsets for all the main structural start markers of a PDF
   *  are: `%PDF-x.y`, `X Y obj`, `xref`, `trailer`, `startxref`, `%%EOF`. 
   * 
   *  NOTE: `endobj` and `endstream` are NOT in these markers!
   */
  private readonly _markers: PDFMarker[];

  private readonly _NumRevisions: number;

  /**
   *  Regex for all the structural file start markers.
   *  Only headers do NOT have leading whitespace (as a look-before). All
   *  other start markers have look-before.
   */
  private readonly _markersRegex: RegExp = 
    /%[PF]DF-\d\.\d|(?<=[ \t\r\n\f\0])\d+[ \t\r\n\f\0]+\d+[ \t\r\n\f\0]+obj|(?<=[ \t\r\n\f\0>])stream|(?<=[ \t\r\n\f\0])xref|(?<=[ \t\r\n\f\0])trailer|(?<=[ \t\r\n\f\0])startxref|(?<=[ \t\r\n\f\0])%%EOF/g;

  /**
   * Regex for "endobj" keyword (not a marker!)
   */
  private readonly _endobjRegex: RegExp = /(?<=[ \t\r\n\f\0])endobj/g;

  /**
   * Regex for "endstream" keyword (not a marker!)
   */
  private readonly _endstreamRegex: RegExp = /(?<=[ \t\r\n\f\0])endstream/g;

  /** 
   * Normalize PDF line endings but keep character counts unchanged. 
   * This parser ONLY checks and splits with "\\n"!
   */
  constructor(document: TextDocument) {
    this._content = document.getText();
    this._content = this._content.replace(/\r\n/g, " \n");
    this._content = this._content.replace(/\r/g, "\n");

    // Work out where all the markers are located (in order)
    this._markers = [];
    let match;  
    while ((match = this._markersRegex.exec(this._content)) !== null) {
      this._markers.push(new PDFMarker(match[0], match.index));
    }

    /** work out sections and revisions */
    this._NumRevisions = -1;
    let currentSection: PDFSectionType = PDFSectionType.unset;

    for (let i: number = 0; i < this._markers.length; i++) {
      switch (this._markers[i].marker) {
        case "stream":
          if ((this._NumRevisions === -1) || (currentSection === PDFSectionType.Footer))
            this._NumRevisions++;
          currentSection = PDFSectionType.Body;
          if (this._NumRevisions === -1) this._NumRevisions = 0; // malformed file 
          this._markers[i].revision = this._NumRevisions;
          this._markers[i].section = currentSection; 
          break;
        case "xref":
          if ((this._NumRevisions === -1) || (currentSection === PDFSectionType.Footer))
            this._NumRevisions++;
          currentSection = PDFSectionType.CrossReference;
          if (this._NumRevisions === -1) this._NumRevisions = 0; // malformed file 
          this._markers[i].revision = this._NumRevisions;
          this._markers[i].section = currentSection; 
          break;
        case "trailer":
        case "startxref":
        case "%%EOF":
          currentSection = PDFSectionType.Footer;
          this._markers[i].revision = this._NumRevisions;
          this._markers[i].section = currentSection; 
          break;
        default:
          // variable text for "%[PF]DF-x.y" and "X Y obj"!
          if (this._markers[i].marker.startsWith("%PDF-") || this._markers[i].marker.startsWith("%FDF-")) {
            if (currentSection !== PDFSectionType.Header) {
              currentSection = PDFSectionType.Header;
              this._NumRevisions++;
            }
            if (this._NumRevisions === -1) this._NumRevisions = 0; // malformed file 
            this._markers[i].revision = this._NumRevisions;
            this._markers[i].section = currentSection; 
          }
          else { // "X Y obj"
            if ((this._NumRevisions === -1) || (currentSection === PDFSectionType.Footer))
              this._NumRevisions++;
            currentSection = PDFSectionType.Body;
            if (this._NumRevisions === -1) this._NumRevisions = 0; // malformed file 
            this._markers[i].revision = this._NumRevisions;
            this._markers[i].section = currentSection; 
          }
          break;
      }
    }

    // console.log(JSON.stringify(this._markers, null, 2)); // review the markers
  }

  /**
   * @returns the number of revisions in the PDF. A revision count
   * of 1 means there is just an original PDF, 2 means there is also
   * one incremental update, etc. 
   */
  getNumRevisions(): number {
    return this._NumRevisions + 1;
  } 


  /**
   * @returns the ordered set of sections for the given revision. 
   * Order is based on the PDF file, which can be illogical when
   * editting. 
   */
  getRevisionSectionOrder(revision: number): PDFSectionType[] {
    const order: PDFSectionType[] = [];

    let startIdx: number;
    // Find the first marker for this revision
    for (startIdx = 0; startIdx < this._markers.length; startIdx++) {
      if (this._markers[startIdx].revision === revision)
        break;
    }

    // Find all the markers for this revision
    let i: number;
    order.push(this._markers[startIdx].section);
    for (i = startIdx; (i < this._markers.length) && (this._markers[i].revision === revision); i++) {
      if (this._markers[i].section !== order[order.length - 1])
        order.push(this._markers[i].section);
    }

    return order;
  }
  

  /** 
   * Convert an absolute byte offset to a Line/Character Position.
   * Note that Line and Character numbering are 0-based!
   */
  convertOffsetToPosition(offset: number): Position {
    const asLines = this._content.slice(0, offset).split("\n");
    let line = asLines.length - 1;
    if (line < 0) line = 0;
    let char = asLines[line].length - 1;
    if (char < 0) char = 0;
    // console.log(`convertOffsetToPosition(${offset}) --> line=${line}, char=${char}`);
    return { line: line, character: char };
  }


  /** 
   * @returns range from `%[PF]DF-x.y` to next section for a given revision of the PDF.
   * This range is **not** minimal and may include cavities, etc.
   */
  getHeaderRange(revision: number): Range {
    const foundHdr = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.Header) && (o.revision === revision)); 
    });
    if (foundHdr === -1) // No header anywhere 
      throw new Error(`Unexpected Header section range request for revision ${revision}.`);

    const startOffset: number = this._markers[foundHdr].offset;
    let endOffset: number;
    if (foundHdr < (this._markers.length - 1))
      endOffset = this._markers[foundHdr + 1].offset - 1;
    else
      endOffset = this._content.length;
    return { start: this.convertOffsetToPosition(startOffset), end: this.convertOffsetToPosition(endOffset) };
  }


  /**
   * @returns the range for all sections in a given revision. 
   * This range is **not** minimal and may include cavities, etc.
   */
  getRevisionRange(revision: number): Range {
    const revisionStartIdx = this._markers.findIndex((o: PDFMarker, index) => { 
      return (o.revision === revision); 
    });
    if (revisionStartIdx === -1) 
      throw new Error(`getRevisionRange() unexpected revision ${revision}.`);

    const revisionStartOffset = this._markers[revisionStartIdx].offset;
    let revisionEndOffset: number;
    if (revisionStartIdx >= this._markers.length - 1) 
      revisionEndOffset = this._content.length;
    else {
      let foundEnd: number = revisionStartIdx + 1;
      while ((foundEnd < this._markers.length) && 
             (this._markers[foundEnd].revision === revision))
        foundEnd++;
      if (foundEnd < this._markers.length)
        revisionEndOffset = this._markers[foundEnd].offset - 1;
      else
        revisionEndOffset = this._content.length;
    }

    return { start: this.convertOffsetToPosition(revisionStartOffset), end: this.convertOffsetToPosition(revisionEndOffset) };
  }


  /**
   * @returns the range for all body objects starting with 1st full object `X Y obj` 
   * to `endobj` in the file, up to the 1st marker which is not a `X Y obj` for a
   * given revision. This range is **not** minimal and may include cavities, etc.
   */
  getBodyRange(revision: number): Range {
    const bodyStartIdx = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.Body) && (o.revision === revision)); 
    });
    if (bodyStartIdx === -1) 
      throw new Error(`Unexpected Body section request for revision ${revision}.`);

    const bodyStartOffset = this._markers[bodyStartIdx].offset;
    let bodyEndOffset: number;
    if (bodyStartIdx >= this._markers.length - 1) 
      bodyEndOffset = this._content.length;
    else {
      let foundEnd: number = bodyStartIdx + 1;
      while ((foundEnd < this._markers.length) && 
             (this._markers[foundEnd].section === PDFSectionType.Body) &&
             (this._markers[foundEnd].revision === revision))
        foundEnd++;
      if (foundEnd < this._markers.length)
        bodyEndOffset = this._markers[foundEnd].offset - 1;
      else
        bodyEndOffset = this._content.length;
    }

    return { start: this.convertOffsetToPosition(bodyStartOffset), end: this.convertOffsetToPosition(bodyEndOffset) };
  }


  /**
   * @returns every object in the specified revision of the PDF file.
   * Partitions from `X Y obj` marker to the next `endobj` keyword. 
   */
  getBodyObjects(revision: number): PDFObject[] {
    const objects: PDFObject[] = [];

    let idx = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.Body) && (o.revision === revision)); 
    });
    if (idx === -1) return [];

    // Find "X Y obj" markers and determine end of object.
    while ((idx < this._markers.length) && 
        (this._markers[idx].section === PDFSectionType.Body) &&
        (this._markers[idx].revision === revision)) {
      if (this._markers[idx].marker.endsWith("obj")) {
        const startObjOffset = this._markers[idx].offset;
        let endObjOffset: number;
        let startStmOffset: number = -1;
        let endStmOffset: number = -1;
        if (idx < (this._markers.length - 2)) {
          // At least 2 markers before end of markers...
          if (this._markers[idx + 1].marker === "stream") {
            // "stream" marker
            startStmOffset = this._markers[idx + 1].offset;

            // Find the next marker that would be the start of the next object
            // (allowing for malformed PDFs with multiple stream keywords)
            let i = idx + 2;
            while ((i < this._markers.length) && (this._markers[i].marker === "stream"))
              i++;
            if (i < this._markers.length)
              endObjOffset = this._markers[i].offset - 1;  
            else
              endObjOffset = this._content.length;
          }
          else {
            endObjOffset = this._markers[idx + 1].offset - 1;  
          }
        }
        else if (idx === (this._markers.length - 1)) {
          // Only 1 marker before end of markers - malformed PDF
          if (this._markers[idx + 1].marker === "stream") {
            startStmOffset = this._markers[idx + 1].offset;
            endObjOffset =  this._content.length;
          }
          else {
            endObjOffset = this._markers[idx + 1].offset - 1;  
          }
        }
        else {
          console.warn(`Marker[${idx}] ${this._markers[idx].marker} is at the very end of the markers!`);
          endObjOffset = this._content.length;
        }

        const objData = this._content.slice(startObjOffset, endObjOffset);

        let localRegexNotSticly = new RegExp(this._endobjRegex);
        const matchEndobj = localRegexNotSticly.exec(objData);
        if (matchEndobj) {
          endObjOffset = startObjOffset + matchEndobj.index + "endobj".length;
        }
        else {
          console.warn(`"endobj" was not found via regex!`);
        }

        localRegexNotSticly = new RegExp(this._endstreamRegex);
        const matchEndstream = localRegexNotSticly.exec(objData);
        if (matchEndstream) {
          endStmOffset = startObjOffset + matchEndstream.index + "endstream".length;
          if (startStmOffset === -1) {
            // Missing "stream" keyword in markers!
            startStmOffset = startObjOffset + matchEndstream.index;
          }
        }
        else if (startStmOffset !== -1) {
          console.warn(`"endstream" keyword not found via regex!`);
          startStmOffset = -1; // ignore stream match
        }

        objects.push(new PDFObject(objData, startObjOffset, startStmOffset, endStmOffset));
      }
      idx++;
    }
    return objects;
  }


  /**
   * @returns the range for all footer subsections for a given revision.
   * A "footer" section can include `trailer`, `startxref` and `%%EOF`. 
   * This range is **not** minimal and may include cavities, etc.
   */
  getFooterRange(revision: number): Range {
    const footerStartIdx = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.Footer) && (o.revision === revision)); 
    });
    if (footerStartIdx === -1) 
      throw new Error(`Unexpected Footer section request for revision ${revision}.`);

    const footerStartOffset = this._markers[footerStartIdx].offset;
    let footerEndOffset: number;
    if (footerStartIdx >= this._markers.length - 1) 
      footerEndOffset = this._content.length;
    else {
      let foundEnd: number = footerStartIdx + 1;
      while ((foundEnd < this._markers.length) && 
             (this._markers[foundEnd].section === PDFSectionType.Body) &&
             (this._markers[foundEnd].revision === revision))
        foundEnd++;
      if (foundEnd < this._markers.length)
        footerEndOffset = this._markers[foundEnd].offset - 1;
      else
        footerEndOffset = this._content.length;
    }

    return { start: this.convertOffsetToPosition(footerStartOffset), end: this.convertOffsetToPosition(footerEndOffset) };
  }


  /** @returns true if given object contains a stream */
  hasObjectStreamInside(obj: PDFObject) : boolean {
    return obj.hasStream();
  }


  /** 
   * @returns a Range for an entire indirect object, from `X Y obj` 
   * up to corresponding `endobj` keyword. It may contain a stream.
   */
  getObjectRange(obj: PDFObject): Range {
    const startOffset = obj.getStartOffset();
    const endOffset = obj.getEndOffset();
    return { start: this.convertOffsetToPosition(startOffset), end: this.convertOffsetToPosition(endOffset) };
  }


  /** 
   * @returns a Range for a stream with an indirect object, from `stream` 
   * to corresponding `endstream` keyword. Or null if no stream.
   */
  getObjectStreamRange(obj: PDFObject): Range | null {
    if (!obj.hasStream()) 
      return null;

    const startStmOffset = obj.getStartStreamOffset();
    const endStmOffset = obj.getEndStreamOffset();
    return { start: this.convertOffsetToPosition(startStmOffset), end: this.convertOffsetToPosition(endStmOffset) };
  }


  /**
   * Gets a conventional cross reference table range within a Footer section.
   */
  getCrossReferenceTableRange(revision: number): Range {
    const footerStartXrefIdx = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.CrossReference) && 
              (o.revision === revision)); 
    });
    if (footerStartXrefIdx === -1)
      throw new Error(`Unexpected Cross reference section request for revision ${revision}.`);

    const footerStartXrefOffset = this._markers[footerStartXrefIdx].offset;
    let footerEndXrefOffset: number;
    if (footerStartXrefIdx >= this._markers.length - 1) 
      footerEndXrefOffset = this._content.length;
    else {
      let foundEnd: number = footerStartXrefIdx + 1;
      while ((foundEnd < this._markers.length) && 
             (this._markers[foundEnd].section === PDFSectionType.CrossReference) &&
             (this._markers[foundEnd].revision === revision))
        foundEnd++;
      if (foundEnd < this._markers.length)
        footerEndXrefOffset = this._markers[foundEnd].offset - 1;
      else
        footerEndXrefOffset = this._content.length;
    }

    return { start: this.convertOffsetToPosition(footerStartXrefOffset), end: this.convertOffsetToPosition(footerEndXrefOffset) };
  }


  /**
   * @returns which Footer subsections are present and in what order 
   */
  getFooterSubsections(revision: number): string[] {
    const footerStartIdx = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.Footer) && (o.revision === revision)); 
    });
    if (footerStartIdx === -1) 
      throw new Error(`Unexpected Footer sub-sections request for revision ${revision}.`);

    const subsections: string[] = [];
    subsections.push(this._markers[footerStartIdx].marker);

    let i = footerStartIdx + 1;
    while ((i < this._markers.length) &&
           (this._markers[i].section === PDFSectionType.Footer) && 
           (this._markers[i].revision === revision)) {
      if (this._markers[i].marker !== subsections[subsections.length - 1].toString())
        subsections.push(this._markers[i].marker);
      i++;
    }

    return subsections;
  }


  /**
   * Gets a footer subsection (`trailer`, `startxref`, `%%EOF`) range for a 
   * specified revision.
   */
  getFooterSubsectionRange(revision: number, subsection: string): Range {
    if ([ "trailer", "startxref", "%%EOF" ].findIndex((s: string) => (s === subsection)) === -1)
      throw new Error(`Unexpected footer subsection ${subsection}`);

    const footerSubsectionStartXrefIdx = this._markers.findIndex((o: PDFMarker) => { 
      return ((o.section === PDFSectionType.Footer) && 
              (o.marker === subsection) &&
              (o.revision === revision)); 
    });
    if (footerSubsectionStartXrefIdx === -1)
      throw new Error(`Unexpected footer sub-section request for ${subsection} for revision ${revision}.`);

    const footerSubsectionStartXrefOffset = this._markers[footerSubsectionStartXrefIdx].offset;
    let footerSubsectionEndXrefOffset: number;
    if (footerSubsectionStartXrefIdx >= this._markers.length - 1) 
      footerSubsectionEndXrefOffset = this._content.length;
    else {
      let foundEnd: number = footerSubsectionStartXrefIdx + 1;
      while ((foundEnd < this._markers.length) && 
             (this._markers[foundEnd].section === PDFSectionType.Footer) &&
             (this._markers[foundEnd].marker === subsection) &&
             (this._markers[foundEnd].revision === revision))
        foundEnd++;
      if (foundEnd < this._markers.length)
        footerSubsectionEndXrefOffset = this._markers[foundEnd].offset - 1;
      else
        footerSubsectionEndXrefOffset = this._content.length;
    }

    return { 
      start: this.convertOffsetToPosition(footerSubsectionStartXrefOffset), 
      end: this.convertOffsetToPosition(footerSubsectionEndXrefOffset) };
  }
}
