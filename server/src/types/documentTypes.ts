/**
 * Data structures shared between client and server.  
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
 */
'use strict';

import type { XrefInfoMatrix } from '../parser/XrefInfoMatrix';
import type { Diagnostic, DocumentSymbol } from 'vscode-languageserver';
import type { PDFToken } from './pdfToken';


/** 
 * settings for VSCode extension 
 */
export interface PDFCOSSyntaxSettings {

  /** maximum number of diagnostic problems reported */
  maxNumberOfProblems: number;

  /** 
   * whether or not to ignore premable (before `%PDF-x.y`) and 
   * postamble (after last `%%EOF`) junk bytes 
   */
  ignorePreambleAndPostamble: boolean;

  /**
   * whether or not to ignore cross reference entry line lengths 
   * (supposedly 20 bytes, but a very common issue) 
   */
  ignoreXRefLineLength: boolean;

  /** whether or not to enable verbose logging */
  verboseLogging: boolean;
}


/** 
 * Cached data about each PDF document that is open in VSCode 
 */
export interface PDFDocumentData {
  /** cross reference table data */
  xrefMatrix: XrefInfoMatrix;

  /** Ohm parser semantic tokens & modifiers */
  ohmParseResults: PDFToken[]; 

  /** diagnostics from parsing, cross reference table, etc. */
  diagnosticsList: Diagnostic[]; 

  /** outline tree / breadcrumbs */
  outlineTree: DocumentSymbol[]; 

  /** raw bytes from PDF - NOT processed via VSCode as UTF-8!! */
  rawPDFBytes: Uint8Array; 
}
