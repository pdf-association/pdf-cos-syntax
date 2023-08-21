import { Range, TextDocument } from "vscode-languageserver-textdocument";
import { Location, Position } from "vscode-languageserver";

/** PDF Whitespace from Table 1, ISO 32000-2:2020 */
const pdfWhitespaceRegex = new RegExp(/ \\t\\r\\n\\0\\x0C/);

/** PDF Delimiters including PDF whitespace, from Tables 1 and 2, ISO 32000-2:2020 */
const pdfDelimitersRegex = new RegExp(
  pdfWhitespaceRegex.source + /%\\(\\)<>\\[\\]\//
);

/**
 * Process a conventional cross-reference table looking for an in-use entry for object ID.
 *
 * @param  {number} objNum - object number. Should be > 0
 * @param  {number} genNum - object generation number. Should be >= 0.
 * @param {string} xrefTable - a full conventional cross reference table without the "xref" keyword
 *
 * @returns {number} a byte offset for the object or -1 if no such in-use object.
 */
export function getByteOffsetForObj(
  objNum: number,
  genNum: number,
  xrefTable: string
): number {
  if (objNum <= 0 || genNum === -1) {
    return -1;
  }

  // Normalize line endings so split(), etc work as expected
  let xref = xrefTable.replace("\r\n", " \n"); // CR+LF --> SPACE+LF (byte count unchanged)
  xref = xrefTable.replace("\r", "\n"); // single CR --> single LF (byte count unchanged)
  xref = xrefTable.replace("\n\n", "\n"); // remove any blank lines
  const lines = xref.split("\n");

  let startObjNum = 1;
  let totalEntries = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(" f") || lines[i].includes(" n")) {
      // 20-byte entry: in-use (n) or free (f)
      const parts = lines[i].split(" ");
      if (objNum === i + startObjNum - 1 && parts.length >= 3) {
        // Found the object
        if (parts[2].includes("n") && parseInt(parts[1]) === genNum) {
          return parseInt(lines[i].split(" ")[0]);
        } else {
          return -1; // was a free object
        }
      }
    } else {
      // cross reference table sub-section line with 2 integers
      const parts = lines[i].split(" ");
      if (parts.length < 2) {
        return -1;
      }
      startObjNum = parseInt(parts[0]);
      totalEntries = parseInt(parts[1]);
    }
  }

  return -1;
}

/**
 * Given a PDF byte offset, work out equivalent VSCode line number.
 *
 * @param {TextDocument} document - the PDF (as text) document
 * @param {number} byteOffset - the PDF file byte offset. Always > 0.
 *
 * @returns {number} VSCode line number or -1 on error
 */
export function getLineFromByteOffset(
  document: TextDocument,
  byteOffset: number
): number {
  if (byteOffset < 0) {
    return -1;
  }

  const text = document.getText();
  const buffer = Buffer.from(text, "utf8");
  let count = 0;
  let lineCount = 0;

  for (const byte of buffer) {
    if (byte === "\n".charCodeAt(0)) {
      lineCount++;
    }

    if (count === byteOffset) {
      return lineCount;
    }

    count++;
  }

  return -1;
}

/**
 * Extracts the 1st conventional cross reference table from a PDF.
 *
 * @param {TextDocument} document - the PDF (as text) document
 *
 * @returns {string | null} the conventional cross reference table or null if one doesn't exist
 */
export function extractXrefTable(document: TextDocument): string | null {
  const documentText = document.getText();
  const xrefStart = documentText.indexOf("xref");
  const xrefEnd = documentText.indexOf("trailer");

  // Handle PDFs with cross-reference streams
  if (xrefStart === -1 || xrefEnd === -1 || xrefEnd < xrefStart) {
    return null;
  }
  let xrefTable = documentText.slice(xrefStart, xrefEnd);

  // Normalize for PDF end-of-line sequences to '\n'
  // Normalize line endings so split(), etc work as expected
  let xref = xrefTable.replace("\r\n", " \n"); // CR+LF --> SPACE+LF (byte count unchanged)
  xref = xrefTable.replace("\r", "\n"); // single CR --> single LF (byte count unchanged)
  xref = xrefTable.replace("\n\n", "\n"); // remove any blank lines
  let lines = xref.split("\n");

  // Remove the first line (the "xref" line)
  lines = lines.slice(1);
  xrefTable = lines.join("\n");
  return xrefTable;
}

/**
 * Find all occurrences of "X Y R" in the text for a given object ID.
 *
 * @param {number} objNum - object number. Should be > 0.
 * @param {number}genNum - object generation number. Should be >= 0.
 * @param {TextDocument} document - the PDF (as text) document
 *
 * @returns {Location[]} an array of locations
 */
export function findAllReferences(
  objNum: number,
  genNum: number,
  document: TextDocument
): Location[] {
  if (objNum <= 0 || genNum < 0) {
    return [];
  }

  const references: Location[] = [];

  // Avoid minimal matches with larger object numbers (e.g. 10 matches 10 but also 110, 210)
  // Avoid false matches with PDF "RG" operator as it takes 3 numeric operands
  const referencePattern = new RegExp(
    `(?<!\\d)${objNum} ${genNum} R(?=[^G])`,
    "g"
  );

  const text = document.getText();
  let match;

  // Find all occurrences of "X Y R" in the text
  while ((match = referencePattern.exec(text)) !== null) {
    const position = document.positionAt(match.index);
    references.push({
      uri: document.uri,
      range: {
        start: position,
        end: Position.create(
          position.line,
          position.character + match[0].length
        ),
      },
    });
  }
  return references;
}

/**
 * Determine if the given document is an FDF file based on its URI extension.
 *
 * @param document - the document object containing information about the file
 *
 * @returns true if the document is an FDF file, false otherwise
 */
export function isFileFDF(document: TextDocument): boolean {
  return document.uri.toLowerCase().endsWith(".fdf");
}

/**
 * Determine if the given document is a PDF file based on its URI extension.
 *
 * @param[in] document - the document object containing information about the file
 *
 * @returns true if the document is a PDF file, false otherwise
 */
export function isFilePDF(document: TextDocument): boolean {
  return document.uri.toLowerCase().endsWith(".pdf");
}

interface SemanticTokenInfo {
  type: string;
  range: Range;
}

export function getSemanticTokenAtPosition(
  document: TextDocument,
  position: Position
): SemanticTokenInfo | null {
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: Number.MAX_VALUE },
  });
  console.log("lineText: ", lineText);

  // Check for reference pattern "X Y R"
  const indirectObjMatch = lineText.match(/(\d+) (\d+) R(?=[^G])/);
  console.log("indirectObjMatch: ", indirectObjMatch);
  if (indirectObjMatch) {
    const matchStart = indirectObjMatch.index!;
    return {
      type: "reference",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + indirectObjMatch[0].length,
        },
      },
    };
  }

  // Check for "X Y obj" pattern
  const objMatch = lineText.match(/(\d+) (\d+) obj/);
  if (objMatch) {
    const matchStart = objMatch.index!;
    return {
      type: "inUseObject",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + objMatch[0].length,
        },
      },
    };
  }

  // Check for xref table entry pattern
  const xrefMatch = lineText.match(/\b(\d{10}) (\d{5}) n\b/);
  if (xrefMatch) {
    const matchStart = xrefMatch.index!;
    return {
      type: "xrefTableEntry",
      range: {
        start: { line: position.line, character: matchStart },
        end: {
          line: position.line,
          character: matchStart + xrefMatch[0].length,
        },
      },
    };
  }

  return null;
}

// const tokenCache: Map<string, SemanticTokenInfo[]> = new Map();
// export function getSemanticTokenAtPosition(document: TextDocument, position: Position): SemanticTokenInfo | null {
// 	// Get all tokens for the document
// 	const tokens = getTokensForDocument(document);

// 	// Find the token that matches the given position
// 	for (const token of tokens) {
// 		if (isPositionWithinRange(position, token.range)) {
// 			return token;
// 		}
// 	}

// 	return null;
// }

// function isPositionWithinRange(position: Position, range: Range): boolean {
// 	return position.line > range.start.line || (position.line === range.start.line && position.character >= range.start.character)
// 			&& position.line < range.end.line || (position.line === range.end.line && position.character <= range.end.character);
// }

// function getTokensForDocument(document: TextDocument): SemanticTokenInfo[] {
// 	let tokens = tokenCache.get(document.uri);

// 	if (!tokens) {
// 			tokens = parseDocumentForTokens(document);
// 			tokenCache.set(document.uri, tokens);
// 	}

// 	return tokens;
// }

export function computeDefinitionLocationForToken(
  tokenInfo: SemanticTokenInfo,
  document: TextDocument,
  xrefTable: any
): Location | null {
  switch (tokenInfo.type) {
    case "reference": {
			const lineText = document.getText(tokenInfo.range);
      // const match = lineText.match(/(\d+) (\d+) R(?=[^G])/);
      // if (!match) return null;

      // const objNum = parseInt(match[1]);
      // const genNum = parseInt(match[2]);
      const [objNumStr, genNumStr, _] = lineText.split(" ");
      const objNum = parseInt(objNumStr);
      const genNum = parseInt(genNumStr);
      const byteOffset = getByteOffsetForObj(objNum, genNum, xrefTable);

      const line = getLineFromByteOffset(document, byteOffset);
      if (line === -1) return null;

      return {
        uri: document.uri,
        range: { start: { line, character: 0 }, end: { line, character: 0 } },
      };
    }

    case "xrefTableEntry": {
      const lineText = document.getText(tokenInfo.range);
      const match = lineText.match(/\b(\d{10}) (\d{5}) n\b/);
      if (!match) return null;

      const byteOffset = parseInt(match[1]);
      const line = getLineFromByteOffset(document, byteOffset);
      if (line === -1) return null;

      return {
        uri: document.uri,
        range: { start: { line, character: 0 }, end: { line, character: 0 } },
      };
    }

    case "inUseObject":
    default:
      return null;
  }
}
