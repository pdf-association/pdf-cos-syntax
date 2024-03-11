/**
 * @brief Data structures shared between client and server.  
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
'use strict';

import { XrefInfoMatrix } from '../parser/XrefInfoMatrix';
import { Diagnostic, DocumentSymbol } from 'vscode-languageserver';
import { PDFToken } from './tokenTypes';

export interface PDFCOSSyntaxSettings {
  /** @property maximum number of diagnostic problems reported */
  maxNumberOfProblems: number;

  /** 
   * @property whether or not to ignore premable (before `%PDF-x.y`) and 
   * postamble (after last `%%EOF`) junk bytes 
   * */
  ignorePreambleAndPostamble: boolean;

  /**
   *  @property whether or not to ignore cross reference entry line lengths 
   * (supposedly 20 bytes, but a very common issue) 
   */
  ignoreXRefLineLength: boolean;

  /** @property whether or not to enable verbose logging */
  verboseLogging: boolean;
}


export interface PDFDocumentData {
  /** @property current settings */
  settings: PDFCOSSyntaxSettings;

  /** @property cross reference table data */
  xrefMatrix: XrefInfoMatrix;

  /** @property Ohm parser results */
  ohmParseResults: PDFToken[]; 

  /** @property diagnostics from parsing, cross reference table, etc. */
  diagnosticsList: Diagnostic[]; 

  /** @property outline tree / breadcrumbs */
  outlineTree: DocumentSymbol[]; 

  /** @property raw bytes from PDF - NOT processed via VSCode as UTF-8!! */
  rawPDFBytes: Uint8Array; 
}
