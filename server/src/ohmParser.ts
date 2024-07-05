/**
 * Ohm-based tokenizing parser running in LSP server.
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

import * as ohm from "ohm-js";
import * as fs from "fs";
import type { PDFToken } from "./types";
import * as path from "path";

const grammarPath = path.join(
  __dirname,
  "../src/grammar/grammar_pdfTokens.ohm"
);
const grammarString = fs.readFileSync(grammarPath, "utf-8");
const grammar = ohm.grammar(grammarString);

// Main entry point to Ohm parser called by LSP server
function getTokens(text: string): PDFToken[] {
  console.log(`getTokens(..) - Ohm`);
  let lineNbr = 1;
  let nesting_depth = 0;

  const semantics = grammar.createSemantics();

  semantics.addOperation<PDFToken[]>("extract", {
    _iter(...children) {
      let childTokenList: PDFToken[] = [];
      children.forEach((child, _index) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const childTokens: PDFToken[] = child.extract();
        childTokenList = childTokenList.concat(childTokens);
      });
      return childTokenList;
    },
    _terminal() {
      // ignore
      return [];
    },
    header(_1, majorVer, _3, minorVer, _5) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "header",
        depth: nesting_depth,
        content: majorVer.sourceString + "." + minorVer.sourceString,
      };
      return [token];
    },
    endobj(_1) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "endobj",
        depth: nesting_depth,
      };
      return [token];
    },
    direct_object_start(objNum, _2, genNum, _4, _5) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "direct_object_start",
        depth: nesting_depth,
        objNum: parseInt(objNum.sourceString),
        genNum: parseInt(genNum.sourceString),
      };
      return [token];
    },
    stream(_1) {
      nesting_depth = 1;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "stream",
        depth: nesting_depth,
      };
      return [token];
    },
    endstream(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "endstream",
        depth: nesting_depth,
      };
      nesting_depth = 0;
      return [token];
    },
    dict_start(_1) {
      nesting_depth = nesting_depth + 1;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "dict_start",
        depth: nesting_depth,
      };
      return [token];
    },
    dict_end(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "dict_end",
        depth: nesting_depth,
      };
      nesting_depth = nesting_depth - 1;
      return [token];
    },
    array_start(_1) {
      nesting_depth = nesting_depth + 1;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "array_start",
        depth: nesting_depth,
      };
      return [token];
    },
    array_end(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "array_end",
        depth: nesting_depth,
      };
      nesting_depth = nesting_depth - 1;
      return [token];
    },
    name(_1, characters) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "name",
        content: characters.sourceString,
        depth: nesting_depth,
      };
      return [token];
    },
    string_literal(_1, content, _2) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "string_literal",
        content: content.sourceString,
        depth: nesting_depth,
      };
      return [token];
    },
    hex_string(_1, content, _2) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "hex_string",
        content: content.sourceString,
        depth: nesting_depth,
      };
      return [token];
    },
    indirect_ref(objNum, _2, genNum, _3, _4) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "indirect_ref",
        depth: nesting_depth,
        objNum: parseInt(objNum.sourceString),
        genNum: parseInt(genNum.sourceString),
      };
      return [token];
    },
    integer(sign, digits) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "integer",
        depth: nesting_depth,
        content: parseInt(sign.sourceString + digits.sourceString)
      };
      return [token];
    },
    real(sign, part1, dot, part2) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "real",
        depth: nesting_depth,
        content: parseFloat(
            sign.sourceString +
            part1.sourceString +
            dot.sourceString +
            part2.sourceString
        ),
      };
      return [token];
    },
    bool(value) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "bool",
        depth: nesting_depth,
        content: value.sourceString === "true",
      };
      return [token];
    },
    null(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "null",
        depth: nesting_depth,
      };
      return [token];
    },
    xref(_1) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref",
        depth: nesting_depth,
      };
      return [token];
    },
    xref_10entry(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10) {
      // ignore - wait for xref_entry
      return [];
    },
    xref_5entry(_1, _2, _3, _4, _5) {
      // ignore - wait for xref_entry
      return [];
    },
    xref_entry(tenEntry, _1, fiveEntry, _2, status) {
      nesting_depth = 1;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_entry",
        depth: nesting_depth,
        tenEntry: parseInt(tenEntry.sourceString),
        fiveEntry: parseInt(fiveEntry.sourceString),
        status: status.sourceString,
      };
      return [token];
    },
    trailer(_1) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "trailer",
        depth: nesting_depth,
      };
      return [token];
    },
    eof(_1) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "eof",
        depth: nesting_depth,
      };
      return [token];
    },
    startxref(_1) {
      nesting_depth = 0;
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "startxref",
        depth: nesting_depth,
      };
      return [token];
    },
    comment(_1, _commentText, _2) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "comment",
        depth: nesting_depth,
        // content: commentText.sourceString, // no need to keep comment itself
      };
      return [token];
    },
  });

  // Tokenize line-by-line
  const lines = text.split("\n");
  let insideStream = false;
  let tokenList: PDFToken[] = [];
  for (const line of lines) {
    if (insideStream) {
      // be robust to live editing to re-start parser at end of a stream
      if (
        line.trim().startsWith("endstream") ||
        line.trim().startsWith("endobj") ||
        line.trim().match(/\\d+[ \t\f\0\r\n]+\\d+[ \t\f\0\r\n]+obj/)
      ) {
        insideStream = false; // fallthrough and let Ohm parse this line fully to get token locations
      }
    }

    if (!insideStream && line.trim().length > 0) {
      const matchResult: ohm.MatchResult = grammar.match(line + "\n"); // restore '\n' so parser sees it
      if (matchResult.failed()) {
        // This will fail for multi-line tokens such as literal and hex strings
        /// cannot span multiple lines: https://github.com/microsoft/vscode/blob/3be5ad240bd78db6892e285cb0c0de205ceab126/src/vs/workbench/api/common/extHostTypes.ts#L3261
        /** @todo - Could retry by stitching a few lines together, but VSCode SemanticTokens wants per line */
        console.log(`Line ${lineNbr}: getTokens() failed! "${line.trim()}"`);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const lineTokens: PDFToken[] = semantics(matchResult).extract();
        // console.log(`Line ${lineNbr}: tokenized "${line.trim()}": `, lineTokens);
        // When encounter a "stream" token, skip until "endstream" (or "endobj" or "X Y obj")
        /** @todo - try a different Ohm grammar on the stream data: Content Stream, PSType4, CMap, etc. */
        const streamKeyword = lineTokens.findIndex((t: PDFToken) => { return t.type === "stream"; });
        if (streamKeyword !== -1) { insideStream = true; }
        tokenList = tokenList.concat(lineTokens);
      }
    }
    lineNbr += 1;
  }
  console.log(`Finished tokenizing ${lineNbr} lines`);

  // DEBUG ONLY VALIDATION OF TOKENS
  //
  // tokenList.forEach((token) => {
  //   console.log(token);
  //   if (!TOKEN_TYPES.includes(token.type)) {
  //     console.error(`server-Missing token type: ${token.type}`);
  //   } else {
  //     console.log("all passing");
  //   }
  // });
  //
  // tokenList.forEach((token) => {
  //   if (token.type === undefined || token.type === null) {
  //     console.error(`Undefined or null token type: `, token);
  //   }
  // });

  /** 
   * @todo - How do we mark an error in syntax (what does Ohm do)???
   *  - whole line vs after a few tokens and at end-of-a-line vs somewhere in the middle of a line
   */

  /** 
   * @todo - processing tokenList array for
   *  - basic file and syntax validation
   *  - file layout and structure markers
   *  - dictionary key modifier (so can know key or key-value)
   *  - array element modifier
   *  - streams (that were skipped above) - rely on dict key /Type, etc. and use other Ohm grammars
   *  - folding??
   */
  return tokenList;
}

export { getTokens };
