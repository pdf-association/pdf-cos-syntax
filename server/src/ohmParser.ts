import * as ohm from "ohm-js";
import * as fs from "fs";
import { Token } from './types';
import * as path from 'path';

const grammarPath = path.join(__dirname, '../src/grammar/grammar_pdfFile.ohm');

const grammarString = fs.readFileSync(grammarPath, 'utf-8');
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
  console.log("matchResult: ", matchResult);
  if (!matchResult.succeeded()) {
    console.log("GETTOKENS->not successed in");
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
