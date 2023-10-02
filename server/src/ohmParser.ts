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
    return [];
  }

  const semantics = grammar.createSemantics();
  semantics.addOperation("extract", {
    _terminal() {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "terminal",
          value: this.sourceString,
        },
      ];
    },
    // Implementing dictionary extraction
    dictionary(_1, keyValues, _2) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "dictionary",
          content: keyValues.extract(),
        },
      ];
    },
    key_value_pair(key, value) {
      return {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "key_value",
        key: key.extract(),
        value: value.extract(),
      };
    },
    // Implementing array extraction
    array(_1, elements, _2) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "array",
          content: elements.extract(),
        },
      ];
    },
    // Implementing stream extraction
    stream(dict, _1, streamContent, _2, _3) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "stream",
          dictionary: dict.extract(),
          content: streamContent.sourceString,
        },
      ];
    },
    // Implementing name extraction
    name(_1, nameContent) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "name",
          content: nameContent.sourceString,
        },
      ];
    },
    // Implementing string extraction
    string(stringContent) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "string",
          content: stringContent.sourceString,
        },
      ];
    },
    // Implementing number extraction
    number(_1, _2) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "number",
          value: parseFloat(this.sourceString),
        },
      ];
    },
    // Implementing boolean extraction
    bool(_1) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "boolean",
          value: this.sourceString === "true",
        },
      ];
    },
    // Implementing null extraction
    null(_1) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "null",
        },
      ];
    },
    comment(_1, content, _2) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "comment",
          content: content.sourceString,
        },
      ];
    },
    indirect_object(objID, _1, body, _2, _3, _4) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "indirect_object",
          objectID: objID.extract(),
          body: body ? body.extract() : null,
        },
      ];
    },
    object_body(streamObj, regularObj) {
      return streamObj ? streamObj.extract() : regularObj.extract();
    },
    xref(_1, subsections) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "xref",
          subsections: subsections.extract(),
        },
      ];
    },
    xref_subsection(sectionHeader, entries) {
      return {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_subsection",
        sectionHeader: sectionHeader.extract(),
        entries: entries.extract(),
      };
    },
    xref_entry(offset, generation, usage) {
      return {
        start: this.source.startIdx,
        end: this.source.endIdx,
        type: "xref_entry",
        offset: offset.sourceString,
        generation: generation.sourceString,
        usage: usage.sourceString,
      };
    },
    trailer(_1, dict, _2) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "trailer",
          dictionary: dict.extract(),
        },
      ];
    },
    eof(_1) {
      return [
        {
          start: this.source.startIdx,
          end: this.source.endIdx,
          type: "eof",
        },
      ];
    },
  });

  const semanticsResult = semantics(matchResult);
  return semanticsResult.extract();
}

export { parse, getTokens };
