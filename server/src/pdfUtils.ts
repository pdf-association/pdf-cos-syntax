import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver';

/**
 * Process a conventional cross-reference table looking for an in-use entry for object ID.
 * @param objNum  object number
 * @param genNum  object generation number
 * @param xrefTable  a full conventional cross reference table without the "xref" keyword
 * @returns a byte offset for the object or -1 if no such in-use object.
 */
export function getByteOffsetForObj(objNum: number,  genNum: number, xrefTable: string): number {
	const lines = xrefTable.split('\n');
	let startObjNum = 0;
	let totalEntries = 0;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(' f') || lines[i].includes(' n')) {
			// 20-byte entry: in-use (n) or free (f) 
			const parts = lines[i].split(' ');
			if ((i == objNum + startObjNum - 1) && (parts.length >= 3)) {
				// Found the object
				if ((parts[2].includes('n')) && (parseInt(parts[1]) === genNum)) {
					return parseInt(lines[i].split(' ')[0]);
				}
				else {
					return -1; // was a free object
				}
			}
		} else {
			// cross reference table sub-section line with 2 integers
			const parts = lines[i].split(' ');
			if (parts.length < 2) {
				return -1;
			}
			startObjNum = parseInt(parts[0]);
			totalEntries = parseInt(parts[1]);
		}
	}

	return -1;
}


/**
 * Given a PDF byte offset, work out equivalent VSCode line number.
 * @param document  the PDF (as text) document
 * @param byteOffset  the PDF file byte offset. Always >0.
 * @returns VSCode line number or -1 on error
 */
export function getLineFromByteOffset(document: TextDocument, byteOffset: number): number {
	const text = document.getText();
	const buffer = Buffer.from(text, 'utf8');
	let count = 0;
	let lineCount = 0;

	for (const byte of buffer) {
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

/**
 * Extracts the 1st conventional cross reference table from a PDF.
 * @param document  the PDF (as text) document
 * @returns the conventional cross reference table or null if one doesn't exist
 */
export function extractXrefTable(document: TextDocument): string | null {
	const documentText = document.getText();
	const xrefStart = documentText.indexOf('xref');
	const xrefEnd = documentText.indexOf('trailer');

	// Handle PDFs with cross-reference streams
	if ((xrefStart === -1) || (xrefEnd === -1)) {
		return null;
	}
	let xrefTable = documentText.slice(xrefStart, xrefEnd);

	// Remove the first line (the "xref" line)
	let xrefLines = xrefTable.split('\n');
	xrefLines = xrefLines.slice(1);
	xrefTable = xrefLines.join('\n');

	return xrefTable;
}

/**
 * Find all occurrences of "X Y R" in the text for a given object ID.
 * @param objNum  object number
 * @param genNum  object generation number
 * @param document  the PDF (as text) document
 * @returns an array of locations
 */
export function findAllReferences(objNum: number, genNum: number, document: TextDocument): Location[] {
	const references: Location[] = [];

	const referencePattern = new RegExp(`\\b${objNum} ${genNum} R\\b`, 'g');

	const text = document.getText();
	let match;

	// Find all occurrences of "X Y R" in the text
	while ((match = referencePattern.exec(text)) !== null) {
		const position = document.positionAt(match.index);
		references.push({
			uri: document.uri,
			range: {
				start: position,
				end: Position.create(position.line, position.character + match[0].length),
			},
		});
	}
	return references;
}
