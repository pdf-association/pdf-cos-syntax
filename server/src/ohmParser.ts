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
  const matchResult = grammar.match(text);
  if (!matchResult.succeeded()) {
    console.log(`getTokens(): match did not succeed!`);
    return [];
  }

  const semantics = grammar.createSemantics();
  // semantics.addOperation("extract", {
  //   _terminal() {
  //     console.log(`_terminal: ${this.sourceString}`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "terminal",
  //         value: this.sourceString,
  //       },
  //     ];
  //   },
  //   pdf(_1, _2, _3) {
  //     console.log(`pdf`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "pdf"
  //       },
  //     ];
  //   },
  //   dictionary(_1, keyValues, _3, _4, _5) {
  //     console.log(`dictionary`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "dictionary",
  //         content: keyValues.extract(),
  //       },
  //     ];
  //   },
  //   key_value_pair(_1, key, _3, value) {
  //     console.log(`key_value_pair: ${key} ${value}`);
  //     return [{
  //       start: this.source.startIdx,
  //       end: this.source.endIdx,
  //       type: "key_value",
  //       key: key.extract(),
  //       value: value.extract(),
  //     }];
  //   },
  //   // Implementing array extraction
  //   array(_1, _2, elements, _4, _5, _6) {
  //     console.log(`array`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "array",
  //         content: elements.extract(),
  //       },
  //     ];
  //   },
  //   stream(_1, _2, _3, streamContent, _5, _6, _7) {
  //     console.log(`stream`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "stream",
  //         content: streamContent.sourceString,
  //       },
  //     ];
  //   },
  //   name(_1, nameContent) {
  //     console.log(`name: : "${nameContent.sourceString}"`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "name",
  //         content: nameContent.sourceString,
  //       },
  //     ];
  //   },
  //   // Implementing string extraction
  //   string(stringContent) {
  //     console.log(`string: : "${stringContent.sourceString}"`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "string",
  //         content: stringContent.sourceString,
  //       },
  //     ];
  //   },
  //   // Implementing number extraction
  //   number(_1) {
  //     console.log(`number: : "${this.sourceString}"`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "number",
  //         value: parseFloat(this.sourceString),
  //       },
  //     ];
  //   },
  //   // Implementing boolean extraction
  //   bool(_1) {
  //     console.log(`bool: "${this.sourceString}"`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "boolean",
  //         value: this.sourceString === "true",
  //       },
  //     ];
  //   },
  //   // Implementing null extraction
  //   null(_1) {
  //     console.log(`null`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "null",
  //       },
  //     ];
  //   },
  //   comment(_1, content, _3) {
  //     console.log(`comment: "${content.sourceString}"`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "comment",
  //         content: content.sourceString,
  //       },
  //     ];
  //   },
  //   indirect_object_start(_1, objNum, _3, genNum, _5, _6, _7) {
  //     console.log(`indirect_object_start: "${objNum} ${genNum}"`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "obj",
  //         objectNum: objNum.extract(),
  //         generationNum: genNum.extract()
  //       },
  //     ];
  //   },
  //   indirect_object_end(_1, _2, _3) {
  //     console.log(`indirect_object_end`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "endobj"
  //       },
  //     ];
  //   },
  //   xref(_1, _2, _3, subsections) {
  //     console.log(`xref`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "xref",
  //         subsections: subsections.extract(),
  //       },
  //     ];
  //   },
  //   xref_subsection(sectionHeader, entries) {
  //     console.log(`xref_subsection`);
  //     return [{
  //       start: this.source.startIdx,
  //       end: this.source.endIdx,
  //       type: "xref_subsection",
  //       sectionHeader: sectionHeader.extract(),
  //       entries: entries.extract(),
  //   }];
  //   },
  //   xref_entry(offset, _2, generation, _4, usage, _6) {
  //     console.log(`xref_entry`);
  //     return [{
  //       start: this.source.startIdx,
  //       end: this.source.endIdx,
  //       type: "xref_entry",
  //       offset: offset.sourceString,
  //       generation: generation.sourceString,
  //       usage: usage.sourceString,
  //   }];
  //   },
  //   trailer(_1, _2, dict, _4) {
  //     console.log(`trailer`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "trailer",
  //         dictionary: dict.extract(),
  //       },
  //     ];
  //   },
  //   eof(_1, _2) {
  //     console.log(`eof`);
  //     return [
  //       {
  //         start: this.source.startIdx,
  //         end: this.source.endIdx,
  //         type: "eof",
  //       },
  //     ];
  //   },
  // });
  semantics.addOperation("debugLog", {
    _nonterminal(...children) {
      console.log(`Matching: ${this.ctorName}`);
      children.forEach(child => child.debugLog());
      return null;
    },
    _terminal() {
      console.log(`Terminal: ${this.primitiveValue}`);
      return null;
    }
  });
  semantics(matchResult).debugLog();

  const semanticsResult = semantics(matchResult);

  const tokens = semantics(matchResult).extract();
console.log("Extracted Tokens: ", tokens);
  return semanticsResult.extract();
}

export { parse, getTokens };
