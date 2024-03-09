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
"use strict";

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
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
} from "vscode-languageserver/node";

import { TextDocument, Range } from "vscode-languageserver-textdocument";

import {
  isFileFDF,
  isFilePDF,
  flags32_to_binary,
  getSemanticTokenAtPosition,
  findAllDefinitions,
  findAllReferences,
  findPreviousObjectLineNumber,
  buildXrefMatrix,
} from "./utils/pdfUtils";

import {
  DictKeyCodeCompletion
} from "./utils/ArlingtonUtils";

// for server debug.
import { debug } from "console";
import { TextEncoder } from "util";
import PDFParser, { PDFSectionType } from "./parser/PdfParser";
import { PDFCOSSyntaxSettings, PDFDocumentData, PDFToken } from './types';
import { TOKEN_MODIFIERS, TOKEN_TYPES } from './types/constants';
import PDFObject from './models/PdfObject';
import * as ohmParser from './ohmParser';

if (process.env.NODE_ENV === "development") {
  debug(`Using development version of the language server`);
  // require("source-map-support").install();
}

// console.log('server is running');

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;


// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: PDFCOSSyntaxSettings = { 
  maxNumberOfProblems: 100,
  ignorePreambleAndPostamble: false,
  ignoreXRefLineLength: false,
  verboseLogging: false
};
let globalSettings: PDFCOSSyntaxSettings = defaultSettings;

const pdfDocumentData: Map<string, PDFDocumentData> = new Map();

function getPDFDocumentData(uri: string): PDFDocumentData | undefined {
  // Assuming you have a map or similar structure to store PDFDocumentData instances by URI
  return pdfDocumentData.get(uri);
}

function updatePDFDataBasedOnEdit(document: TextDocument, pdfData: PDFDocumentData | undefined): void {
  // Example: Update the XRefMatrix based on the document's content
  // This is purely illustrative and depends on your specific implementation needs
  if (pdfData) {
    const newParseResults = parseDocument(document.getText());
    pdfData.ohmParseResults = newParseResults.ohmParseResults;
    // pdfData.xrefMatrix = newParseResults.xrefMatrix;
  }
}

function parseDocument(documentText: string) {
  // Your parsing logic here
  // This is just a placeholder. Replace it with your actual implementation.
  return {
    ohmParseResults: {},
    xrefMatrix: {
      matrix: {},
      diagnostics: [],
      dumpMatrix: function() { /* implementation here */ },
      isObjectNumberValid: function() { /* implementation here */ },
      isObjectIDInUse: function() { /* implementation here */ },
      getObjectNumberBasedOnByteOffset: function() { /* implementation here */ },
      getByteOffsetOfInuseObjectID: function() { /* implementation here */ },
      getFirstLineNumberForObjectID: function() { /* implementation here */ },
      // ... add the rest of the required methods and properties here
    },
  };
}

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
  const document = change.document;
  if (document) {
    updateXrefMatrixForDocument(document.uri, document.getText());
  }
  const pdfData = getPDFDocumentData(change.document.uri);
  updatePDFDataBasedOnEdit(change.document, pdfData);
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

      // Tell the client that this server supports code completion for PDF names
      completionProvider: {
        resolveProvider: false, // change to true so onCompletionResolve() gets called
        triggerCharacters: [ "/" ]
      },
      definitionProvider: true,
      referencesProvider: true,
      hoverProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: TOKEN_TYPES,
          tokenModifiers: TOKEN_MODIFIERS,
        },
        full: true
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

// Entry point for Semantic Token parsing
connection.onRequest("textDocument/semanticTokens/full", (params) => { 
  // console.log(`Server onRequest "textDocument/semanticTokens/full"`);
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const text = document.getText();
  const tokens: PDFToken[] = ohmParser.getTokens(text);
  return tokens;
});


connection.onDidChangeConfiguration((change) => {
  // console.log(`Server onDidChangeConfiguration`);
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    pdfDocumentData.clear();
    getDocumentSettings().then((fetchedSettings) => {
      globalSettings = fetchedSettings;
      // Revalidate all open text documents with new settings
      documents.all().forEach(validateTextDocument);
    });
  } else {
    globalSettings = <PDFCOSSyntaxSettings>(
      (change.settings.pdscosSyntax || defaultSettings)
    );
    // Revalidate all open text documents with new settings
    documents.all().forEach(validateTextDocument);
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

async function getDocumentSettings(): Promise<PDFCOSSyntaxSettings> {
  const promise = new Promise<PDFCOSSyntaxSettings>((resolve, reject) => {
    const settings: PDFCOSSyntaxSettings = defaultSettings; 
    resolve(settings);
  });
  return promise;
}

// function generateDiagnostics(document: TextDocument): Diagnostic[] {
//   const diagnostics: Diagnostic[] = [];
//   const settings = getDocumentSettings(document.uri); // Fetch settings for this document

//   // Example logic for limiting diagnostics
//   for (const problem of analyzeDocument(document)) {
//     if (settings.allowPreambleAndPostamble || !problem.isPreambleOrPostamble) {
//       diagnostics.push(createDiagnostic(problem));
//       if (diagnostics.length >= settings.maxNumberOfProblems) break; // Limit reached
//     }
//   }

//   return diagnostics;
// }

// function log(message: string): void {
//   const settings = getGlobalSettings(); // Assuming a function to fetch global settings
//   if (settings.verboseLogging) {
//     console.log(message); // Only log if verbose logging is enabled
//   }
// }


// Only keep settings for open documents
documents.onDidClose((e) => {
  pdfDocumentData.delete(e.document.uri);
});

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  // console.log("Server onDidChangeWatchedFiles");
});


/** 
 * Intellisense code completion on "/" for PDF names.  Items are automatically 
 * sorted alphabetically and will auto-filter as the user types more.
 */ 
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code-complete got requested. 
    const cursor = _textDocumentPosition.position;
    const doc = documents.get(_textDocumentPosition.textDocument.uri);
    if (!doc) return [];
    return DictKeyCodeCompletion();
  }
);


/**
 * NOT USED unless completionProvider: { resolveProvider: false, ... }
 */ 
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
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

/**
 * Creates the Outline tree and breadcrumbs
 */
connection.onDocumentSymbol(
  (params: DocumentSymbolParams): DocumentSymbol[] => {
  const { textDocument } = params;
  const document = documents.get(textDocument.uri);
  if (!document) return [];

  const pdfParser = new PDFParser(document);
  const symbols: DocumentSymbol[] = [];

  // Add PDF Object to the list, with stream sub-object as necessary
  const addObjectSymbols = (objectList: PDFObject[]): DocumentSymbol[] => {
    return objectList.map((obj: PDFObject) => {
      const children: DocumentSymbol[] = [];
      if (pdfParser.hasObjectStreamInside(obj)) {
        const r3 = pdfParser.getObjectStreamRange(obj);
        if (r3)
          children.push({
            name: "Stream",
            kind: SymbolKind.Method,
            range: r3,
            selectionRange: r3,
          });
      }
      const r4 = pdfParser.getObjectRange(obj);
      return {
        name: `Object ${obj.getObjectID()}`,
        kind: SymbolKind.Object,
        range: r4,
        selectionRange: r4,
        children: children,
      };
    });
  };

  // For each file revision, build up the Outline based on the order 
  // discovered in the PDF file. DON'T ASSUME because editing can break things!!
  let r1: Range;
  for (let revision = 0; revision < pdfParser.getNumRevisions(); revision++) {
    let revisionName: string = `Incremental Update ${revision}`;
    if (revision === 0)
      revisionName = `Original PDF`;
    // console.group(`Revision ${revision} = ${revisionName}`);

    // Top level container for this revision
    r1 = pdfParser.getRevisionRange(revision);
    const revisionSymbol: DocumentSymbol = {
      name: revisionName,
      kind: SymbolKind.Namespace,
      range: r1,
      selectionRange: r1,
      children: [],
    };
  
    // Add the sections in this revision, in file order
    const fileOrder = pdfParser.getRevisionSectionOrder(revision);
    // console.log(JSON.stringify(fileOrder));

    for (const section of fileOrder) {
      switch (section) {
        case PDFSectionType.Header: {
            r1 = pdfParser.getHeaderRange(revision);
            revisionSymbol.children?.push({
              name: "Header",
              kind: SymbolKind.Interface,
              range: r1,
              selectionRange: r1, 
              children: [],
            });
            break;
          }

        case PDFSectionType.Body: {
            r1 = pdfParser.getBodyRange(revision);
            const bodySectionSymbol: DocumentSymbol = {
              name: "Body",
              kind: SymbolKind.Package,
              range: r1,
              selectionRange: r1,
              children: [],
            };
            const bodyObjects = pdfParser.getBodyObjects(revision);
            bodySectionSymbol.children?.push(...addObjectSymbols(bodyObjects));
            revisionSymbol.children?.push(bodySectionSymbol);
            break;
          }

        case PDFSectionType.CrossReference: {
            r1 = pdfParser.getCrossReferenceTableRange(0);
            const crossReferenceSymbol: DocumentSymbol = {
              name: "Cross reference table",
              kind: SymbolKind.Module,
              range: r1,
              selectionRange: r1,
              children: [],
            };
            revisionSymbol.children?.push(crossReferenceSymbol);
            break;
          }

        case PDFSectionType.Footer: {
            // Footer section includes one or more of: trailer, startxref and %%EOF
            // console.group(`Footer`);
            const subsections = pdfParser.getFooterSubsections(revision);
            // console.log(JSON.stringify(subsections));
            const footerSubSymbols: DocumentSymbol[] = [];
            for (const sect of subsections) {
              r1 = pdfParser.getFooterSubsectionRange(revision, sect);
              const footerSubSymbol: DocumentSymbol = {
                name: sect,
                kind: SymbolKind.Class,
                range: r1,
                selectionRange: r1,
                children: [],
              };
              footerSubSymbols.push(footerSubSymbol);
            }
            r1 = pdfParser.getFooterRange(revision);
            const footerSectionSymbol: DocumentSymbol = {
              name: "Footer",
              kind: SymbolKind.Package,
              range: r1,
              selectionRange: r1,
              children: footerSubSymbols,
            };
            revisionSymbol.children?.push(footerSectionSymbol);
            console.groupEnd();
            break;
          }

        default:
          throw new Error(`Unexpected PDF section ${section.toString()}!`);
        }
    }

    symbols.push(revisionSymbol);
    console.groupEnd();
  }

  // console.log(JSON.stringify(symbols, null, 2)); 
  return symbols;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();


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

  // Validate "%%EOF" marker for both PDF and FDF.
  // Degenerate case is an empty PDF!
  let i = textDocument.lineCount - 1;
  let lastLine = textDocument
    .getText({ start: Position.create(i, 0), end: Position.create(i, 6) })
    .trim();
  while ((lastLine.length === 0) && (i > 0)) {
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

function updateXrefMatrixForDocument(uri: string, content: string) {
  let docData = pdfDocumentData.get(uri);
  if (!docData) {
    docData = { settings: globalSettings }; // or fetch default settings
    pdfDocumentData.set(uri, docData);
  }

  // Create or update the XrefInfoMatrix for the document content
  docData.xrefMatrix = buildXrefMatrix(content);
}