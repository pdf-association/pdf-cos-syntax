/**
 * @brief VSCode semantic tokens and modifiers. Shared between client and server.  
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

export const TOKEN_TYPES = [
  'header',
  'endobj',
  // 'pdf_token',
  'indirect_object_start',
  'stream',
  'endstream',
  'dict_start',
  'dict_end',
  'array_start',
  'array_end',
  'name',
  // 'valid_name_char',
  // 'name_hex_escape',

  'string_literal',

  // 'string_literal_char',
  // 'string_literal_escape',
  // 'octal',
  // 'octal_digit',
  // 'escaped_eol',

  'hex_string',
  'indirect_ref',
  'integer',
  'real',
  'bool',
  'null',
  'xref',
  'xref_10entry',
  'xref_5entry',
  'xref_entry',
  'trailer',
  'eof',
  'startxref',
  'comment',

  // 'eol',
  // 'delimiter',
  // 'start_delimiter',
  // 'end_delimiter',
  // 'ws_incl_eol',
  // 'ws_no_eol',
];

export const TOKEN_MODIFIERS = [
  'isDictKey', // only applies to 'name' objects
  'isArrayElement'  
];
