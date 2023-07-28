// pdfUtils.ts
import { TextDocument } from 'vscode-languageserver-textdocument';

export function getByteOffsetForObj(objNum: number, xrefTable: string): number {
	// Split the xref table into lines
	let lines = xrefTable.split('\n');

	// Iterate over each line in the xref table
	for (let line of lines) {
		// Split the line into parts
		let parts = line.split(' ');

		// If the first part matches the object number, return the byte offset (second part)
		if (parts[0] == objNum.toString()) {
			return parseInt(parts[1]);
		}
	}

	// If the object number wasn't found in the xref table, return -1
	return -1;
}

export function getLineFromByteOffset(document: TextDocument, byteOffset: number): number {
	// Get the document text
	let text = document.getText();

	// Use a Buffer to count bytes
	let buffer = Buffer.from(text, 'utf8');

	// Initialize the byte count and line count
	let count = 0;
	let lineCount = 0;

	// Iterate over each byte in the buffer
	for (let byte of buffer) {
		// If the byte is a newline character, increment the line count
		if (byte === '\n'.charCodeAt(0)) {
			lineCount++;
		}

		// If the count is equal to the byte offset, return the line count
		if (count === byteOffset) {
			return lineCount;
		}

		// Increment the byte count
		count++;
	}

	// If the byte offset wasn't found in the document, return -1
	return -1;
}

export function extractXrefTable(document: TextDocument): string {
	const documentText = document.getText();
	const xrefStart = documentText.indexOf('xref');
	const xrefEnd = documentText.indexOf('trailer');
	return documentText.slice(xrefStart, xrefEnd);
}
