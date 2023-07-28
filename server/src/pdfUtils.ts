import { TextDocument } from 'vscode-languageserver-textdocument';

export function getByteOffsetForObj(objNum: number, xrefTable: string): number {
	let lines = xrefTable.split('\n');
	let startObjNum = 0;
	let totalEntries = 0;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes('f') || lines[i].includes('n')) {
			if (i == objNum - startObjNum + 1) {
				return parseInt(lines[i].split(' ')[0]);
			}
		} else {
			let parts = lines[i].split(' ');
			startObjNum = parseInt(parts[0]);
			totalEntries = parseInt(parts[1]);
		}
	}

	return -1;
}

export function getLineFromByteOffset(document: TextDocument, byteOffset: number): number {
	let text = document.getText();
	let buffer = Buffer.from(text, 'utf8');
	let count = 0;
	let lineCount = 0;

	for (let byte of buffer) {
		if (byte === '\n'.charCodeAt(0)) {
			lineCount++;
		}

		if (count === byteOffset) {
			return lineCount;
		}

		count++;
	}

	return -1;
}

export function extractXrefTable(document: TextDocument): string {
	const documentText = document.getText();
	const xrefStart = documentText.indexOf('xref');
	const xrefEnd = documentText.indexOf('trailer');
	let xrefTable = documentText.slice(xrefStart, xrefEnd);

	// Remove the first line (the "xref" line)
	let xrefLines = xrefTable.split('\n');
	xrefLines = xrefLines.slice(1);
	xrefTable = xrefLines.join('\n');

	return xrefTable;
}
