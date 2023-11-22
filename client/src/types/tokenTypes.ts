/**
 * @brief Token from Ohm-based tokenizing parser. Shared between client and server.
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

export interface PDFToken {
  line: number,
  start: number;
  end: number;
  type: string;
  [key: string]: any;
}

export enum StreamType {
  Image,
  Text,
  EmbeddedJavaScript,
  EmbeddedXML,
  Binary, // For streams that should not be highlighted (compressed, encrypted, etc.)
  Unknown // Use this for streams where the type can't be determined
}

