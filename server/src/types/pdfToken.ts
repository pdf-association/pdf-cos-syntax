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


/** 
 * Ohm.js parser semantic token object.
 * Currently does not support tokens that can span lines. 
 */
export interface PDFToken {
  /** the type of semantic token */
  type: string;

  /** line number in VSCode. \>= 0 */
  line: number,

  /** starting offset in  {@link line} in VSCode. \>= 0, \<= {@link end} */
  start: number;

  /** ending offset of token in {@link line} in VSCode. \>= 0, \>= {@link start} */
  end: number;

  /**
   * Nesting depth: 0 = structural keywords, markers, direct objects. 1 = streams, xref entries and data inside direct objects.
   * Always \>= 0. Relative to CORRECTNESS, not actual PDF.
   * Dictionary and array start/end tokens are at +1 depth. 
   */
  depth: number;

  /** custom properties, depends on {@link "type"} */
  [key: string]: number | string | boolean;
}
