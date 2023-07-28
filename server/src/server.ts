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
	Location,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { getLineFromByteOffset, getByteOffsetForObj, extractXrefTable } from './pdfUtils';
// for server debug.
import * as path from 'path';
import { debug } from 'console';

if (process.env.NODE_ENV === 'development') {
  debug(`Using development version of the language server`);
  require('source-map-support').install();
}

console.log("server debuggggging")
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

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
			definitionProvider: true
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

type PdfObjectDefinition = {
	content: string;
	position: Position;
}
let objectDefinitions: {[key: string]: PdfObjectDefinition}  = {}
documents.onDidOpen((e) => {
    let content = e.document.getText();
    let objects = content.split('endobj');
    
	objects.forEach((object) => {
        object = object.trim();
        let lines = object.split('\n');
        if (lines.length > 0) {
            let firstLine = lines[0].trim();
            if (firstLine.endsWith('obj')) {
                let objectId = firstLine.replace('obj', '').trim();
                // Here we're using the indexOf function to get the start position of the object in the content.
                // We're calculating line and character positions by counting the number of newline characters and characters on the final line.
                let start = content.indexOf(object);
                let line = content.substring(0, start).split('\n').length;
                let character = lines[0].length;
                objectDefinitions[objectId] = {
                    content: object,
                    position: Position.create(line, character),
                };
            }
        }
    });
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders((_event) => {
			connection.console.log('Workspace folder change event received.');
		});
	}	
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
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
			section: 'languageServerExample',
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length),
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex',
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range),
					},
					message: 'Spelling matters',
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range),
					},
					message: 'Particularly for names',
				},
			];
		}
		diagnostics.push(diagnostic);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1,
			},
			{
				label: 'JavaScript',
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
		item.detail = 'TypeScript details';
		item.documentation = 'TypeScript documentation';
	} else if (item.data === 2) {
		item.detail = 'JavaScript details';
		item.documentation = 'JavaScript documentation';
	}
	return item;
});

// connection.onDefinition((params): Definition | null => {
	// console.log("ondefitionoinonioon,,,,,,,,")
	// const document = documents.get(params.textDocument.uri);
	// if (!document) {
	// 	return null;
	// }
	// const position = params.position;
	// const word = document.getText({
	// 	start: Position.create(position.line, 0),
	// 	end: Position.create(position.line, 255),
	// });

	// const match = word.match(/(\d+) 0 obj/);
	// if (!match) {
	// 	return null;
	// }
	// const objNum = parseInt(match[1]);

	// const xrefTable = extractXrefTable(document);
	// const byteOffset = getByteOffsetForObj(objNum, xrefTable);
	// if (byteOffset === -1) {
	// 	return null;
	// }

	// const line = getLineFromByteOffset(document, byteOffset);
	// if (line === -1) {
	// 	return null;
	// }

	// return {
	// 	uri: params.textDocument.uri,
	// 	range: {
	// 		start: { line, character: 0 },
	// 		end: { line, character: 0 },
	// 	},
	// };

	// let position = params.position; // the position where the user invoked "Go to Definition"
    // let textDocument = documents.get(params.textDocument.uri); // the document where the user invoked "Go to Definition"
    
    // // Code to get the object identifier at the position...
    // let objectId = getObjectIdAtPosition(textDocument, position);

    // // Look up the definition in the map
    // let definition = objectDefinitions[objectId];
    
    // // Code to create a Location object from the definition...
    // let location = createLocationFromDefinition(definition);

    // // Return the location of the definition
    // return location;
// });
console.log(objectDefinitions)
connection.onDefinition((params: TextDocumentPositionParams): Location | undefined => {
	console.log("we are onDefinition")
    let document = documents.get(params.textDocument.uri);
    if (!document) {
        return;
    }
    let position = params.position;
	let line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_VALUE }
    });
	let wordMatch = line.slice(0, position.character + 1).match(/\w+$/);

    // let wordRange = document?.getWordRangeAtPosition(position);
    // if (!wordRange) {
    //     return;
    // }

	if (!wordMatch) {
        return;
    }

    let word = wordMatch[0];

    if (objectDefinitions.hasOwnProperty(word)) {
        let definition = objectDefinitions[word];
        return Location.create(document.uri, {
            start: definition.position,
            end: Position.create(definition.position.line, definition.position.character + definition.content.length),
        });
    }

    // let word = document.getText(wordRange);

    // if (objectDefinitions.hasOwnProperty(word)) {
    //     let definition = objectDefinitions[word];
    //     return Location.create(document.uri, {
    //         start: definition.position,
    //         end: Position.create(definition.position.line, definition.position.character + definition.content.length),
    //     });
    // }
});


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
