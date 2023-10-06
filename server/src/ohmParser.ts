import * as ohm from "ohm-js";
import * as fs from "fs";
import { Token } from "./types";
import * as path from "path";

const grammarPath = path.join(__dirname, "../src/grammar/grammar_pdfFile.ohm");
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

function getTokens(text: string): Token[] {
  const tokenList: Token[] = [];
  const matchResult = grammar.match(text);
  if (!matchResult.succeeded()) {
    console.log(`getTokens(): match did not succeed!`);
    return [];
  }

  const semantics = grammar.createSemantics();
  // Example semantic actions
  semantics.addOperation("extract", {
    pdf(header, binary_marker, revision) {
      console.log("PDF rule entered");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "pdf",
      };
      tokenList.push(token);

      header.extract();
      binary_marker.extract();
      revision.extract();
      // body.extract();
      // indirect_object_start.extract();
      // indirect_object_end.extract();
      // stream.extract();
      // object.extract();
      // dictionary.extract();
      // key_value_pair.extract();
      // array.extract();
      // name.extract();
      // name_hex_escape.extract();
      // string.extract();
      // string_literal.extract();
      // string_literal_escape.extract();
      // octal.extract();
      // octal_digit.extract();
      // escaped_eol.extract();
      // hex_string.extract();
      // hex_digit.extract();
      // endobj.extract();
      // indirect_ref.extract();
      // number.extract();
      // integer.extract();
      // real.extract();
      // bool.extract();
      // null.extract();
      // xref.extract();
      // xref_subsection.extract();
      // xref_subsection_marker.extract();
      // xref_10entry.extract();
      // xref_5entry.extract();
      // xref_entry.extract();
      // trailer.extract();
      // startxref.extract();
      // eof.extract();
      // comment.extract();
      // eol.extract();
      // delimiter.extract();
      // start_delimiter.extract();
      // end_delimiter.extract();
      // ws_incl_eol.extract();
      // ws_no_eol.extract();
    },
    header(_1, _2, _3, _4, _5, _6) {
      console.log("Header rule entered");
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "header",
      };
      tokenList.push(token);
    },
    binary_marker(_1, _2, _3, _4, _5, _6, _7) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "binary_marker",
      };
      tokenList.push(token);
    },
    revision(_1, _2, _3, _4, _5) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "revision",
      };
      tokenList.push(token);
    },
    body(elements) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "body",
        content: elements.sourceString,
      };
      tokenList.push(token);
    },
    indirect_object_start(_1, objNum, _2, genNum, objectName, _3, _4) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "indirect_object_start",
        objNum: parseInt(objNum.sourceString),
        genNum: parseInt(genNum.sourceString),
      };
      tokenList.push(token);
    },
    indirect_object_end(_1, _2, _3) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "indirect_object_end",
      };
      tokenList.push(token);
    },
    stream(_1, _2, content, _3, _4, _5, _6) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "stream",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    object(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "object",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    dictionary(_1, keyValues, _2, _3, _4) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "dictionary",
        content: keyValues.sourceString,
      };
      tokenList.push(token);
    },
    key_value_pair(_1, key, _2, value) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "key_value_pair",
        key: key.sourceString,
        value: value.sourceString,
      };
      tokenList.push(token);
    },
    name_hex_escape(_1, hexDigit1, hexDigit2) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "name_hex_escape",
        content: String.fromCharCode(
          parseInt(hexDigit1.sourceString + hexDigit2.sourceString, 16)
        ),
      };
      tokenList.push(token);
    },
    string(strContent) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "string",
        content: strContent.extract(),
      };
      tokenList.push(token);
    },
    string_literal(_1, content, _2) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "string_literal",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    string_literal_escape(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "string_literal_escape",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    octal(_1, octalDigits, _2, _3) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "octal",
        value: parseInt(octalDigits.sourceString, 8),
      };
      tokenList.push(token);
    },
    octal_digit(digit) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "octal_digit",
        value: digit.sourceString,
      };
      tokenList.push(token);
    },
    escaped_eol(_1, _2) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "escaped_eol",
      };
      tokenList.push(token);
    },
    hex_string(_1, content, _2) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "hex_string",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    hex_digit(digit) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "hex_digit",
        value: digit.sourceString,
      };
      tokenList.push(token);
    },
    indirect_ref(_1, objNum, _2, genNum, _3, _4) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "indirect_ref",
        objNum: parseInt(objNum.sourceString),
        genNum: parseInt(genNum.sourceString),
      };
      tokenList.push(token);
    },
    xref(_1, subsections, _2, _3) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref",
        subsections: subsections.children.map((child) => child.extract()),
      };
      tokenList.push(token);
    },
    xref_subsection(marker, entries) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_subsection",
        marker: marker.extract(),
        entries: entries.children.map((entry) => entry.extract()),
      };
      tokenList.push(token);
    },
    xref_subsection_marker(_1, firstObj, _2, count, _3) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_subsection_marker",
        firstObj: parseInt(firstObj.sourceString),
        count: parseInt(count.sourceString),
      };
      tokenList.push(token);
    },
    xref_10entry(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_10entry",
        value: this.sourceString,
      };
      tokenList.push(token);
    },
    xref_5entry(_1, _2, _3, _4, _5) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_5entry",
        value: this.sourceString,
      };
      tokenList.push(token);
    },
    xref_entry(tenEntry, _1, fiveEntry, _2, status, _3) {
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
    trailer(_1, dictionary, _2, _3) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "trailer",
        dictionary: dictionary.extract(),
      };
      tokenList.push(token);
    },
    startxref(_1, position, _2, _3) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "startxref",
        position: parseInt(position.sourceString),
      };
      tokenList.push(token);
    },
    eof(_1, _2) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "eof",
      };
      tokenList.push(token);
    },
    comment(_1, commentText, _2) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "comment",
        content: commentText.sourceString,
      };
      tokenList.push(token);
    },
    eol(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "eol",
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    end_delimiter(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "delimiter",
        subtype: this.ctorName.toLowerCase(),
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    delimiter(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "delimiter",
        subtype: this.ctorName.toLowerCase(),
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    start_delimiter(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "delimiter",
        subtype: this.ctorName.toLowerCase(),
        content: content.sourceString,
      };
      tokenList.push(token);
    },
    ws_incl_eol(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "whitespace",
        inclEol: this.ctorName === "ws_incl_eol",
      };
      tokenList.push(token);
    },
    ws_no_eol(content) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "whitespace",
        inclEol: this.ctorName === "ws_incl_eol",
      };
      tokenList.push(token);
    },
    bool(value) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "bool",
        content: value.sourceString === "true",
      };
      tokenList.push(token);
    },
    integer(sign, digits) {
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
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "null",
      };
      tokenList.push(token);
    },
    name(_1, characters) {
      const token = {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "name",
        content: characters.sourceString,
      };
      tokenList.push(token);
    },
  });

  // const semanticsResult = semantics(matchResult);

  // const tokens = semantics(matchResult).extract();
  // console.log("Extracted Tokens: ", tokens);
  // return semanticsResult.extract();
  semantics(matchResult).extract();
  console.log("tokenList: ", tokenList);
  return tokenList;
}

export { parse, getTokens };
