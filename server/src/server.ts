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
  Hover,
  // Range,
} from "vscode-languageserver/node";

import { Range, TextDocument } from "vscode-languageserver-textdocument";

import {
  getLineFromByteOffset,
  extractAllXrefTables,
  findAllReferences,
  isFileFDF,
  isFilePDF,
  getSemanticTokenAtPosition,
  computeDefinitionLocationForToken,
  XrefInfoMatrix,
} from "./pdfUtils";

// for server debug.
import { debug } from "console";
import { TextEncoder } from "util";

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

const tokenTypes = ["indirectReference", "indirectObject", "xrefTableEntry"]; // ... add other token types as needed
// const tokenModifiers = ["deprecated"]; // ... add other token modifiers as needed

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

interface SimpleTextDocument {
  getText(): string;
}
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 100 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
type DocumentData = {
  settings: ExampleSettings;
  xrefMatrix?: XrefInfoMatrix;
};
// const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();
const documentSettings: Map<string, DocumentData> = new Map();

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
      // textDocumentSync: TextDocumentSyncKind.Incremental,
      textDocumentSync: TextDocumentSyncKind.Full,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      definitionProvider: true,
      referencesProvider: true,
      hoverProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: ["indirectReference", "indirectObject", "xrefTableEntry"],
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
connection.onDefinition(
  (params: TextDocumentPositionParams): Definition | null => {
    const { textDocument, position } = params;
    // Get the document corresponding to the URI
    const document = documents.get(textDocument.uri);
    if (!document) return null;

    // Get conventional xref tables
    const xrefTables = extractAllXrefTables(document);
    if (!xrefTables.length) {
      return null;
    }
    // Fetch the semantic token at the given position
    const tokenInfo = getSemanticTokenAtPosition(document, position);
    // If no semantic token is found, return null
    if (!tokenInfo) return null;

    // Use the semantic token information to decide where the cursor should jump to.
    // This could be based on the token's type, range, or other properties.
    let targetLocation: Location | null = null;
    for (const xrefTable of xrefTables) {
      targetLocation = computeDefinitionLocationForToken(
        tokenInfo,
        document,
        xrefTable
      );

      if (targetLocation) {
        break;
      }
    }

    return targetLocation;
  }
);

connection.onReferences((params): Location[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

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
      const xRefinfo = new XrefInfoMatrix();
      xRefinfo.mergeAllXrefTables(document);
      objectNumber = xRefinfo.getObjectNumberBasedOnByteOffset(
        offset,
        genNumber,
        "n"
      );
      if (objectNumber === -1) return null;
      break;
    }
    default:
      return null;
  }

  return findAllReferences(objectNumber, genNumber, document);
});

connection.onHover((params): Hover | null => {
  const docData = documentSettings.get(params.textDocument.uri);
  const document = documents.get(params.textDocument.uri);
  if (!docData || !docData.xrefMatrix || !document) return null;

  const position = params.position;
  const token = getSemanticTokenAtPosition(document, position);

  if (!token) return null;

  const lineText = document.getText(token.range);
  const xRefInfo = docData.xrefMatrix;

  // xRefInfo.mergeAllXrefTables(docData);

  switch (token.type) {
    case "xrefTableEntry": {
      const match = lineText.match(/\b(\d{10}) (\d{5}) (n|f)\b/);
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
    case "indirectReference": // X Y R
    case "indirectObject": // X Y obj
    default:
      break;
  }

  return null;
});

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
    } else {
      // @TODO - check the xref table entries - for free list, that numObj matches entries, etc.
      const xrefTables = extractAllXrefTables(textDocument);
      xrefTables.forEach((xrefTable) => {
        const firstXref = new RegExp(
          `xref\\s+0 (\\d+)\\s+(\\d{10}) (\\d{5}) f\\b`,
          "m"
        ).exec(xrefTable);
        if (firstXref) {
          const xrefLine = getLineFromByteOffset(textDocument, firstXref.index);
          const numObj = parseInt(firstXref[1]);
          const nextFree = parseInt(firstXref[2]);
          const freeGen = parseInt(firstXref[3]);
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
          if (freeGen !== 65535) {
            addDiagnostic(
              Position.create(xrefLine, 0),
              Position.create(xrefLine, 4),
              `Object 0 at start of free list did not have a generation number of 65535 (was "${freeGen}")`
            );
          }
          // check if cross-reference table contains any prohibited stuff such as
          // comments, names, dicts, etc. (i.e. anything that is NOT: '0'-'9', 'f', 'n', or
          // PDF whitespace or PDF EOLs). Note that extractXrefTable() will have normalized '\r'
          // to '\n' too.
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
      });
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

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
        tokenTypes.indexOf("indirectReference"),
        0
      ); // assuming no modifier
    }

    // ... other token matchers ...
  }

  return tokensBuilder.build();
}

async function getDocumentSettings(resource: string): Promise<DocumentData> {
  // if (!hasConfigurationCapability) {
  //   return Promise.resolve(globalSettings);
  // }
  // let result = documentSettings.get(resource);
  // if (!result) {
  //   result = connection.workspace.getConfiguration({
  //     scopeUri: resource,
  //     section: "pdf-cos-syntax",
  //   });
  //   documentSettings.set(resource, result);
  // }
  // return result;
  const currentData = documentSettings.get(resource) || {
    settings: globalSettings,
  };
  const newSettings = await connection.workspace.getConfiguration({
    scopeUri: resource,
    section: "pdf-cos-syntax",
  });
  documentSettings.set(resource, { ...currentData, settings: newSettings });
  return { ...currentData, settings: newSettings };
}

function updateXrefMatrixForDocument(uri: string, content: string) {
  let docData = documentSettings.get(uri);
  if (!docData) {
    docData = { settings: globalSettings }; // or fetch default settings
    documentSettings.set(uri, docData);
  }

  // Create or update the XrefInfoMatrix for the document content
  docData.xrefMatrix = buildXrefMatrix(content);
}

function buildXrefMatrix(content: string): XrefInfoMatrix {
  // Create a new instance of the XrefInfoMatrix
  const xrefMatrix = new XrefInfoMatrix();

  const mockTextDocument: TextDocument = {
    getText: () => content,
    uri: "mockURI", // mock URI
    languageId: "plaintext", // or any language ID you want to mock
    version: 1, // mock version
    positionAt: (offset: number) => {
      // Mock implementation; adjust if necessary
      return { line: 0, character: offset };
    },
    offsetAt: (position: Position) => {
      // Mock implementation; adjust if necessary
      return position.character;
    },
    lineCount: content.split("\n").length,
    // Any other properties or methods from TextDocument should be added here in a similar fashion.
  };

  // Merge all xref tables found in the document into the matrix
  const diagnostics = xrefMatrix.mergeAllXrefTables(mockTextDocument);

  // In real-world use, you might want to handle diagnostics, e.g., log them or display them to users.
  for (const diag of diagnostics) {
    console.error(`[PDF Diagnostics] ${diag.message}`);
  }

  return xrefMatrix;
}
