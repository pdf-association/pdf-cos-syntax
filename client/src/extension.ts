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
'use strict';

import * as vscode from "vscode";
import * as path from "path";
import * as pdf from './pdfClientUtilities';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { PDFFoldingRangeProvider } from "./PDFFoldingRangeProvider";


let client: LanguageClient;
let pdfStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
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
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: vscode.workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "pdfCosSyntax",
    "PDF COS Syntax",
    serverOptions,
    clientOptions
  );

  const provider = new PDFFoldingRangeProvider();
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider({ scheme: "file", language: "pdf" }, provider),
    vscode.languages.registerFoldingRangeProvider({ scheme: "file", language: "fdf" }, provider),
    vscode.languages.registerFoldingRangeProvider({ scheme: "untitled", language: "pdf" }, provider),
    vscode.languages.registerFoldingRangeProvider({ scheme: "untitled", language: "fdf" }, provider)
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
  pdfStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  pdfStatusBarItem.command = 'pdf-cos-syntax.StatusBarClick';

  context.subscriptions.push(
    // Command palette custom command / editor context sub-menu options under "PDF" 
    vscode.commands.registerCommand('pdf-cos-syntax.imageA85DCT', uri=>commandHandler("imageA85DCT", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.imageAHexDCT', uri=>commandHandler("imageAHexDCT", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.imageA85', uri=>commandHandler("imageA85", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.imageAHex', uri=>commandHandler("imageAHex", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.dataA85', uri=>commandHandler("dataA85", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.dataAHex', uri=>commandHandler("dataAHex", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.convertLiteral2Hex', uri=>commandHandler("Literal2Hex", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.convertHex2Literal', uri=>commandHandler("Hex2Literal", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.convert2ObjectStream', uri=>commandHandler("2objectStream", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.convert2XrefStream', uri=>commandHandler("2XrefStream", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.2AsciiHex', uri=>commandHandler("2AsciiHex", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.2Ascii85', uri=>commandHandler("2Ascii85", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.FromAsciiHex', uri=>commandHandler("FromAsciiHex", context, uri)),
    vscode.commands.registerCommand('pdf-cos-syntax.FromAscii85', uri=>commandHandler("FromAscii85", context, uri)),
    // Status bar
    vscode.commands.registerCommand('pdf-cos-syntax.StatusBarClick', uri=>statusBarClick(context, uri)),
    pdfStatusBarItem,
    vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem),
    vscode.window.onDidChangeTextEditorSelection(updateStatusBarItem)
  ); 
  
  // update status bar item once at start
  updateStatusBarItem();

  // Start the client. This will also launch the LSP server
  client.start();
}


/**
 * Update status bar (far left) with # of selected lines and bytes
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
    lines = editor.selections.reduce((prev, curr) => prev + (curr.end.line - curr.start.line), 0);
  }
  return lines;
}


/**
 * Action to peform when custom status bar item is clicked 
 */
export function statusBarClick(context: vscode.ExtensionContext, uri: vscode.Uri) {
  const lines = getNumberOfSelectedLines(vscode.window.activeTextEditor);
  vscode.window.showInformationMessage(`${lines} line(s) selected.`);
}


/**
 * Perform a custom command 
 * @param option - the PDF COS Syntax extension custom command 
 * @param context - the context
 * @param uri - uri of current document
 */
export async function commandHandler(option: string, context: vscode.ExtensionContext, uri: vscode.Uri) {
  const editor = vscode.window.activeTextEditor;
  const selection = editor.selection;
  const inp = editor.document.getText(editor.selection); 
  let out: string; 

  switch (option) {
    case "imageA85DCT": await pdf.convertImageToAscii85DCT().then((pdf) => { out = pdf.join('\n'); }); break;
    case "imageAHexDCT": await pdf.convertImageToAsciiHexDCT().then((pdf) => { out = pdf.join('\n'); }); break;
    case "imageA85": await pdf.convertImageToRawAscii85().then((pdf) => { out = pdf.join('\n'); }); break;
    case "imageAHex": await pdf.convertImageToRawAsciiHex().then((pdf) => { out = pdf.join('\n'); }); break;
    case "dataA85": await pdf.convertDataToAscii85().then((pdf) => { out = pdf.join('\n'); }); break;
    case "dataAHex": await pdf.convertDataToAsciiHex().then((pdf) => { out = pdf.join('\n'); }); break;
    case "2objectStream": out = pdf.objectsToObjectStream(inp.split(`\n`)).join('\n'); break;
    case "2XrefStream": out = pdf.xrefToXRefStream(inp.split(`\n`)).join('\n'); break;
    case "2AsciiHex": out = pdf.convertToAsciiHexFilter(Buffer.from(inp, 'utf8')).join(`\n`); break;
    case "2Ascii85": out = pdf.convertToAscii85Filter(Buffer.from(inp, 'utf8')).join(`\n`); break;
    case "FromAsciiHex": out = pdf.convertFromAsciiHexFilter(inp); break;
    case "FromAscii85": out = pdf.convertFromAscii85Filter(inp); break;
    case "Literal2Hex": {
      // Need to select a full literal string
      if ((inp[0] == "(") && (inp[inp.length - 1] === ")"))
        out = pdf.convertLiteralToHexString(inp); 
      break;
    }
    case "Hex2Literal": {
      // Need to select a full hex string incl. whitespace
      if (inp.match(/^<[0-9a-fA-F \t\0\r\n\f]*>$/))
        out = pdf.convertHexToLiteralString(inp); 
      break;
    }
    default: break;
  }

  // Replace highlighted text with output, if something was returned
  if (out.trim().length > 0) {
    editor.edit(editBuilder => {
      editBuilder.replace(selection, out);
    });
  }

  // // Test PDF name normalization
  // pdf.normalizedPDFname("/A#42");
  // pdf.normalizedPDFname("/paired#28#29parentheses");
} 

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
