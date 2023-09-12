/**
 * @brief VSCode PDF COS syntax LSP server
 *
 * @copyright
 * Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * Original portions: Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * @remark
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Position,
  Definition,
  Location,
  Hover,
  DocumentSymbolParams,
  DocumentSymbol,
  SymbolKind,
  SelectionRange,
} from "vscode-languageserver/node";

import { Range, TextDocument } from "vscode-languageserver-textdocument";

import {
  isFileFDF,
  isFilePDF,
  flags32_to_binary,
  getSemanticTokenAtPosition,
  findAllDefinitions,
  findAllReferences,
  findPreviousObjectLineNumber,
  XrefInfoMatrix,
} from "./pdfUtils";

// for server debug.
import { debug } from "console";
import { TextEncoder } from "util";
import PDFParser from "./utils/PdfParser";

if (process.env.NODE_ENV === "development") {
  debug(`Using development version of the language server`);
  // require("source-map-support").install();
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Needs to match package.json
const tokenTypes = [
  "indirectReference",
  "indirectObject",
  "xrefTableEntry",
  "endobjKeyword",
  "endstreamKeyword",
  "hexString",
  "bitMask",
];
const tokenModifiers = ["deprecated"];

// The example settings
interface PDSCOSSyntaxSettings {
  maxNumberOfProblems: number;
}

interface SimpleTextDocument {
  getText(): string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: PDSCOSSyntaxSettings = { maxNumberOfProblems: 100 };
let globalSettings: PDSCOSSyntaxSettings = defaultSettings;

// Cache the settings for all open documents!
type PDFDocumentData = {
  settings: PDSCOSSyntaxSettings;
  xrefMatrix?: XrefInfoMatrix;
};

const pdfDocumentData: Map<string, PDFDocumentData> = new Map();

documents.onDidChangeContent((change) => {
  const document = change.document;
  if (document) {
    updateXrefMatrixForDocument(document.uri, document.getText());
  }
});

connection.onDidOpenTextDocument((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document) {
    updateXrefMatrixForDocument(document.uri, document.getText());
  }
});

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
      },
      definitionProvider: true,
      referencesProvider: true,
      hoverProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: tokenTypes,
          tokenModifiers: tokenModifiers,
        },
        full: true,
      },
      documentSymbolProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

connection.onRequest("textDocument/semanticTokens/full", (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  return tokenizeDocument(document);
});

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    pdfDocumentData.clear();
  } else {
    globalSettings = <PDSCOSSyntaxSettings>(
      (change.settings.languageServerExample || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

// Only keep settings for open documents
documents.onDidClose((e) => {
  pdfDocumentData.delete(e.document.uri);
});
// const tokenCache: Map<string, SemanticTokenInfo[]> = new Map();
// documents.onDidChangeContent(change => {
//   tokenCache.delete(change.document.uri);
//   // tokenCache.set(change.document.uri, parseDocumentForTokens(change.document));
// });

/** The content of a text document has changed. This event is emitted
 *  when the text document first opened or when its content has changed.
 *  Re-validate the PDF.
 */
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
      {
        label: "TypeScript",
        kind: CompletionItemKind.Text,
        data: 1,
      },
      {
        label: "JavaScript",
        kind: CompletionItemKind.Text,
        data: 2,
      },
    ];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = "TypeScript details";
    item.documentation = "TypeScript documentation";
  } else if (item.data === 2) {
    item.detail = "JavaScript details";
    item.documentation = "JavaScript documentation";
  }
  return item;
});

/**
 *  "Go to definition" capability:
 *    - on "X Y R" --> find all "X Y obj"
 *    - on "X Y obj" --> find all "X Y obj" (incl. current position)
 *    - on in-use ("n") cross reference table entries --> find all "X Y obj"
 *
 *  Because of file revisions, there may be MULTIPLE locations for any given "X Y obj"!!
 */
connection.onDefinition(
  (params: TextDocumentPositionParams): Definition | null => {
    // console.log(`onDefinition for ${params.textDocument.uri}`);

    const docData = pdfDocumentData.get(params.textDocument.uri);
    const document = documents.get(params.textDocument.uri);
    if (!docData || !docData.xrefMatrix || !document) return null;

    // Fetch the semantic token at the given position
    const token = getSemanticTokenAtPosition(document, params.position);
    if (!token) return null;

    let objectNumber: number;
    let genNumber: number;
    const lineText = document.getText(token.range);

    switch (token.type) {
      case "indirectObject": // X Y obj --> may have MULTIPLE objects with this definition!
      case "indirectReference": {
        // X Y R
        const objMatch = lineText.match(/(\d+) (\d+)/);
        if (!objMatch) return null;

        objectNumber = parseInt(objMatch[1]);
        genNumber = parseInt(objMatch[2]);
        break;
      }
      case "xrefTableEntry": {
        // only for in-use entries!
        const match = lineText.match(/\b(\d{10}) (\d{5}) n\b/);
        if (!match) return null;

        const offset = parseInt(match[1]);
        genNumber = parseInt(match[2]);
        const xRefInfo = docData.xrefMatrix;
        objectNumber = xRefInfo.getObjectNumberBasedOnByteOffset(
          offset,
          genNumber,
          "n"
        );
        break;
      }
      default:
        return null;
    }

    // Sanity check object ID values
    if (objectNumber <= 0 || genNumber < 0) {
      console.warn(
        `Invalid object ID for indirect object "${objectNumber} ${genNumber} obj"!`
      );
      return null;
    }

    // Find all "X Y obj"
    const targetLocations: Location[] = findAllDefinitions(
      objectNumber,
      genNumber,
      document
    );

    // Handle degenerate condition (no locations)
    if (targetLocations.length == 0) {
      console.warn(
        `No indirect objects "${objectNumber} ${genNumber} obj" where found!`
      );
      return null;
    }
    return targetLocations;
  }
);

/**
 *  Find all references capability
 *   - on "X Y R" --> find all other "X Y R"
 *   - on "X Y obj" --> find all "X Y R"
 *   - on in-use entries "\d{10} \d{5} n" --> find all "X Y R" where X=object number and Y=\d{5}
 */
connection.onReferences((params): Location[] | null => {
  // console.log(`onReferences for ${params.textDocument.uri}`);

  const docData = pdfDocumentData.get(params.textDocument.uri);
  const document = documents.get(params.textDocument.uri);
  if (!docData || !docData.xrefMatrix || !document) return null;

  const position = params.position;
  const token = getSemanticTokenAtPosition(document, position);
  if (!token) return null;

  let objectNumber: number;
  let genNumber: number;
  const lineText = document.getText(token.range);

  switch (token.type) {
    case "indirectReference": // X Y R
    case "indirectObject": {
      // X Y obj
      const objMatch = lineText.match(/(\d+) (\d+)/);
      if (!objMatch) return null;

      objectNumber = parseInt(objMatch[1]);
      genNumber = parseInt(objMatch[2]);
      break;
    }
    case "xrefTableEntry": {
      // only for in-use entries!
      const match = lineText.match(/\b(\d{10}) (\d{5}) n\b/);
      if (!match) return null;

      const offset = parseInt(match[1]);
      genNumber = parseInt(match[2]);
      const xRefInfo = docData.xrefMatrix;
      objectNumber = xRefInfo.getObjectNumberBasedOnByteOffset(
        offset,
        genNumber,
        "n"
      );
      break;
    }
    default:
      return null;
  }

  // Sanity check object ID values
  if (objectNumber <= 0 || genNumber < 0) {
    console.warn(
      `Invalid object ID for indirect reference "${objectNumber} ${genNumber} R"!`
    );
    return null;
  }

  // Find all "X Y R"
  const references = findAllReferences(objectNumber, genNumber, document);

  // Handle degenerate condition (no references found)
  if (references.length == 0) {
    console.warn(
      `No indirect references "${objectNumber} ${genNumber} R" where found!`
    );
    return null;
  }
  return references;
});

/**
 * Hover capabilities:
 *   - on "X Y obj" --> hover says how many references, etc.
 *   - on "X Y R" --> hover says how many objects, etc.
 *   - on conventional cross reference table entries --> hover says object number, etc.
 */
connection.onHover((params): Hover | null => {
  // console.log(`onHover for ${params.textDocument.uri}`);

  const docData = pdfDocumentData.get(params.textDocument.uri);
  const document = documents.get(params.textDocument.uri);
  if (!docData || !docData.xrefMatrix || !document) return null;

  const position = params.position;
  const token = getSemanticTokenAtPosition(document, position);
  if (!token) return null;

  const semanticTokenText = document.getText(token.range);
  const xRefInfo = docData.xrefMatrix;

  switch (token.type) {
    case "xrefTableEntry": {
      // both in-use and free
      const match = semanticTokenText.match(/\b(\d{10}) (\d{5}) (n|f)\b/);
      if (!match) return null;

      const offset = parseInt(match[1]);
      const genNum = parseInt(match[2]);
      const flag = match[3];
      const objNum = xRefInfo.getObjectNumberBasedOnByteOffset(
        offset,
        genNum,
        flag
      );
      if (flag === "n") {
        return { contents: `Object ${objNum} is at byte offset ${offset}` };
      } else {
        return { contents: `Object ${objNum} is a free object` };
      }
      break;
    }

    case "indirectReference": {
      // X Y R
      const match = semanticTokenText.match(/\b(\d+) (\d+)\b/);
      if (!match) return null;

      const objectNumber = parseInt(match[1]);
      const genNumber = parseInt(match[2]);
      const objects = findAllDefinitions(objectNumber, genNumber, document);
      if (objects.length == 0)
        return {
          contents: `No object found for indirect reference "${objectNumber} ${genNumber} R"`,
        };
      else if (objects.length == 1)
        return {
          contents: `One object found for "${objectNumber} ${genNumber} R"`,
        };
      else
        return {
          contents: `${objects.length} objects found for "${objectNumber} ${genNumber} R"`,
        };
      break;
    }

    case "indirectObject": {
      // X Y obj
      const match = semanticTokenText.match(/\b(\d+) (\d+)\b/);
      if (!match) return null;

      const objectNumber = parseInt(match[1]);
      const genNumber = parseInt(match[2]);
      const references = findAllReferences(objectNumber, genNumber, document);
      if (references.length == 0)
        return {
          contents: `No indirect references to object ${objectNumber} ${genNumber} found.`,
        };
      else if (references.length == 1)
        return {
          contents: `One indirect reference to object ${objectNumber} ${genNumber}`,
        };
      else
        return {
          contents: `${references.length} indirect references to object ${objectNumber} ${genNumber}`,
        };
      break;
    }

    case "endobjKeyword": // "endobj"
    case "endstreamKeyword": {
      // "endstream"
      // Look back up the file to find closest matching "\d+ \d+ obj"
      const lineNbr = findPreviousObjectLineNumber(position, document);
      if (lineNbr !== -1) {
        const lineStr = document.getText({
          start: { line: lineNbr, character: 0 },
          end: { line: lineNbr, character: Number.MAX_VALUE },
        });
        return { contents: `Line ${lineNbr + 1}: "${lineStr}"` };
      }
      break;
    }

    case "bitMask": {
      // a bitmask entry
      const match = semanticTokenText.match(
        /\/(F|Ff|Flags)[ \t\r\n\f\0]([+-]?\d+)/
      );
      if (!match || match.length != 3) return null;
      const bm = parseInt(match[2]);
      return { contents: flags32_to_binary(bm) };
    }

    case "hexString": {
      // a hex string
      const match = semanticTokenText.match(/<([0-9a-fA-F \t\n\r\f\0]+)>/);
      if (!match || match.length != 2) return null;

      let hexString = match[1].trim().replace(/ \t\n\r\f\0/g, ""); // remove all whitespace
      if (hexString.length === 0) return { contents: `Empty hex string` };

      hexString = hexString.length % 2 ? hexString + "0" : hexString;

      let asUTF8 = "'";
      for (let i = 0; i < hexString.length; i += 2) {
        const s = String.fromCharCode(parseInt(hexString.slice(i, i + 2), 16));
        asUTF8 += s;
      }
      asUTF8 += "'";
      return { contents: asUTF8 };
    }

    default:
      break;
  }

  return null;
});

connection.onDocumentSymbol(
  (params: DocumentSymbolParams): DocumentSymbol[] => {
    const { textDocument } = params;
    const document = documents.get(textDocument.uri);
    if (!document) return [];

    const pdfParser = new PDFParser(document);
    const symbols: DocumentSymbol[] = [];

    const addObjectSymbols = (objectList: any[]): DocumentSymbol[] => {
      return objectList.map((obj) => {
        const children: DocumentSymbol[] = [];
        if (pdfParser.hasStreamInsideObject(obj)) {
          children.push({
            name: "Stream",
            kind: SymbolKind.Method,
            range: pdfParser.getStreamRangeInsideObject(obj),
            selectionRange: pdfParser.getStreamSelectionRangeInsideObject(obj),
          });
        }
        return {
          name: `Object ${obj.id}`,
          kind: SymbolKind.Method,
          range: obj.getRange(),
          selectionRange: obj.getSelectionRange(),
          children: children,
        };
      });
    };

    if (pdfParser.hasHeader()) {
      symbols.push({
        name: "Header",
        kind: SymbolKind.Module,
        range: pdfParser.getHeaderRange(),
        selectionRange: pdfParser.getHeaderSelectionRange(),
        children: [],
      });
    }

    if (pdfParser.hasOriginalContent()) {
      const originalPdfSymbol: DocumentSymbol = {
        name: "Original PDF",
        kind: SymbolKind.Class,
        range: pdfParser.getOriginalContentRange(),
        selectionRange: pdfParser.getOriginalContentSelectionRange(),
        children: [],
      };

      const bodySectionSymbol: DocumentSymbol = {
        name: "Body",
        kind: SymbolKind.Method,
        range: pdfParser.getBodySectionRange(),
        selectionRange: pdfParser.getBodySectionSelectionRange(),
        children: [],
      };

      const bodyObjects = pdfParser.getObjects();
      bodySectionSymbol.children?.push(...addObjectSymbols(bodyObjects));
      originalPdfSymbol.children?.push(bodySectionSymbol);

      if (pdfParser.hasTrailer()) {
        const trailerSymbol: DocumentSymbol = {
          name: "Trailer",
          kind: SymbolKind.Interface,
          range: pdfParser.getTrailerRange(),
          selectionRange: pdfParser.getTrailerSelectionRange(),
          children: [
            {
              name: "Trailer dictionary",
              kind: SymbolKind.Field,
              range: pdfParser.getTrailerDictionaryRange(),
              selectionRange: pdfParser.getTrailerDictionarySelectionRange(),
            },
          ],
        };

        originalPdfSymbol.children?.push(trailerSymbol);
      }

      if (pdfParser.hasCrossReferenceTable()) {
        const crossReferenceSymbol: DocumentSymbol = {
          name: "Cross reference table",
          kind: SymbolKind.Property,
          range: pdfParser.getCrossReferenceTableRange(),
          selectionRange: pdfParser.getCrossReferenceTableSelectionRange(),
          children: [],
        };
        originalPdfSymbol.children?.push(crossReferenceSymbol);
      }

      symbols.push(originalPdfSymbol);
    }

    let updateCount = 1;
    let currentPosition = pdfParser.getOriginalContentEndPosition();
    while (pdfParser.hasMoreContent(currentPosition)) {
      const incrementalUpdateSymbol: DocumentSymbol = {
        name: `Incremental Update ${updateCount}`,
        kind: SymbolKind.Namespace,
        range: pdfParser.getBodyRange(currentPosition),
        selectionRange: pdfParser.getBodySelectionRange(currentPosition),
        children: [],
      };

      const bodySectionSymbol: DocumentSymbol = {
        name: "Body",
        kind: SymbolKind.Method,
        range: pdfParser.getBodySectionRange(updateCount),
        selectionRange: pdfParser.getBodySectionSelectionRange(updateCount),
        children: [],
      };

      const bodyObjects =
        pdfParser.getObjectsFromIncrementalUpdate(updateCount);

      bodySectionSymbol.children?.push(...addObjectSymbols(bodyObjects));
      incrementalUpdateSymbol.children?.push(bodySectionSymbol);

      const incrementalCrossReferenceSymbol: DocumentSymbol = {
        name: "Cross reference table",
        kind: SymbolKind.Property,
        range: pdfParser.getCrossReferenceTableRangeFromIncrement(updateCount),
        selectionRange:
          pdfParser.getCrossReferenceTableSelectionRangeFromIncrement(
            updateCount
          ),
        children: [],
      };
      const incrementalTrailerSymbol: DocumentSymbol = {
        name: "Trailer",
        kind: SymbolKind.Interface,
        range: pdfParser.getTrailerRangeFromIncrement(updateCount),
        selectionRange:
          pdfParser.getTrailerSelectionRangeFromIncrement(updateCount),
        children: [
          {
            name: "Trailer dictionary",
            kind: SymbolKind.Field,
            range:
              pdfParser.getTrailerDictionaryRangeFromIncrement(updateCount),
            selectionRange:
              pdfParser.getTrailerDictionarySelectionRangeFromIncrement(
                updateCount
              ),
          },
        ],
      };

      incrementalUpdateSymbol.children?.push(
        incrementalCrossReferenceSymbol,
        incrementalTrailerSymbol
      );

      symbols.push(incrementalUpdateSymbol);

      currentPosition = pdfParser.getIncrementalUpdateEndPosition(updateCount);
      updateCount++;
    }
    return symbols;
  }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

class SemanticTokensBuilder {
  private _data: number[] = [];

  public push(
    line: number,
    char: number,
    length: number,
    tokenType: number,
    tokenModifier: number
  ) {
    this._data.push(line, char, length, tokenType, tokenModifier);
  }

  public build(): any {
    return {
      data: this._data,
    };
  }
}

/**
 * Perform basic validation of a conventional PDF:
 * 1. check 1st line for valid "%PDF-x.y" header, including known PDF version
 * 2. check 2nd line for binary file marker line with 4 bytes > 127
 * 3. check last line for "%%EOF"
 * 4. check conventional PDF file: xref, trailer and startxref keywords need to exist
 * 5. check that a conventional cross-reference table is correct for an original PDF
 */
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // console.log(`validateTextDocument for ${textDocument.uri}`);
  let diagnostics: Diagnostic[] = [];

  const text = textDocument.getText();
  // Rebuild cross-reference table information in case anything changed.
  updateXrefMatrixForDocument(textDocument.uri, text);

  const addDiagnostic = (
    start: Position,
    end: Position,
    message: string,
    severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) => {
    diagnostics.push({
      severity,
      range: { start, end },
      message,
      source: "pdf-cos-syntax",
    });
  };

  // Validate PDF/FDF header
  const firstLine = textDocument.getText({
    start: Position.create(0, 0),
    end: Position.create(0, 8),
  });
  if (isFileFDF(textDocument)) {
    if (!firstLine.startsWith("%FDF-")) {
      addDiagnostic(
        Position.create(0, 0),
        Position.create(0, 5),
        'First line of FDF does not start with required file marker "%FDF-"'
      );
    }
    if (!["1.2"].includes(firstLine.slice(5, 8))) {
      addDiagnostic(
        Position.create(0, 5),
        Position.create(0, 8),
        "FDF header version is not valid: should be 1.2"
      );
    }
  } else if (isFilePDF(textDocument)) {
    if (!firstLine.startsWith("%PDF-")) {
      addDiagnostic(
        Position.create(0, 0),
        Position.create(0, 5),
        'First line of PDF does not start with required file marker "%PDF-"'
      );
    }
    if (
      !["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "2.0"].includes(
        firstLine.slice(5, 8)
      )
    ) {
      addDiagnostic(
        Position.create(0, 5),
        Position.create(0, 8),
        "PDF header version is not valid: should be 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7 or 2.0"
      );
    }
  } else {
    addDiagnostic(
      Position.create(0, 0),
      Position.create(0, 0),
      'PDF file extension should be ".pdf"'
    );
  }

  // Validate 2nd line of both PDF and FDF
  const encoder = new TextEncoder(); // UTF-8 codepoints --> bytes
  const secondLine = textDocument.getText({
    start: Position.create(1, 0),
    end: Position.create(1, 5),
  });
  if (secondLine.charCodeAt(0) !== "%".charCodeAt(0)) {
    addDiagnostic(
      Position.create(1, 0),
      Position.create(1, 5),
      "2nd line in PDF/FDF should be a binary file marker comment (%)",
      DiagnosticSeverity.Warning
    );
  }
  let bytes = encoder.encode(secondLine);
  bytes = bytes.slice(1, 5); // 1st 4 bytes after '%' (could be 2-, 3- or 4-byte UTF-8 sequences)
  if ([...bytes.slice(0)].some((i) => i <= 127)) {
    addDiagnostic(
      Position.create(1, 0),
      Position.create(1, 5),
      "2nd line in PDF/FDF should be the binary file marker comment (%) with at least 4 bytes > 127",
      DiagnosticSeverity.Warning
    );
  }

  // Validate "%%EOF" marker for both PDF and FDF
  let i = textDocument.lineCount - 1;
  let lastLine = textDocument
    .getText({ start: Position.create(i, 0), end: Position.create(i, 6) })
    .trim();
  while (lastLine.length === 0) {
    i--;
    lastLine = textDocument
      .getText({ start: Position.create(i, 0), end: Position.create(i, 6) })
      .trim();
  }
  if (!lastLine.startsWith("%%EOF")) {
    const position = Position.create(i, 0);
    addDiagnostic(
      position,
      position,
      'PDF/FDF files must end with a line "%%EOF"'
    );
  }

  // Validate keywords needed in conventional PDFs (not FDF)
  if (isFilePDF(textDocument)) {
    ["trailer", "startxref", "xref"].forEach((keyword) => {
      if (!new RegExp(`${keyword}\\b`, "g").test(text)) {
        addDiagnostic(
          Position.create(0, 0),
          Position.create(0, 8),
          `PDF does not contain the "${keyword}" keyword required in a conventional PDF`
        );
      }
    });

    // Check for correct cross-reference table for an original PDF:
    // 3 lines, in order: "xref", "0 \d+", "\d{10} 65535 f" allowing for PDFs variable EOLs
    // If that works, then know number of objects in cross-ref table and whether there are any free objects
    const firstXref = new RegExp(
      `xref\\s+0 (\\d+)\\s+(\\d{10}) (\\d{5}) f\\b`,
      "m" // multi-line regex!
    ).exec(text);
    if (!firstXref) {
      addDiagnostic(
        Position.create(0, 0),
        Position.create(0, 8),
        "PDF does not contain a conventional cross reference table starting with object 0 (beginning of the free list)"
      );
    }

    // Get the list of diagnostics generated by the XRefMatrix building process
    const docData = pdfDocumentData.get(textDocument.uri);
    if (
      docData &&
      docData.xrefMatrix &&
      docData.xrefMatrix.diagnostics.length > 0
    ) {
      diagnostics = diagnostics.concat(docData.xrefMatrix.diagnostics);
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function tokenizeDocument(document: TextDocument): any {
  const tokensBuilder = new SemanticTokensBuilder();

  for (let line = 0; line < document.lineCount; line++) {
    const currentLine = document.getText({
      start: { line: line, character: 0 },
      end: { line: line, character: Number.MAX_VALUE },
    });

    const pattern = new RegExp(/(\d+ \d+ R)/, "g");
    let match;
    while ((match = pattern.exec(currentLine)) !== null) {
      tokensBuilder.push(
        line,
        match.index,
        match[0].length,
        tokenTypes.indexOf("indirectReference"),
        0 // assuming no modifier
      );
    }

    // pattern = new RegExp(/(\d+ \d+ obj)/, "g");
    // while ((match = pattern.exec(currentLine)) !== null) {
    //   tokensBuilder.push(
    //     line,
    //     match.index,
    //     match[0].length,
    //     tokenTypes.indexOf("indirectObject"),
    //     0  // assuming no modifier
    //   );
    // }

    // ... other token matchers ...
  }

  return tokensBuilder.build();
}

async function getDocumentSettings(resource: string): Promise<PDFDocumentData> {
  const currentData = pdfDocumentData.get(resource) || {
    settings: globalSettings,
  };
  const newSettings = await connection.workspace.getConfiguration({
    scopeUri: resource,
    section: "pdf-cos-syntax",
  });
  pdfDocumentData.set(resource, { ...currentData, settings: newSettings });
  return { ...currentData, settings: newSettings };
}

function updateXrefMatrixForDocument(uri: string, content: string) {
  let docData = pdfDocumentData.get(uri);
  if (!docData) {
    docData = { settings: globalSettings }; // or fetch default settings
    pdfDocumentData.set(uri, docData);
  }

  // Create or update the XrefInfoMatrix for the document content
  docData.xrefMatrix = buildXrefMatrix(content);
}

function buildXrefMatrix(content: string): XrefInfoMatrix {
  // Create a new instance of the XrefInfoMatrix
  const xrefMatrix = new XrefInfoMatrix();
  const lines = content.split("\n");

  const mockPDFDocument: TextDocument = {
    getText: () => content,
    uri: "mockURI",
    languageId: "pdf",
    version: 1, // mock version
    positionAt: (offset: number) => {
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length >= offset) {
          return { line: i, character: offset - charCount };
        }
        charCount += lines[i].length + 1;
      }
      return {
        line: lines.length - 1,
        character: lines[lines.length - 1].length,
      };
    },
    offsetAt: (position: Position) => {
      let offset = 0;
      for (let i = 0; i < position.line; i++) {
        offset += lines[i].length + 1;
      }
      return offset + position.character;
    },
    lineCount: content.split("\n").length,
  };

  // Merge all xref tables found in the document into the matrix
  xrefMatrix.mergeAllXrefTables(mockPDFDocument);

  return xrefMatrix;
}
