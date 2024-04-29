/**
 * Token from Ohm-based tokenizing parser. Shared between client and server.
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


/** Ohm parser semantic token object */
export interface PDFToken {
  /** the type of semantic token */
  type: string;

  /** line number in VSCode. \>= 0 */
  line: number,

  /** starting offset in  {@link line} in VSCode. \>= 0, \<= {@link end} */
  start: number;

  /** ending offset of token in {@link line} in VSCode. \>= 0, \>= {@link start} */
  end: number;

  /** custom properties, depends on {@link "type"} */
  [key: string]: any;
}
