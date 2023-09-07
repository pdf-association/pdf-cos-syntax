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
import * as path from "path";
import { workspace, ExtensionContext, languages, commands, Uri, window } from "vscode";

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
    // Register the server for local filesystem and unsaved files for both PDF and FDF
    documentSelector: [
      { scheme: "file", language: "pdf" },
      { scheme: "file", language: "fdf" },
      { scheme: "untitled", language: "pdf" },
      { scheme: "untitled", language: "fdf" },
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
    languages.registerFoldingRangeProvider({ scheme: "file", language: "pdf" }, provider),
    languages.registerFoldingRangeProvider({ scheme: "file", language: "fdf" }, provider),
    languages.registerFoldingRangeProvider({ scheme: "untitled", language: "pdf" }, provider),
    languages.registerFoldingRangeProvider({ scheme: "untitled", language: "fdf" }, provider)
  );
	
  // line commenting
  context.subscriptions.push(
    languages.setLanguageConfiguration("pdf", {
      comments: {
        lineComment: "%",
      },
    }),
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
