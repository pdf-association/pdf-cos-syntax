/**
 * Ohm-based parser actions for each token.
 *
 * @copyright Copyright 2026 PDF Association, Inc. https://www.pdfa.org
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

import type {
  IterationNode,
  NonterminalNode,
  TerminalNode
} from 'ohm-js';

// File aware Ohm.js parser
// There is also an alternate token-only based Ohm.js parser
import grammar from './grammar/pdfFile.ohm-bundle.js';
import type { PDFFileActionDict } from './grammar/pdfFile.ohm-bundle.js';

import type { PDFToken } from "./types/index.ts";

let lineNbr: number = 1;

let nesting_depth: number = 0;

export function PDF(
  this: NonterminalNode, 
  arg0: NonterminalNode, 
  arg1: IterationNode, 
  arg2: IterationNode): PDFToken[] {
  return [];
}

export function header(
  this: NonterminalNode, 
  arg0: TerminalNode, 
  arg1: NonterminalNode, 
  arg2: TerminalNode,
  arg3: NonterminalNode,
  arg4: IterationNode,
  arg5: NonterminalNode): PDFToken[] {
  return []; 
}

export function binary_marker(this: NonterminalNode, arg0: TerminalNode, arg1: TerminalNode, arg2: TerminalNode, arg3: TerminalNode, arg4: TerminalNode, arg5: IterationNode, arg6: NonterminalNode): PDFToken[] { return []; }

export function revision(this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: IterationNode, arg3: NonterminalNode): PDFToken[] { return []; }

export function indirect_ref(this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: IterationNode, arg3: IterationNode, arg4: IterationNode, arg5: TerminalNode): PDFToken[] { return []; }

export function direct_object(this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode, arg2: TerminalNode, arg3: IterationNode): PDFToken[] { return []; }

export function obj_start(this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: NonterminalNode, arg3: IterationNode, arg4: NonterminalNode, arg5: TerminalNode): PDFToken[] { return []; }

export function stream(this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode, arg2: TerminalNode, arg3: IterationNode, arg4: NonterminalNode, arg5: NonterminalNode, arg6: TerminalNode, arg7: IterationNode): PDFToken[] { return []; }

export function stream_data(this: NonterminalNode, arg0: IterationNode): PDFToken[] { return []; }

export function pdf_object(
  this: NonterminalNode, 
  arg0: NonterminalNode
): PDFToken[] { 
  return []; 
}


export function dictionary(
  this: NonterminalNode, 
  arg0: TerminalNode, 
  arg1: IterationNode, 
  arg2: IterationNode, 
  arg3: IterationNode, 
  arg4: TerminalNode, 
  arg5: IterationNode | NonterminalNode
): PDFToken[] {
  return []; 
}

export function key_value_pair(
  this: NonterminalNode, 
  arg0: NonterminalNode
): PDFToken[] {
  return []; 
}

export function dict_pair(
  this: NonterminalNode, 
  arg0: TerminalNode, 
  arg1: NonterminalNode, 
  arg2: IterationNode | NonterminalNode
): PDFToken[] {
  return []; 
}

export function type_pair(
  this: NonterminalNode, 
  arg0: TerminalNode, 
  arg1: IterationNode | TerminalNode, 
  arg2: NonterminalNode
): PDFToken[] { 
  return []; 
}

export function subtype_pair(this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode | TerminalNode, arg2: NonterminalNode): PDFToken[] { return []; }

export function array(this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode, arg2: IterationNode, arg3: IterationNode, arg4: TerminalNode, arg5: IterationNode | NonterminalNode): PDFToken[] { return []; }

export function name_object(this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode): PDFToken[] { return []; }

export function valid_name_char(this: NonterminalNode, arg0: NonterminalNode): PDFToken[] { return []; }

export function name_hex_escape(this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode, arg2: NonterminalNode): PDFToken[] { return []; }

export function string_object(this: NonterminalNode, arg0: NonterminalNode): PDFToken[] { return []; }

export function string_literal(this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode, arg2: TerminalNode, arg3: IterationNode | NonterminalNode): PDFToken[] { return []; }

export function string_literal_char(this: NonterminalNode, arg0: NonterminalNode): PDFToken[] { return []; }

export function string_literal_escape(this: NonterminalNode, arg0: NonterminalNode | TerminalNode): PDFToken[] { return []; }

export function octal(this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode, arg2: NonterminalNode, arg3: NonterminalNode): PDFToken[] { return []; }

export function octal_digit(this: NonterminalNode, arg0: TerminalNode): PDFToken[] { return []; }

export function escaped_eol(this: NonterminalNode, arg0: TerminalNode, arg1: NonterminalNode): PDFToken[] { return []; }

export function hex_string(this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode, arg2: TerminalNode, arg3: IterationNode | NonterminalNode): PDFToken[] { return []; }

export function number_object(this: NonterminalNode, arg0: NonterminalNode): PDFToken[] { return []; }

export function integer_object(this: NonterminalNode, arg0: IterationNode, arg1: IterationNode): PDFToken[] { return []; }
export function real_object(this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: IterationNode, arg3: IterationNode): PDFToken[] { return []; }

export function bool_object(this: NonterminalNode, arg0: TerminalNode): PDFToken[] { return []; }

export function null_keyword(this: NonterminalNode, arg0: TerminalNode): PDFToken[] { return []; }

export function xref(this: NonterminalNode, arg0: IterationNode, arg1: NonterminalNode, arg2: TerminalNode, arg3: IterationNode, arg4: NonterminalNode, arg5: IterationNode): PDFToken[] { return []; }

export function xref_subsection(this: NonterminalNode, arg0: NonterminalNode, arg1: IterationNode): PDFToken[] { return []; }

export function xref_subsection_marker(this: NonterminalNode, arg0: IterationNode, arg1: IterationNode, arg2: TerminalNode, arg3: IterationNode, arg4: IterationNode, arg5: NonterminalNode): PDFToken[] { return []; }

export function xref_10entry(this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode, arg3: NonterminalNode, arg4: NonterminalNode, arg5: NonterminalNode, arg6: NonterminalNode, arg7: NonterminalNode, arg8: NonterminalNode, arg9: NonterminalNode): PDFToken[] { return []; }

export function xref_5entry(this: NonterminalNode, arg0: NonterminalNode, arg1: NonterminalNode, arg2: NonterminalNode, arg3: NonterminalNode, arg4: NonterminalNode): PDFToken[] { return []; }

export function xref_entry(this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: NonterminalNode, arg3: TerminalNode, arg4: TerminalNode, arg5: NonterminalNode | TerminalNode, arg6: TerminalNode): PDFToken[] { return []; }

export function trailer(this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: IterationNode, arg3: NonterminalNode, arg4: IterationNode): PDFToken[] { return []; }

export function startxref(this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: IterationNode, arg3: NonterminalNode, arg4: IterationNode, arg5: IterationNode, arg6: IterationNode, arg7: NonterminalNode): PDFToken[] { return []; }

export function eof(this: NonterminalNode, arg0: NonterminalNode, arg1: TerminalNode, arg2: IterationNode): PDFToken[] { return []; }

export function delimiter(this: NonterminalNode, arg0: NonterminalNode): PDFToken[] { return []; }

export function start_delimiter(this: NonterminalNode, arg0: TerminalNode): PDFToken[] { return []; }

export function end_delimiter(this: NonterminalNode, arg0: TerminalNode): PDFToken[] { return []; }

export function ws_incl_eol_comment(this: NonterminalNode, arg0: NonterminalNode | TerminalNode): PDFToken[] { return []; }

export function ws_incl_eol(this: NonterminalNode, arg0: NonterminalNode | TerminalNode): PDFToken[] { return []; }

export function ws_no_eol(this: NonterminalNode, arg0: TerminalNode): PDFToken[] { return []; }

export function comment(this: NonterminalNode, arg0: TerminalNode, arg1: IterationNode, arg2: NonterminalNode): PDFToken[] { return []; }

export function eol(
  this: NonterminalNode, 
  arg0: TerminalNode
): PDFToken[] {
  return [];
}
