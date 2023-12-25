/**
 * @brief Ohm-based tokenizing parser running in LSP server.
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
"use strict";

import * as ohm from "ohm-js";
import * as fs from "fs";
import { PDFToken, TOKEN_TYPES } from "./types";
import * as path from "path";

// To regenerate Ohm bundle do this in pdf-cos-syntax\server folder:
// npx ohm generateBundles --withTypes ./src/grammar/grammar_pdfTokens.ohm
import {PDFTokenizerSemantics} from "./grammar/grammar_pdfTokens.ohm-bundle";

let ohmPDFgrammar: ohm.Grammar;
let ohmPDFgrammarsemantics: PDFTokenizerSemantics;
let lineNbr: number = 1;
let stack: string[] = [];

/**
 * Initialize the Ohm PDF parser. Only needs to be done once as can be reused
 * for each PDF file.
 */
function initializePDFparser(): boolean {
  console.log(`initializePDFparser()`);

  if (ohmPDFgrammar == null) {
    const grammarPath = path.join(
      __dirname,
      "../../../server/src/grammar/grammar_pdfTokens.ohm"
    );
    const grammarString = fs.readFileSync(grammarPath, "utf-8");
    ohmPDFgrammar = ohm.grammar(grammarString);
  
    ohmPDFgrammarsemantics = ohmPDFgrammar.createSemantics();
    if (ohmPDFgrammarsemantics == null) {
      console.error(`grammar.createSemantics()  failed!`);
      return false;
    }

    ohmPDFgrammarsemantics.addOperation("extract()", {
      _iter(...children) {
        let childTokenList: PDFToken[] = [];
        children.forEach((child, index) => {
          const childTokens: PDFToken[] = child.extract();
          childTokenList = childTokenList.concat(childTokens);
        });
        return childTokenList;
      },
      _terminal() {
        return []; // ignore
      },
      header(_1, majorVer, _3, minorVer, _5) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "header",
          content: majorVer.sourceString + "." + minorVer.sourceString,
        };
        return [token];
      },
      endobj(_1) {
        // pop stack back to matching "X Y obj", "endobj", etc.
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "endobj",
        };
        return [token];
      },
      indirect_object_start(objNum, _2, genNum, _4, _5) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "indirect_object_start",
          objNum: parseInt(objNum.sourceString),
          genNum: parseInt(genNum.sourceString),
        };
        return [token];
      },
      stream(_1) {
        stack.push("stream");
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "stream",
        };
        return [token];
      },
      endstream(_1) {
        // pop stack back to matching "stream" (or "X Y obj", "endobj" if editing)
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "endstream",
        };
        return [token];
      },
      dict_start(_1) {
        stack.push("<<");
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "dict_start",
        };
        return [token];
      },
      dict_end(_1) {
        // pop stack back to matching "<<" (or "]", "X Y obj", "endobj" if editing)
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "dict_end",
        };
        return [token];
      },
      array_start(_1) {
        stack.push("[");
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "array_start",
        };
        return [token];
      },
      array_end(_1) {
        // pop stack back to matching "[" (or "X Y obj", "endobj" if editing)
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "array_end",
        };
        return [token];
      },
      name(_1, characters) {
        const peek_prev: string = stack[stack.length - 1];
        let key_name: boolean;
        if (peek_prev === "<<") {
          key_name = true;
          stack.push("key_name");
        }
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "name",
          content: characters.sourceString,
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
        };
        return [token];
      },
      indirect_ref(objNum, _2, genNum, _3, _4) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "indirect_ref",
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
          content: sign
            ? parseInt(sign.sourceString + digits.sourceString)
            : parseInt(digits.sourceString),
        };
        return [token];
      },
      real(sign, part1, dot, part2) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "real",
          content: parseFloat(
            (sign ? sign.sourceString : "") +
              part1.sourceString +
              dot.sourceString +
              (part2 ? part2.sourceString : "")
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
        };
        return [token];
      },
      xref(_1) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "xref",
        };
        return [token];
      },
      xref_10entry(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10) {
        return []; // ignore - wait for xref_entry
      },
      xref_5entry(_1, _2, _3, _4, _5) {
        return []; // ignore - wait for xref_entry
      },
      xref_entry(tenEntry, _1, fiveEntry, _2, status) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "xref_entry",
          tenEntry: parseInt(tenEntry.sourceString),
          fiveEntry: parseInt(fiveEntry.sourceString),
          status: status.sourceString,
        };
        return [token];
      },
      trailer(_1) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "trailer",
        };
        return [token];
      },
      eof(_1) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "eof",
        };
        return [token];
      },
      startxref(_1) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "startxref",
        };
        return [token];
      },
      comment(_1, commentText, _2) {
        const token: PDFToken = {
          line: lineNbr,
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "comment",
          // content: commentText.sourceString, // no need to keep comment iself
        };
        return [token];
      }
    });
  }
  else {
    console.log(`semantics reused!`);
  }
  return true;
}

/**
 *  Parse PDF content using the Ohm PDF tokenizing parser.
 * 
 * @param[in] text   PDF file contents (as VSCode UTF-8)
 *  
 */ 
function parsePDF(text: string): PDFToken[] {
  console.log(`parsePDF()`);

  // Reset global data used by Ohm Parser
  lineNbr = 1;
  stack = [];

  if (ohmPDFgrammar == null) {
    console.error(`Ohm PDF grammar object was null!`); 
    return [];
  }

  if (ohmPDFgrammarsemantics == null) {
    console.error(`Ohm PDF semantics object was null!`); 
    return [];
  }

  // Tokenize PDF file line-by-line, but skip over all stream contents
  const lines = text.split("\n");
  let insideStream: boolean = false;
  let tokenList: PDFToken[] = [];
  for (const line of lines) {
    if (insideStream) { // be robust to live editing to re-start parser at end of a stream
      if (
        line.trim().startsWith("endstream") ||
        line.trim().startsWith("endobj") ||
        line.trim().match(/\\d+[ \t\f\0\r\n]+\\d+[ \t\f\0\r\n]+obj/)
      )
        insideStream = false; // fallthrough and let Ohm parse this line fully to get token locations
    }

    if (!insideStream && line.trim().length > 0) {
      const matchResult: ohm.MatchResult = ohmPDFgrammar.match(line + "\n"); // restore '\n' so parser sees it
      if (matchResult.failed()) {
        // This will fail for multi-line tokens such as literal and hex strings
        /**  @todo - Could retry by stitching a few lines together, but VSCode SemanticTokens */
        /// cannot span multiple lines: https://github.com/microsoft/vscode/blob/3be5ad240bd78db6892e285cb0c0de205ceab126/src/vs/workbench/api/common/extHostTypes.ts#L3261
        const err: ohm.Interval = matchResult.getInterval(); 
        console.log(`Line ${lineNbr}: getTokens() failed: ${matchResult.message} on "${line.trim()}" at "${err.contents}"`);
      } else {
        const lineTokens: PDFToken[] = ohmPDFgrammarsemantics(matchResult).extract();
        // console.log(
        //   `Line ${lineNbr}: tokenized "${line.trim()}": `,
        //   lineTokens
        // );
        // When encounter a "stream" token, skip until "endstream" (or "endobj" or "X Y obj")
        /** @todo - try a different Ohm grammar on the stream data! Content Stream, PSType4, CMap, etc. */
        const streamKeyword = lineTokens.findIndex((t: PDFToken) => {
          return t.type === "stream";
        });
        if (streamKeyword !== -1) insideStream = true;
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
  //   if (token.type == null) {
  //     console.error(`Undefined or null token type: `, token);
  //   }
  // });

  /** @todo - How do we mark an error in syntax (what does Ohm do)??? */
  ///  - whole line vs after a few tokens and at end-of-a-line vs somewhere in the middle of a line

  /** @todo - processing tokenList array for
  ///  - basic file and syntax validation
  ///  - file layout and structure markers
  ///  - dictionary key modifier (so can know key or key-value)
  ///  - array element modifier
  ///  - streams (that were skipped above) - rely on dict key /Type, etc. and use other Ohm grammars
  ///  - folding??
  */

  return tokenList;
}

export { initializePDFparser, parsePDF };
