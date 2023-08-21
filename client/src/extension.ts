/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from "path";
import { workspace, ExtensionContext, languages } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { PDFFoldingRangeProvider } from "./PDFFoldingRangeProvider";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
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
    // Register the server for plain text documents for both PDF and FDF
    documentSelector: [
      { scheme: "file", language: "pdf" },
      { scheme: "file", language: "fdf" },
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
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
    languages.registerFoldingRangeProvider("pdf", provider)
  );
  context.subscriptions.push(
    languages.registerFoldingRangeProvider("fdf", provider)
  );
	
  // line commenting
  context.subscriptions.push(
    languages.setLanguageConfiguration("pdf", {
      comments: {
        lineComment: "%",
      },
    })
  );

  context.subscriptions.push(
    languages.setLanguageConfiguration("fdf", {
      comments: {
        lineComment: "%",
      },
    })
  );
  
  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
