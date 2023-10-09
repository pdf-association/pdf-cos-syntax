/**
 * @brief Conventional cross reference table and file structure information. Shared between client and server.  
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

export interface PDSCOSSyntaxSettings {
  maxNumberOfProblems: number;
}

export type PDFDocumentData = {
  settings: PDSCOSSyntaxSettings;
  xrefMatrix?: XrefInfoMatrix;
};
