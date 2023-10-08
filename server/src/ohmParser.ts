import * as ohm from "ohm-js";
import * as fs from "fs";
import { Token } from "./types";
import * as path from "path";

const grammarPath = path.join(__dirname, "../src/grammar/grammar_pdfTokens.ohm");
const grammarString = fs.readFileSync(grammarPath, "utf-8");
const grammar = ohm.grammar(grammarString);

interface MatchSuccess {
  success: true;
  result: any;
}

interface MatchFailure {
  success: false;
  error: string;
}

type ParseResult = MatchSuccess | MatchFailure;

function parse(text: string, startRule?: string): ParseResult {
  console.log(`parse(): ${text} ${startRule}`);
  const matchResult = grammar.match(text, startRule);
  if (matchResult.succeeded()) {
    return { success: true, result: matchResult };
  } else {
    return { success: false, error: matchResult.message || "Match failed" };
  }
}

// Main entry point to Ohm parser called by LSP server
function getTokens(text: string): Token[] {
  const tokenList: Token[] = [];
  const semantics = grammar.createSemantics();

  semantics.addOperation("extract", {
    _iter(...children) {
      console.log("Iterating over children:", children);
      children.forEach((child, index) => {
        const token: Token = {
          start: child.source.startIdx,
          end: child.source.endIdx,
          type: `type_${index}`,
          content: child.sourceString || null,
        };
        console.log("Generated token: ", token);
        tokenList.push(token);
      });
    },
    header(_1, _2, _3, _4, _5) {
      console.log("header rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "%PDF-x.y",
      };
      tokenList.push(token);
    },
    indirect_object_start(objNum, _2, genNum, _4, objectName) {
      console.log("indirect_object_start rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "X Y obj",
        objNum: parseInt(objNum.sourceString),
        genNum: parseInt(genNum.sourceString),
      };
      tokenList.push(token);
    },
    endobj(_1) {
      console.log("endobj rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "endobj",
      };
      tokenList.push(token);
    },
    stream(_1, content, _3, _4, _5) {
      console.log("stream rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "stream",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    dict_start(_1) {
      console.log("dict_start rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "<<"
      };
      tokenList.push(token);
    },
    dict_end(_1) {
      console.log("dict_end rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: ">>"
      };
      tokenList.push(token);
    },
    array_start(_1) {
      console.log("array_start rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "["
      };
      tokenList.push(token);
    },
    array_end(_1) {
      console.log("array_end rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "]"
      };
      tokenList.push(token);
    },
    string_literal(_1, content, _2) {
      console.log("string_literal rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "string_literal",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    hex_string(_1, content, _2) {
      console.log("hex_string rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "hex_string",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    indirect_ref(objNum, _2, genNum, _3, _4) {
      console.log("indirect_ref rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "indirect_ref",
        objNum: parseInt(objNum.sourceString),
        genNum: parseInt(genNum.sourceString),
      };
      tokenList.push(token);
    },
    xref(_1) {
      console.log("xref rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref",
      };
      tokenList.push(token);
    },
    xref_entry(tenEntry, _1, fiveEntry, _2, status) {
      console.log("xref_entry rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_entry",
        tenEntry: tenEntry.extract(),
        fiveEntry: fiveEntry.extract(),
        status: status.sourceString,
      };
      tokenList.push(token);
    },
    trailer(_1) {
      console.log("trailer rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "trailer"
      };
      tokenList.push(token);
    },
    startxref(_1) {
      console.log("startxref rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "startxref"
      };
      tokenList.push(token);
    },
    eof(_1) {
      console.log("eof rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "%%EOF",
      };
      tokenList.push(token);
    },
    comment(_1, commentText, _2) {
      console.log("comment rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "comment",
        content: commentText.sourceString,
      };
      tokenList.push(token);
    },
    bool(value) {
      console.log("bool rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "bool",
        content: value.sourceString === "true",
      };
      tokenList.push(token);
    },
    integer(sign, digits) {
      console.log("integer rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "integer",
        content: sign
          ? parseInt(sign.sourceString + digits.sourceString)
          : parseInt(digits.sourceString),
      };
      tokenList.push(token);
    },
    real(sign, part1, dot, part2) {
      console.log("real rule");
      const token = {
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
      tokenList.push(token);
    },
    null(_1) {
      console.log("null rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "null",
      };
      tokenList.push(token);
    },
    name(_1, characters) {
      console.log("name rule");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "name",
        content: characters.sourceString,
      };
      tokenList.push(token);
    },
  });

  // Tokenize line-by-line
  const lines = text.split('\n');
  let count: number = 1;
  for (const line of lines) {
    console.log(`Line ${count}: "${line}"`);
    count += 1;
    const matchResult: ohm.MatchResult = grammar.match(line);
    if (matchResult.failed()) {
      console.log(`getTokens() match did not succeed!`);
    }
    else {
      console.log(`getTokens() match worked! ${matchResult}`);
      semantics(matchResult).extract();
    }
  }

  console.log("tokenList: ", tokenList);
  return tokenList;
}

export { parse, getTokens };
