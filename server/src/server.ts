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
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { getLineFromByteOffset, getByteOffsetForObj, extractXrefTable, findAllReferences } from './pdfUtils';

// for server debug.
import { debug } from 'console';

if (process.env.NODE_ENV === 'development') {
	debug(`Using development version of the language server`);
	require('source-map-support').install();
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

/**
 * Perform basic validation of a PDF:
 * 1. check 1st line for valid "%PDF-x.y" header, including known PDF version
 * 2. check 2nd line for binary file marker line with 4 bytes > 127
 * 3. check last line for "%%EOF"
 * 4. check conventional PDF file: xref, trailer and startxref keywords need to exist
 */
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	let m: RegExpExecArray | null;
	let errorMsg;

	// 1st line of PDF should be a valid PDF header "%PDF-x.y"
	const firstLine = textDocument.getText({
		start: Position.create(0,0),
		end: Position.create(0, "%PDF-x.y".length),
	});
	if (!firstLine.startsWith("%PDF-")) {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: {
				start: Position.create(0,0),
				end: Position.create(0,5)
			},
			message: 'First line of PDF does not start with required file marker "%PDF-"',
			source: 'vscode-pdf',
		};
		diagnostics.push(diagnostic);
		problems++;
	}

	const pdfVers = firstLine.slice(5,8);
	if ((pdfVers !== "1.0") && (pdfVers !== "1.1") && (pdfVers !== "1.2") && (pdfVers !== "1.3") &&
		(pdfVers !== "1.4") && (pdfVers !== "1.5") && (pdfVers !== "1.6") && (pdfVers !== "1.7") &&
		(pdfVers !== "2.0")) {
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Error,
				range: {
					start: Position.create(0,5),
					end: Position.create(0,8)
				},
				message: 'PDF header version is not valid',
				source: 'vscode-pdf',
			};
			diagnostics.push(diagnostic);
			problems++;
		}

	// 2nd line of PDF should be comment followed by at least 4 bytes > 127
	const secondLine = textDocument.getText({
		start: Position.create(1,0),
		end: Position.create(1, 8),
	});
	if ((secondLine.charAt(0) !== '%') || (secondLine.charCodeAt(1) <= 127) || (secondLine.charCodeAt(2) <= 127) ||
		(secondLine.charCodeAt(3) <= 127) || (secondLine.charCodeAt(4) <= 127)) {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: Position.create(1,0),
				end: Position.create(1,5)
			},
			message: '2nd line in PDF should be the binary file marker comment (%) followed by at least 4 bytes > 127',
			source: 'vscode-pdf',
		};
		diagnostics.push(diagnostic);
		problems++;
	}

	// Last non-blank line of PDF should be "%%EOF" marker
	const text = textDocument.getText();
	let i = textDocument.lineCount;
	let lastLine = textDocument.getText({
		start: Position.create(i, 0),
		end: Position.create(i, 6)
	}).trim();
	while (lastLine.length === 0) {
		i--;
		lastLine = textDocument.getText({
			start: Position.create(i, 0),
			end: Position.create(i, 6)
		}).trim();
	}
	if (!lastLine.startsWith("%%EOF")) {
		const position = textDocument.positionAt(i);
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: { // Last non-blank line in file
				start: position,
				end: position
			},
			message: 'PDF files must end with a line "%%EOF"',
			source: 'vscode-pdf',
		};
		diagnostics.push(diagnostic);
		problems++;
	}


	// Check for "xref", "trailer" and "startxref" keywords needed in conventional PDFs
	// Note that because "xref" is a subset of "startxref" so need to use regex and not indexOf!
	const trailerRegex = new RegExp('\\btrailer\\b', 'g');
	const startxrefRegex =  new RegExp('\\bstartxref\\b', 'g');
	const xrefRegex =  new RegExp('\\bxref\\b', 'g');

	if ((m = trailerRegex.exec(text)) == null) {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: { // %PDF-x.y
				start: Position.create(0,0),
				end: Position.create(0,8)
			},
			message: 'PDF does not contain the "trailer" keyword required for a conventional PDF',
			source: 'vscode-pdf',
		};
		diagnostics.push(diagnostic);
		problems++;
	}

	if ((m = startxrefRegex.exec(text)) == null) {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: { // %PDF-x.y
				start: Position.create(0,0),
				end: Position.create(0,8)
			},
			message: 'PDF does not contain the "startxref" keyword required for a conventional PDF',
			source: 'vscode-pdf',
		};
		diagnostics.push(diagnostic);
		problems++;
	}

	if ((m = xrefRegex.exec(text)) == null) {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: { // %PDF-x.y
				start: Position.create(0,0),
				end: Position.create(0,8)
			},
			message: 'PDF does not contain the "xref" keyword required for a conventional PDF',
			source: 'vscode-pdf',
		};
		diagnostics.push(diagnostic);
		problems++;
	}

	/* 
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;

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
 */
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

connection.onDefinition((params): Definition | null => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return null;
	}

	// Get text either side of the cursor. Because finding object definitions is limited to "X Y R" 
	// and the 20-byte in-use cross reference table entries, can select bytes either side of 
	// character position on line (to try and avoid long lines with multiple "X Y R" for example)
	const position = params.position;
	const lineText = document.getText({
		start: Position.create(position.line, Math.max(position.character - 20, 0)),
		end: Position.create(position.line, position.character + 20),
	});

	// Get 1st conventional xref table (if one exists)
	const xrefTable = extractXrefTable(document);

	let byteOffset = -1;
	// find the object definition for an "X Y R" indirect reference
	const indirectObjMatch = lineText.match(/(\d+) (\d+) R/);
	if (indirectObjMatch && xrefTable) {
		const objNum = parseInt(indirectObjMatch[1]);
		const genNum = parseInt(indirectObjMatch[2]);
		byteOffset = getByteOffsetForObj(objNum, genNum, xrefTable);
		if (byteOffset === -1) {
			// No object matches indirect reference for <objNum, genNum>
			return null;
		}
	}

	// find the object definition for a conventional xref table in-use ("n") entry
	const xrefMatch = lineText.match(/\b(\d{10}) (\d{5}) n\b/);
	if (xrefMatch) {
		byteOffset = parseInt(xrefMatch[1]);
		if (byteOffset === -1) {
			// For some reason the byte offset "\d{10}" didn't parseInt!
			return null;
		}
	}

	// Nothing relevant was selected for finding a definition
	if (byteOffset === -1) {
		return null;
	}

	const line = getLineFromByteOffset(document, byteOffset);
	if (line === -1) {
		return null;
	}

	return {
		uri: params.textDocument.uri,
		range: {
			start: { line, character: 0 },
			end: { line, character: 0 },
		},
	};
});

connection.onReferences((params): Location[] | null => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return null;
	}

	// Get text either side of the cursor. Because finding all references is limited to "X Y R" 
	// or "X Y obj",  select very few bytes prior to current char position on the line (to try and
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
