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
  'indirect_object_start',
  'stream',
  'endstream',
  'dict_start',
  'dict_end',
  'array_start',
  'array_end',
  'name',
  'string_literal',
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
];

export const TOKEN_MODIFIERS = [
  'isDictKey', // only applies to 'name' objects
  'isArrayElement'  
];
