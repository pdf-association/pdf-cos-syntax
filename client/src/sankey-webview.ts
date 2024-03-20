/**
 * VSCode PDF COS syntax client-side Sankey webview functionality
 *
 * @copyright Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Author: Peter Wyatt, PDF Association
 *
 * @remarks
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
'use strict';

import * as vscode from "vscode";

export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  // console.log(`getWebviewOptions = ${vscode.Uri.joinPath(extensionUri, 'media')}`);
  return {
    // Enable JavaScript and forms in the webview
    enableScripts: true,
    enableForms: true,
    // And restrict the webview to only loading content from our extension's `media` directory.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
  };
}

/**
 * Manages Sankey Flow Diagram webview panels
 */
export class SankeyPanel 
{
  /** Track the current panel. Only allow a single panel to exist at a time. */
  public static currentPanel: SankeyPanel | undefined;
  public static readonly viewType = 'pdf';
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext, csvData: string) {
    // console.log(`createOrShow ${context.extensionUri}`);

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (SankeyPanel.currentPanel) {
      SankeyPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      SankeyPanel.viewType,
      'Sankey Flow Diagram',
      column || vscode.ViewColumn.One,
      getWebviewOptions(context.extensionUri),
    );

    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.type) {
          default:
            console.log(`onDidReceiveMessage: ${message.type} ${message.value}`); break;
        }
      },
      undefined,
      context.subscriptions
    );
    
    SankeyPanel.currentPanel = new SankeyPanel(panel, context);
    panel.webview.postMessage({ type: {type: 'CSV-Data', value: csvData } });
  }

  public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    // console.log(`revive`);
    SankeyPanel.currentPanel = new SankeyPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    // console.log(`constructor`);
    this._panel = panel;
    this._extensionUri = context.extensionUri;

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      e => {
        if (this._panel.visible) 
          this._getHtmlForWebview(this._panel.webview);
      },
      null,
      this._disposables
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.type) {
          case 'alert':
            // console.log(`onDidReceiveMessage: ${message.type} ${message.value}`); 
            return;
        }
      },
      null,
      this._disposables
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  public sendDataToWebview() {
    // console.log(`sendDataToWebview`);
    // Send a message to the webview 
    // You can send any JSON serializable data.
    this._panel.webview.postMessage({ type: 'refactor', value: 'Do it now!' });
  }

  public dispose() {
    // console.log(`dispose`);
    SankeyPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // console.log(`_getHtmlForWebview`);

    // Local path to main script run in the webview
    const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

    // And the uri we use to load this script in the webview
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    // Uri to load styles into webview, as webviews cannot load 'file:' resources
    const cssMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
    const mainJSUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

    // wget -O d3.js -q https://cdn.jsdelivr.net/npm/d3@7
    const d3Uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'd3.js'));
    
    // wget -O d3-sankey.js -q https://cdn.jsdelivr.net/npm/d3-sankey@0.12
    const d3SankeyUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'd3-sankey.js'));

    // Use a nonce to only allow specific scripts to be run
    const nonce = _getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <!--
          Use a content security policy to only allow loading images from https or from our extension directory,
          and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} 
          https:; script-src 'nonce-${nonce}'; frame-src 'self';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${cssMainUri}" rel="stylesheet">
        <script nonce="${nonce}"> const tsvscode = acquireVsCodeApi(); </script>
        <title>Sankey Flow Diagram</title>
      </head>
      <body>
        <table>
         <tr>
          <td width="10%"><fieldset>
            <legend>Alignment:</legend>
            <div>
              <input type="radio" id="align-left" name="align-list" value="Left" checked />
              <label for="align-left">Left</label>
            </div>
            <div>
              <input type="radio" id="align-right" name="align-list" value="Right" />
              <label for="align-right">Right</label>
            </div>
            <div>
              <input type="radio" id="align-center" name="align-list" value="Center" />
              <label for="align-center">Center</label>
            </div>
            <div>
              <input type="radio" id="align-justify" name="align-list" value="Justify" />
              <label for="align-justify">Justify</label>
            </div>
          </fieldset></td>
          <td width="15%"><label>
            Vertical Zoom:
            <input id="height-selector" name="height-selector" type="number" min="100" value="600" step="50" max="10000" />
          </label></td>
          <td width="15%"><label>
            Node Width:
            <input id="node-width" name="node-width" type="number" min="1" value="15" max="30" step="1" />
          </label></td>
          <td width="15%"><label>
            Node Padding:
            <input id="node-padding" name="node-padding" type="number" min="1" value="10" max="30" step="1" />
          </label></td>
          <td width="15%"><label>
            Default color:
            <input id="default-color" name="default-color" type="color" value="#DDDDDD" />
          </label></td>
         </tr>
        </table>
        <script nonce="${nonce}" src="${scriptUri}"></script>
        <script nonce="${nonce}" src="${d3Uri}"></script>
        <script nonce="${nonce}" src="${d3SankeyUri}"></script>
        <script nonce="${nonce}" src="${mainJSUri}"></script>
        </body>
      </html>`;
    }
}



/** Generate a random nonce for extension webview */
function _getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
