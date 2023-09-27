import * as ohm from "ohm-js";
import * as fs from "fs";
import { URL } from "url";
import { Token } from './types';

const grammarString = fs.readFileSync(
  new URL("./grammar/grammar_pdfFile.ohm", import.meta.url),
  "utf-8"
);

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

function parse(text: string): ParseResult {
  const matchResult = grammar.match(text);
  if (matchResult.succeeded()) {
    return { success: true, result: matchResult };
  } else {
    return { success: false, error: matchResult.message || "Match failed"};
  }
}

function getTokens(text: string): Token[] {
  const matchResult = grammar.match(text);
  if (!matchResult.succeeded()) {
    return []; // Return an empty list if the match failed.
  }

  const semantics = grammar.createSemantics();
  semantics.addOperation("extract", {
    dictionary: (start: any, _: any, end: any) => [
      {
        start: start.source.startIdx,
        end: end.source.endIdx,
        type: "dictionary",
      },
    ],
    array: (start: any, _: any, end: any) => [
      { start: start.source.startIdx, end: end.source.endIdx, type: "array" },
    ],
    name: (name: any) => [
      { start: name.source.startIdx, end: name.source.endIdx, type: "name" },
    ],
    stream: (start: any, _: any, end: any) => [
      {
        start: start.source.startIdx,
        end: end.source.endIdx,
        type: "stream",
      },
    ],
  });
  console.log("getTokens: ", semantics);
  const semanticsResult = semantics(matchResult);
  return semanticsResult.extract();
}

export { parse, getTokens };
