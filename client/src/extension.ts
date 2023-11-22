/**
 * @brief VSCode PDF COS syntax language client
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

import * as vscode from "vscode";
import * as path from "path";
import * as pdf from "./pdfClientUtilities";
import * as sankey from "./sankey-webview";
import * as deasync from "deasync";

// Import shared definitions from Ohm-based tokenizing parser (server-side!)
import { TOKEN_TYPES, TOKEN_MODIFIERS, PDFToken, StreamType } from "./types";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { PDFFoldingRangeProvider } from "./PDFFoldingRangeProvider";

/////////////////////////////////////////////////////////////////////
// Some fake CSV data for now. NO header row!
const fakeData = [
  `Preamble,Cavity,16,red`,
  `"PDF file",Header,16,`,
  `"PDF file","Object 1",20,`,
  `"PDF file","Object 2",22,`,
  `"PDF file","Object 3",42,`,
  `"PDF file",Cavity,6,red`,
  `"PDF file","Object 4",15,`,
  `"PDF file","Object 6",3494,`,
  `"PDF file","Object 7",441,`,
  `"PDF file","Object 5",30,`,
  `"PDF file","Object 9",30,`,
  `"PDF file","Object 8",404,`,
  `"PDF file","Object 10",104,`,
  `"PDF file","Object 11",40,`,
  `"PDF file","Object 16",4050,`,
  `"PDF file","Object 15",4041,`,
  `"PDF file","Object 14",30,`,
  `"PDF file","Object 13",10,`,
  `"PDF file","Object 12",5,`,
  `"PDF file",xref,248,lightgreen`,
  `"PDF file",trailer,28,lightblue`,
  `"PDF file",EOF,6,blue`,
  `"Incremental Update 1","Object 4",27,`,
  `"Incremental Update 1","Object 17",485,`,
  `"Incremental Update 1","Object 18",72,`,
  `"Incremental Update 1","Object 19",46,`,
  `"Incremental Update 1","Object 22",120,`,
  `"Incremental Update 1","Object 23",4305,`,
  `"Incremental Update 1",xref,128,lightgreen`,
  `"Incremental Update 1",trailer,31,lightblue`,
  `"Incremental Update 1",EOF,6,blue`,
  `Gap,Cavity,12,red`,
  `"Incremental Update 2","Object 4",22,`,
  `"Incremental Update 2","Object 24",59,`,
  `"Incremental Update 2","Object 20",283,`,
  `"Incremental Update 2","Object 21",42,`,
  `"Incremental Update 2","Object 5",10,`,
  `"Incremental Update 2","Object 9",5,`,
  `"Incremental Update 2",xref,128,lightgreen`,
  `"Incremental Update 2",trailer,32,lightblue`,
  `"Incremental Update 2",EOF,6,blue`,
  `Postamble,Cavity,12,red`,
  `"Object 1",Document,20,`,
  `"Object 2",Document,22,`,
  `"Object 3",Document,42,`,
  `"Object 4","Page 1",27,Linen`,
  `"Object 5","Page 1",30,Linen`,
  `"Object 6","Page 1",3494,Linen`,
  `"Object 7","Page 1",441,Linen`,
  `"Object 8","Page 1",404,Linen`,
  `"Object 9",Document,30,`,
  `"Object 10",Document,104,`,
  `"Object 11","Page 2",40,LavenderBlush`,
  `"Object 12","Page 2",5,LavenderBlush`,
  `"Object 13","Page 2",10,LavenderBlush`,
  `"Object 14","Page 2",30,LavenderBlush`,
  `"Object 15","Page 2",4041,LavenderBlush`,
  `"Object 16","Page 2",4050,LavenderBlush`,
  `"Object 17","Page 1",485,Linen`,
  `"Object 18","Page 1",72,Linen`,
  `"Object 19","Page 1",46,Linen`,
  `"Object 20","Page 1",283,Linen`,
  `"Object 21","Page 1",42,Linen`,
  `"Object 22","Page 2",120,LavenderBlush`,
  `"Object 23","Page 2",4305,LavenderBlush`,
  `"Object 24","Page 2",59,LavenderBlush`,
  `"Page 1",Content,426,PaleGoldenRod`,
  `"Page 1",Fonts,1331,LightBlue`,
  `"Page 1",Colors,639,LightCyan`,
  `"Page 1",Images,1171,MistyRose`,
  `"Page 1",Annotations,0,Wheat`,
  `"Page 1",Tagged PDF,1065,PeachPuff`,
  `"Page 1",Other,692,OldLace`,
  `"Page 2",Content,1772,PaleGoldenRod`,
  `"Page 2",Fonts,2912,LightBlue`,
  `"Page 2",Colors,1772,LightCyan`,
  `"Page 2",Images,0,MistyRose`,
  `"Page 2",Annotations,772,Wheat`,
  `"Page 2",Tagged PDF,1899,PeachPuff`,
  `"Page 2",Other,3533,OldLace`,
];
const fakeDataCSV: string = fakeData.join("\n");
////////////////////////////////////////////////////////////////////////

let client: LanguageClient;
let pdfStatusBarItem: vscode.StatusBarItem;

// This is global data in the client for a single PDF
let semantic_doc_uri: vscode.Uri;
let pdf_tokens: PDFToken[] = [];
let semanticTokens: vscode.SemanticTokens;
const legend = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

export async function activate(context: vscode.ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for local filesystem and unsaved files for both PDF and FDF
    documentSelector: [
      { scheme: "file", language: "pdf" },
      { scheme: "file", language: "fdf" },
      { scheme: "untitled", language: "pdf" },
      { scheme: "untitled", language: "fdf" },
    ],
    // synchronize: {
    //   // Notify the server about file changes to '.clientrc files contained in the workspace
    //   fileEvents: vscode.workspace.createFileSystemWatcher("**/.clientrc"),
    // },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "pdfCosSyntax",
    "PDF COS Syntax",
    serverOptions,
    clientOptions
  );

  await client.start();

  const provider = new PDFFoldingRangeProvider();
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: "pdf" },
      provider
    ),
    vscode.languages.registerFoldingRangeProvider({ language: "fdf" }, provider)
  );

  // line commenting
  context.subscriptions.push(
    vscode.languages.setLanguageConfiguration("pdf", {
      comments: {
        lineComment: "%",
      },
    }),
    vscode.languages.setLanguageConfiguration("fdf", {
      comments: {
        lineComment: "%",
      },
    })
  );

  // create a new status bar item
  pdfStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  pdfStatusBarItem.command = "pdf-cos-syntax.StatusBarClick";

  context.subscriptions.push(
    // Command palette custom command / editor context sub-menu options under "PDF"
    vscode.commands.registerCommand("pdf-cos-syntax.imageA85DCT", (uri) =>
      commandHandler("imageA85DCT", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.imageAHexDCT", (uri) =>
      commandHandler("imageAHexDCT", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.imageA85", (uri) =>
      commandHandler("imageA85", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.imageAHex", (uri) =>
      commandHandler("imageAHex", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.dataA85", (uri) =>
      commandHandler("dataA85", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.dataAHex", (uri) =>
      commandHandler("dataAHex", context, uri)
    ),
    vscode.commands.registerCommand(
      "pdf-cos-syntax.convertLiteral2Hex",
      (uri) => commandHandler("Literal2Hex", context, uri)
    ),
    vscode.commands.registerCommand(
      "pdf-cos-syntax.convertHex2Literal",
      (uri) => commandHandler("Hex2Literal", context, uri)
    ),
    vscode.commands.registerCommand(
      "pdf-cos-syntax.convert2ObjectStream",
      (uri) => commandHandler("2objectStream", context, uri)
    ),
    vscode.commands.registerCommand(
      "pdf-cos-syntax.convert2XrefStream",
      (uri) => commandHandler("2XrefStream", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.2AsciiHex", (uri) =>
      commandHandler("2AsciiHex", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.2Ascii85", (uri) =>
      commandHandler("2Ascii85", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.FromAsciiHex", (uri) =>
      commandHandler("FromAsciiHex", context, uri)
    ),
    vscode.commands.registerCommand("pdf-cos-syntax.FromAscii85", (uri) =>
      commandHandler("FromAscii85", context, uri)
    ),
    // Status bar
    vscode.commands.registerCommand("pdf-cos-syntax.StatusBarClick", (uri) =>
      statusBarClick(context, uri)
    ),
    pdfStatusBarItem,
    vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem),
    vscode.window.onDidChangeTextEditorSelection(updateStatusBarItem)
  );

  // update status bar item once at start
  updateStatusBarItem();

  // Sankey Flow Diagram webview - initiated by Command Palette custom command
  context.subscriptions.push(
    vscode.commands.registerCommand("pdf-cos-syntax.sankey", () => {
      console.log(`pdf-cos-syntax.sankey`);
      sankey.SankeyPanel.createOrShow(context, fakeDataCSV);
    })
  );

  if (vscode.window.registerWebviewPanelSerializer) {
    // Make sure we register a serializer in activation event
    vscode.window.registerWebviewPanelSerializer(sankey.SankeyPanel.viewType, {
      async deserializeWebviewPanel(
        webviewPanel: vscode.WebviewPanel,
        state: any
      ) {
        console.log(`Got state: ${state}`);
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = sankey.getWebviewOptions(
          context.extensionUri
        );
        sankey.SankeyPanel.revive(webviewPanel, context);
      },
    });
  }

  // analyze the document and return semantic tokens
  const semanticProvider: vscode.DocumentSemanticTokensProvider = {
    provideDocumentSemanticTokens(
      document: vscode.TextDocument
    ): vscode.ProviderResult<vscode.SemanticTokens> {
      console.log(`provideDocumentSemanticTokens for ${document.uri}`);

      // if cached semantic tokens apply to this document URI then reuse
      if (!semanticTokens || document.uri !== semantic_doc_uri) {
        fetch_semantic_tokens_from_LSP(document);
      }
      return semanticTokens;
    },
  };

  const semanticPDFTokenProvider =
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "pdf" },
      semanticProvider,
      legend
    );
  const semanticFDFTokenProvider =
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "fdf" },
      semanticProvider,
      legend
    );
}

async function fetch_semantic_tokens_from_LSP(document: vscode.TextDocument) {
  const tokens = await requestFullSemanticTokens(document);
  pdf_tokens = tokens;
  const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
  for (let i = 0; i < pdf_tokens.length; i++) {
    const token = pdf_tokens[i];
    if (TOKEN_TYPES.includes(token.type)) {
      const range = new vscode.Range(
        new vscode.Position(token.line - 1, token.start),
        new vscode.Position(token.line - 1, token.end)
      );

      tokensBuilder.push(range, token.type);
    }
  }

  semanticTokens = tokensBuilder.build();
  semantic_doc_uri = document.uri;
}

/**
 * Update status bar (far right) with # of selected lines and bytes
 */
function updateStatusBarItem(): void {
  const lines = getNumberOfSelectedLines(vscode.window.activeTextEditor);
  if (lines > 0) {
    pdfStatusBarItem.text = `$(megaphone) ${lines} line(s) selected`;
    pdfStatusBarItem.show();
  } else {
    pdfStatusBarItem.hide();
  }
}

/**
 * Returns the number of selected lines in the specified editor.
 */
function getNumberOfSelectedLines(editor: vscode.TextEditor | undefined) {
  let lines: number = 0;
  if (editor) {
    lines = editor.selections.reduce(
      (prev, curr) => prev + (curr.end.line - curr.start.line),
      0
    );
  }
  return lines;
}

/**
 * Action to peform when custom status bar item is clicked
 */
export function statusBarClick(
  context: vscode.ExtensionContext,
  uri: vscode.Uri
) {
  const lines = getNumberOfSelectedLines(vscode.window.activeTextEditor);
  vscode.window.showInformationMessage(`${lines} line(s) selected.`);
}

/**
 * Perform a custom command
 * @param option - the PDF COS Syntax extension custom command
 * @param context - the context
 * @param uri - uri of current document
 */
export async function commandHandler(
  option: string,
  context: vscode.ExtensionContext,
  uri: vscode.Uri
) {
  const editor = vscode.window.activeTextEditor;
  const selection = editor.selection;
  const inp = editor.document.getText(editor.selection);

  // When inserting new content, need to account for current "editor.eol" setting: \r, \r\n
  // so length key values can be adjusted accordinly.
  const eol: vscode.EndOfLine = editor.document.eol;

  /** Pick a random object ID. @todo determine appropriately from PDF... */
  const objNum = 1;
  const genNum = 0;

  let out: string;

  switch (option) {
    case "imageA85DCT":
      await pdf.convertImageToAscii85DCT(objNum, genNum, eol).then((pdf) => {
        out = pdf.join("\n");
      });
      break;
    case "imageAHexDCT":
      await pdf.convertImageToAsciiHexDCT(objNum, genNum, eol).then((pdf) => {
        out = pdf.join("\n");
      });
      break;
    case "imageA85":
      await pdf.convertImageToRawAscii85(objNum, genNum, eol).then((pdf) => {
        out = pdf.join("\n");
      });
      break;
    case "imageAHex":
      await pdf.convertImageToRawAsciiHex(objNum, genNum, eol).then((pdf) => {
        out = pdf.join("\n");
      });
      break;
    case "dataA85":
      await pdf.convertDataToAscii85(objNum, genNum, eol).then((pdf) => {
        out = pdf.join("\n");
      });
      break;
    case "dataAHex":
      await pdf.convertDataToAsciiHex(objNum, genNum, eol).then((pdf) => {
        out = pdf.join("\n");
      });
      break;
    case "2objectStream":
      out = pdf.objectsToObjectStream(eol, inp.split(`\n`)).join("\n");
      break;
    case "2XrefStream":
      out = pdf
        .xrefToXRefStream(objNum, genNum, eol, inp.split(`\n`))
        .join("\n");
      break;
    case "2AsciiHex":
      out = pdf.convertToAsciiHexFilter(Buffer.from(inp, "utf8")).join(`\n`);
      break;
    case "2Ascii85":
      out = pdf.convertToAscii85Filter(Buffer.from(inp, "utf8")).join(`\n`);
      break;
    case "FromAsciiHex":
      out = pdf.convertFromAsciiHexFilter(inp);
      break;
    case "FromAscii85":
      out = pdf.convertFromAscii85Filter(inp);
      break;
    case "Literal2Hex": {
      // Need to select a full literal string incl. `(`/`)`
      if (inp[0] == "(" && inp[inp.length - 1] === ")")
        out = pdf.convertLiteralToHexString(inp);
      break;
    }
    case "Hex2Literal": {
      // Need to select a full hex string incl. whitespace and `<`/`>`
      if (inp.match(/^<[0-9a-fA-F \t\0\r\n\f]*>$/))
        out = pdf.convertHexToLiteralString(inp);
      break;
    }
    default:
      break;
  }

  // Replace highlighted text with output, if something was returned
  if (out.trim().length > 0) {
    editor.edit((editBuilder) => {
      editBuilder.replace(selection, out);
    });
  }

  /** @todo - move to hover. Test PDF name normalization */
  // pdf.normalizedPDFname("/A#42");
  // pdf.normalizedPDFname("/paired#28#29parentheses");
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}

// Function to request semantic tokens from the server
async function requestFullSemanticTokens(
  document: vscode.TextDocument
): Promise<PDFToken[]> {
  const tokens: PDFToken[] = (await client.sendRequest("semanticTokens/full", {
    textDocument: { uri: document.uri.toString() },
  })) as PDFToken[];
  return tokens;
}

// Function to determine the stream type based on the dictionary before the stream keyword
function determineStreamType(
  document: vscode.TextDocument,
  streamToken: PDFToken
): StreamType {
  // Extract the dictionary content before the streamToken
  const dictionaryContent = extractDictionary(document, streamToken);
  // Determine the stream type based on the content of the dictionary
  const dictionary = parseDictionary(dictionaryContent);
  // Determine the stream type based on the dictionary keys and values
  if (dictionary["/Subtype"] === "/Image") {
    return StreamType.Image;
  } else if (dictionary["/Type"] === "/EmbeddedFile") {
    if (dictionary["/Subtype"] === "/text/javascript") {
      return StreamType.JavaScript;
    } else if (dictionary["/Subtype"] === "/text/xml") {
      return StreamType.XML;
    }
  } else if (isBinaryStream(dictionary)) {
    return StreamType.Binary;
  }

  // If the stream type cannot be determined
  return StreamType.Unknown;
}

function extractDictionary(
  document: vscode.TextDocument,
  streamToken: PDFToken
): string {
  // Assuming streamToken includes position information to find the dictionary start
  const startPos = new vscode.Position(streamToken.line, 0); // Line start
  const endPos = document.positionAt(streamToken.start); // Start of the stream token
  const textRange = new vscode.Range(startPos, endPos);

  // Extract the text of the dictionary from the document
  const text = document.getText(textRange);

  const dictionaryStartIndex = text.lastIndexOf("<<");
  const dictionaryEndIndex = text.lastIndexOf(">>");

  if (dictionaryStartIndex !== -1 && dictionaryEndIndex !== -1) {
    return text.substring(dictionaryStartIndex, dictionaryEndIndex + 2);
  }

  return ""; // Return an empty string if the dictionary is not found
}

function parseDictionary(dictionaryText: string): Record<string, string> {
  const dictionary: Record<string, string> = {};

  // Regex to match dictionary entries, simplistic and may need refinement
  const entryRegex = /\/(\w+)\s+((?:\/\w+)|(?:\(.*?\))|(?:".*?")|(?:\d+))/g;
  let match;

  while ((match = entryRegex.exec(dictionaryText))) {
    const key = match[1];
    const value = match[2];
    dictionary[`/${key}`] = value;
  }

  return dictionary;
}

function isBinaryStream(dictionary: Record<string, string>): boolean {
  if (dictionary["/Filter"]) {
    return true; // This is a simplistic check and may need more conditions
  }
  return false;
}

const streamTokenTypes = [
  "text",
  "embeddedJavaScript",
  "embeddedXML",
  "binary",
  "unknown",
];
const streamTokenModifiers = ["readonly", "static"];
const streamLegend = new vscode.SemanticTokensLegend(
  streamTokenTypes,
  streamTokenModifiers
);

function updateSyntaxHighlighting(
  editor: vscode.TextEditor,
  streamTokens: PDFToken[]
) {
  const builder = new vscode.SemanticTokensBuilder(streamLegend);

  streamTokens.forEach((token) => {
    const tokenTypeIndex = streamLegend.tokenTypes.indexOf(token.type);
    const tokenModifiersIndices = token.modifiers.map((mod: string) =>
      streamLegend.tokenModifiers.indexOf(mod)
    );

    const startPos = editor.document.positionAt(token.start);
    const endPos = editor.document.positionAt(token.end);
    const range = new vscode.Range(startPos, endPos);

    builder.push(range, token.type, token.modifiers);
  });

  // Apply the tokens to the editor
  const semanticTokens = builder.build();
  vscode.languages.registerDocumentSemanticTokensProvider(
    { language: "pdf" },
    {
      provideDocumentSemanticTokens() {
        return semanticTokens;
      },
    },
    streamLegend
  );
}

// async function processStreamTokens(
//   document: vscode.TextDocument,
//   token: PDFToken,
//   streamType: StreamType
// ) {
//   // Request the additional tokens for the stream content from the server
//   const streamTokens = await requestStreamTokens(
//     document.uri.toString(),
//     token,
//     streamType
//   );

//   const editor = vscode.window.activeTextEditor;
//   if (editor && editor.document === document) {
//     // Update the syntax highlighting for this stream
//     updateSyntaxHighlighting(editor, streamTokens);
//   }
// }

// This could be triggered by a command or automatically when a PDF document is opened/edited
// vscode.workspace.onDidOpenTextDocument(async (document) => {
//   if (document.languageId === "pdf") {
//     await processSemanticTokens(document);
//   }
// });

// vscode.window.onDidChangeTextEditorSelection((event) => {
//   const activeEditor = event.textEditor;
//   const document = activeEditor.document;
//   const position = event.selections[0].start;

//   // Check if the cursor is within a stream
//   const tokenAtCursor = getTokenAtPosition(document, position);
//   if (tokenAtCursor && tokenAtCursor.type === 'stream') {
//     // If within a stream, request detailed stream tokens
//     fetchAndApplyStreamTokens(document, tokenAtCursor);
//   }
// });

// vscode.window.onDidChangeTextEditorSelection((event) => {
//   console.log("abcdegfhijklmnopqrstuvwxyz");
//   const activeEditor = vscode.window.activeTextEditor;
//   if (activeEditor && activeEditor.document.languageId === 'pdf') {
//     const position = event.selections[0].start;
//     // Determine if the cursor is inside a stream block
//     if (isCursorInsideStream(position, activeEditor.document)) {
//       // Handle the stream content parsing
//     }
//   }
// });

vscode.window.onDidChangeTextEditorSelection(async (event) => {
  console.log("Selection changed in PDF document");
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && activeEditor.document.languageId === "pdf") {
    const position = event.selections[0].start;

    // Fetch the stored semantic tokens for the document
    const tokens = semanticTokens; // Assuming semanticTokens is accessible here

    // Determine if the cursor is inside a stream block
    const streamToken = tokens.find(
      (token) =>
        token.type === "stream" &&
        position.isAfterOrEqual(token.range.start) &&
        position.isBeforeOrEqual(token.range.end)
    );

    if (streamToken) {
      try {
        // Determine the type of the stream content
        const streamType = determineStreamType(
          activeEditor.document,
          streamToken
        );

        // Request detailed tokens for the stream
        const detailedTokens = await requestStreamTokens(
          activeEditor.document,
          streamToken,
          streamType
        );

        // Apply the detailed tokens for the stream
        applyStreamTokens(activeEditor, detailedTokens, streamToken);
      } catch (error) {
        console.error("Error fetching or applying stream tokens:", error);
      }
    }
  }
});

async function requestStreamTokens(
  document: vscode.TextDocument,
  streamToken: PDFToken,
  streamType: StreamType
) {
  const detailedTokens = await client.sendRequest("semanticTokens/stream", {
    textDocument: document.uri.toString(),
    range: streamToken.range,
    type: streamType,
  });
  return detailedTokens;
}

function isCursorInsideStream(position, document) {
  // const tokens = semanticTokens;
  // // Find if there's a stream token at the cursor's position
  // const streamToken = tokens.find(token => token.type === 'stream' && token.range.contains(position));
  // return streamToken !== undefined;
  return true;
}

// A global or higher scoped variable to hold detailed stream tokens, keyed by document URI
const detailedStreamTokensMap = new Map<string, PDFToken[]>();

// This function is called when detailed stream tokens are fetched
function applyStreamTokens(
  editor: vscode.TextEditor,
  detailedTokens: PDFToken[],
  streamToken: PDFToken
) {
  // Store the detailed tokens for the stream
  detailedStreamTokensMap.set(editor.document.uri.toString(), detailedTokens);

  // Trigger a refresh of the semantic tokens in the editor
  vscode.commands.executeCommand("editor.action.semanticToken.refresh");
}

const mySemanticTokensProvider: vscode.DocumentSemanticTokensProvider = {
  provideDocumentSemanticTokens(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder(legend);

    // Check if we have detailed stream tokens for this document
    const detailedTokens = detailedStreamTokensMap.get(document.uri.toString());
    if (detailedTokens) {
      // Apply the detailed stream tokens using the builder
      for (const token of detailedTokens) {
        const line = token.range.start.line;
        const startIndex = token.range.start.character;
        const length = token.range.end.character - startIndex;
        const tokenType = legend.tokenTypes.indexOf(token.type);
        const tokenModifiers = 0; // Compute any modifiers if necessary

        builder.push(line, startIndex, length, tokenType, tokenModifiers);
      }
      // Remove the detailed tokens from the map after using them
      detailedStreamTokensMap.delete(document.uri.toString());
    } else {
      // Tokenize the document initially and fill the builder
      // ... (existing logic)
    }

    return builder.build();
  },
};
