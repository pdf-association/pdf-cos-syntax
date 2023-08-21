/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
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
  // Range,
} from "vscode-languageserver/node";

import { Range, TextDocument } from "vscode-languageserver-textdocument";

import {
  getLineFromByteOffset,
  getByteOffsetForObj,
  extractXrefTable,
  findAllReferences,
  isFileFDF,
  isFilePDF,
  getSemanticTokenAtPosition,
  computeDefinitionLocationForToken,
} from "./pdfUtils";

// for server debug.
import { debug } from "console";
import { TextEncoder } from "util";

if (process.env.NODE_ENV === "development") {
  debug(`Using development version of the language server`);
  // require("source-map-support").install();
}

// console.log('server debugging');
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

const tokenTypes = ["reference", "inUseObject", "xrefTableEntry"]; // ... add other token types as needed
const tokenModifiers = ["deprecated"]; // ... add other token modifiers as needed

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
      // textDocumentSync: TextDocumentSyncKind.Incremental,
      textDocumentSync: TextDocumentSyncKind.Full,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      definitionProvider: true,
      referencesProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: ["reference", "inUseObject", "xrefTableEntry"],
          tokenModifiers: ["deprecated"],
        },
        full: true,
      },
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

function tokenizeDocument(document: TextDocument): any {
  const tokensBuilder = new SemanticTokensBuilder();
  const lines = document.getText().split(/\r?\n/);

  for (let line = 0; line < lines.length; line++) {
    const currentLine = lines[line];
    const referenceMatch = currentLine.match(/(\d+) (\d+) R/);
    if (referenceMatch) {
      const startChar = referenceMatch.index!;
      const length = referenceMatch[0].length;
      tokensBuilder.push(
        line,
        startChar,
        length,
        tokenTypes.indexOf("reference"),
        0
      ); // assuming no modifier
    }

    // ... other token matchers ...
  }

  return tokensBuilder.build();
}

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 100 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <ExampleSettings>(
      (change.settings.languageServerExample || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "pdf-cos-syntax",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
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

/**
 * Perform basic validation of a conventional PDF:
 * 1. check 1st line for valid "%PDF-x.y" header, including known PDF version
 * 2. check 2nd line for binary file marker line with 4 bytes > 127
 * 3. check last line for "%%EOF"
 * 4. check conventional PDF file: xref, trailer and startxref keywords need to exist
 * 5. check that a conventional cross-reference table is correct for an original PDF
 */
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  const diagnostics: Diagnostic[] = [];
  const text = textDocument.getText();

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
      if (!new RegExp(`\\b${keyword}\\b`, "g").test(text)) {
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
      `\\bxref\\s+0 (\\d+)\\s+(\\d{10}) 65535 f\\b`
    ).exec(text);
    if (!firstXref) {
      addDiagnostic(
        Position.create(0, 0),
        Position.create(0, 8),
        "PDF does not contain a conventional cross reference table starting with object 0 (beginning of the free list)"
      );
    } else {
      // @TODO - check the xref table entries - for free list, that numObj matches entries, etc.
      const xrefLine = getLineFromByteOffset(textDocument, firstXref.index);
      const numObj = parseInt(firstXref[1]);
      const nextFree = parseInt(firstXref[2]);
      if (numObj < 5) {
        addDiagnostic(
          Position.create(xrefLine, 0),
          Position.create(xrefLine, 4),
          `Original PDF cross reference table only has ${numObj} objects which is too few for a valid PDF`,
          DiagnosticSeverity.Information
        );
      }
      if (nextFree !== 0) {
        addDiagnostic(
          Position.create(xrefLine, 0),
          Position.create(xrefLine, 4),
          "Original PDF cross reference table had at least 1 object on the free list",
          DiagnosticSeverity.Information
        );
      }
      // check if cross-reference table contains any prohibited stuff such as
      // comments, names, dicts, etc. (i.e. anything that is NOT: '0'-'9', 'f', 'n', or
      // PDF whitespace or PDF EOLs). Note that extractXrefTable() will have normalized '\r'
      // to '\n' too.
      const xrefTable = extractXrefTable(textDocument);
      if (xrefTable != null) {
        const badInXref = new RegExp(`([^0-9fn \t\r\n\0\x0C]+)`).exec(
          xrefTable
        );
        if (badInXref != null) {
          addDiagnostic(
            Position.create(xrefLine, 0),
            Position.create(xrefLine, 4),
            `PDF cross reference table contains illegal characters: "${badInXref[1]}"`
          );
        }
      }
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

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
 *  "Go to definition" for "X Y R" and in-use ("n") cross reference table entries
 */
// connection.onDefinition((params): Definition | null => {
//   const document = documents.get(params.textDocument.uri);
//   if (!document) {
//     return null;
//   }

//   if (!isFilePDF(document)) {
//     return null;
//   }

//   // Get text either side of the cursor. Because finding object definitions is limited to "X Y R", "X Y obj"
//   // and the 20-byte in-use cross reference table entries, first select VERY few bytes either side of
//   // character position on line (to try and avoid lines with adjacent "X Y R" for example):
//   // "[ 1 0 R 2 0 R 3 0 R ]" or "1 0 obj 2 0 R endobj"
//   // If this fails then assume it is a 20-byte in-use cross reference table entry and grab more bytes
//   const position = params.position;
//   let lineText = document.getText({
//     start: Position.create(position.line, Math.max(position.character - 5, 0)),
//     end: Position.create(position.line, position.character + 8)
//   });
//   // console.log(`Go To Definition = ${lineText}`);

//   // Get 1st conventional xref table (if one exists)
//   const xrefTable = extractXrefTable(document);
//   if (!xrefTable) {
//     return null;
//   }

//   let byteOffset = -1;
//   // find the object definition for an "X Y R" indirect reference. Avoid RG operator
//   const indirectObjMatch = lineText.match(/(\d+) (\d+) R(?=[^G])/);
//   if (indirectObjMatch) {
//     const objNum = parseInt(indirectObjMatch[1]);
//     const genNum = parseInt(indirectObjMatch[2]);
//     byteOffset = getByteOffsetForObj(objNum, genNum, xrefTable);
//     // console.log(`Go To Definition for ${objNum} ${genNum} R --> ${byteOffset}`);
//     if (byteOffset === -1) {
//       // No object matches indirect reference for <objNum, genNum>
//       return null;
//     }
//   }

//   // Add logic for "X Y obj" pattern --> assume at start of a line
//   lineText = document.getText({
//     start: Position.create(position.line, 0),
//     end: Position.create(position.line, 12)
//   });
//   const objMatch = lineText.match(/(\d+) (\d+) obj/);
//   if (objMatch && (byteOffset === -1)) {
//     // Make sure it's not already found by "X Y R"
//     const objNum = parseInt(objMatch[1]);
//     const genNum = parseInt(objMatch[2]);
//     byteOffset = getByteOffsetForObj(objNum, genNum, xrefTable);
//     // console.log(`Go To Definition for ${objNum} ${genNum} obj --> ${byteOffset}`);
//     if (byteOffset === -1) {
//       return null;
//     }
//   }

//   // find the object definition for a conventional xref table in-use ("n") entry --> get full entry
//   lineText = document.getText({
//     start: Position.create(position.line, 0),
//     end: Position.create(position.line, 24),
//   });
//   const xrefMatch = lineText.match(/\b(\d{10}) (\d{5}) n\b/);
//   if (xrefMatch && (byteOffset === -1)) {
//     byteOffset = parseInt(xrefMatch[1]);
//     // console.log(`Go To Definition for in-use object --> ${byteOffset}`);
//     if (byteOffset === -1) {
//       // For some reason the byte offset "\d{10}" didn't parseInt!
//       return null;
//     }
//   }

//   // Nothing relevant was selected for finding a definition
//   if (byteOffset === -1) {
//     return null;
//   }

//   const line = getLineFromByteOffset(document, byteOffset);
//   if (line === -1) {
//     return null;
//   }

//   return {
//     uri: params.textDocument.uri,
//     range: {
//       start: { line, character: 0 },
//       end: { line, character: 0 },
//     },
//   };
// });

connection.onDefinition(
  (params: TextDocumentPositionParams): Definition | null => {
    const { textDocument, position } = params;
console.log("position: ", position)
    // Get the document corresponding to the URI
    const document = documents.get(textDocument.uri);
    if (!document) return null;
    
    // Get 1st conventional xref table (if one exists)
    const xrefTable = extractXrefTable(document);
    if (!xrefTable) {
      return null;
    }
    // Fetch the semantic token at the given position
    const tokenInfo = getSemanticTokenAtPosition(document, position);
console.log("tokenInfo: ", tokenInfo)
    // If no semantic token is found, return null
    if (!tokenInfo) return null;

    // Use the semantic token information to decide where the cursor should jump to.
    // This could be based on the token's type, range, or other properties.
    const targetLocation: Location | null = computeDefinitionLocationForToken(
      tokenInfo,
      document,
      xrefTable
    );
console.log("targetLocation: ", targetLocation)
    return targetLocation;
  }
);

/**
 *  "Find all references" for "X Y R" and "X Y obj"
 */
connection.onReferences((params): Location[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  // Get text either side of the cursor. Because finding all references is limited to "X Y R"
  // or "X Y obj", select _very_ few bytes prior to current char position on the line (to try and
  // avoid lists of indirect references confusing things: "1 0 R 2 0 R") but still allowing for
  // large object numbers.
  const position = params.position;
  const lineText = document.getText({
    start: Position.create(position.line, Math.max(position.character - 4, 0)),
    end: Position.create(position.line, position.character + 10),
  });

  // Object ID = object number and generation number (may not always be 0)
  const objMatch = lineText.match(/(\d+) (\d+) (obj|R)/);
  if (!objMatch) {
    return null;
  }

  const objectNumber = parseInt(objMatch[1]);
  const genNumber = parseInt(objMatch[2]);
  return findAllReferences(objectNumber, genNumber, document);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

