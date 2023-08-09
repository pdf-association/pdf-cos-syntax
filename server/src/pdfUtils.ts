import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver';

export function getByteOffsetForObj(objNum: number, xrefTable: string): number {
	let lines = xrefTable.split('\n');
	let startObjNum = 0;
	let totalEntries = 0;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes('f') || lines[i].includes('n')) {
			if (i == objNum + startObjNum - 1) {
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



export function findAllReferences(objectId: number, document: TextDocument): Location[] {
  const references: Location[] = [];
  const text = document.getText();
	const objectPattern = new RegExp(`\\b${objectId} 0 obj\\b`, 'g');
  const referencePattern = /\b(\d+) (\d+) R\b/g;

  let objectMatch;
  while ((objectMatch = objectPattern.exec(text)) !== null) {
    const startPosition = document.positionAt(objectMatch.index);
    const endPosition = document.positionAt(objectMatch.index + objectMatch[0].length);

    const objectText = text.slice(objectMatch.index, text.indexOf('endobj', objectMatch.index));

    let referenceMatch;

    while ((referenceMatch = referencePattern.exec(objectText)) !== null) {
      const position = document.positionAt(referenceMatch.index + objectMatch.index);
      references.push({
        uri: document.uri,
        range: {
          start: position,
          end: Position.create(position.line, position.character + referenceMatch[0].length),
        },
      });
    }
  }

  return references;
}
