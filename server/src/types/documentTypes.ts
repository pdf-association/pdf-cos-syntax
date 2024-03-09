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
import { Diagnostic } from 'vscode-languageserver';

export interface PDFCOSSyntaxSettings {
  maxNumberOfProblems: number;
  ignorePreambleAndPostamble: boolean;
  ignoreXRefLineLength: boolean;
  verboseLogging: boolean;
}

export type OhmParseResults = {
  // Define the structure of your Ohm parse results here
};

export type OutlineTree = {
  // Define the structure of your outline tree here
};

export type PDFDocumentData = {
  settings: PDFCOSSyntaxSettings;
  xrefMatrix?: XrefInfoMatrix;
  ohmParseResults?: OhmParseResults; // Add Ohm parse results
  diagnosticsList?: Diagnostic[]; // Add diagnostics list using LSP Diagnostic type or similar
  outlineTree?: OutlineTree; // Add outline tree
  rawPDFBytes?: Uint8Array; // Add raw PDF bytes
};