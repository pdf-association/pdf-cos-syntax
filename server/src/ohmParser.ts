import * as ohm from "ohm-js";
import * as fs from "fs";
import { PDFToken } from "./types";
import * as path from "path";

const grammarPath = path.join(__dirname, "../src/grammar/grammar_pdfTokens.ohm");
const grammarString = fs.readFileSync(grammarPath, "utf-8");
const grammar = ohm.grammar(grammarString);

// Main entry point to Ohm parser called by LSP server
function getTokens(text: string): PDFToken[] {
  let lineNbr: number = 1;

  const semantics = grammar.createSemantics();

  semantics.addOperation('extract()', {
    _iter(...children) {
      let childTokenList: PDFToken[] = [];
      children.forEach((child, index) => {
        const childTokens: PDFToken[] = child.extract(); 
        childTokenList = childTokenList.concat(childTokens);
      });
      return childTokenList;
    },
    _terminal() { // ignore
      return [];
    },
    xref_5entry(_1, _2, _3, _4, _5) { // ignore - wait for xref_entry
      return [];
    },
    xref_10entry(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10) { // ignore - wait for xref_entry
      return [];
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
    endobj(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "endobj",
      };
      return [token];
    },
    stream(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "stream",
      };
      return [token];
    },
    endstream(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "endstream",
      };
      return [token];
    },
    dict_start(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "dict_start"
      };
      return [token];
    },
    dict_end(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "dict_end"
      };
      return [token];
    },
    array_start(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "array_start"
      };
      return [token];
    },
    array_end(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "array_end"
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
    xref(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref",
      };
      return [token];
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
        type: "trailer"
      };
      return [token];
    },
    startxref(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "startxref"
      };
      return [token];
    },
    eof(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "eof"
      };
      return [token];
    },
    comment(_1, commentText, _2) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "comment",
        // content: commentText.sourceString, // no need to keep comment
      };
      return [token];
    },
    bool(value) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "bool",
        content: (value.sourceString === "true"),
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
    null(_1) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "null",
      };
      return [token];
    },
    name(_1, characters) {
      const token: PDFToken = {
        line: lineNbr,
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "name",
        content: characters.sourceString,
      };
      return [token];
    },
  });

  // Tokenize line-by-line 
  const lines = text.split('\n');
  let insideStream: boolean = false;
  let tokenList: PDFToken[] = [];
  for (const line of lines) {
    if (insideStream) {
      // be robust to live editing to re-start parser at end of a stream
      if ((line.trim().startsWith("endstream")) || 
          (line.trim().startsWith("endobj")) || 
          (line.trim().match(/\\d+[ \t\f\0\r\n]+\\d+[ \t\f\0\r\n]+obj/)))
        insideStream = false; // fallthrough and let Ohm parse this line fully to get token locations
    }

    if (!insideStream) {
      const matchResult: ohm.MatchResult = grammar.match(line);
      if (matchResult.failed()) {
        console.log(`Line ${lineNbr}: getTokens() failed! "${line.trim()}"`);
      }
      else {
        const lineTokens: PDFToken[] = semantics(matchResult).extract();
        console.log(`Line ${lineNbr}: tokenized "${line.trim()}": `, lineTokens);
        // when see "stream" token skip until "endstream"
        const streamKeyword = lineTokens.findIndex((t: PDFToken) => { return (t.type === "stream"); });
        if (streamKeyword !== -1)
          insideStream = true;
        tokenList = tokenList.concat(lineTokens);
      }
    }
    lineNbr += 1;
  }

  return tokenList;
}

export { getTokens };
