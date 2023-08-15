import { FoldingRangeProvider, TextDocument, FoldingRange, ProviderResult } from 'vscode';

export class PDFFoldingRangeProvider implements FoldingRangeProvider {
	provideFoldingRanges(document: TextDocument): ProviderResult<FoldingRange[]> {
		const ranges: FoldingRange[] = [];

		let startObjLine = -1;
		let startBracketLine = -1;
		let startStreamLine = -1;
		let startPdfNameLine = -1;
		let startQLine = -1;
		let startBTLine = -1;
		let startBXLine = -1;
		let startBDCLine = -1;
		let startBMCLine = -1;

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text.trim();

			if (line.startsWith('obj')) {
				startObjLine = i;
			} else if (line.startsWith('endobj') && startObjLine >= 0) {
				const r = new FoldingRange(startObjLine, i);
				ranges.push(r);
				startObjLine = -1;
			}

			if (line.startsWith('<<')) {
				startBracketLine = i;
			} else if (line.startsWith('>>') && startBracketLine >= 0) {
				const r = new FoldingRange(startBracketLine, i);
				ranges.push(r);
				startBracketLine = -1;
			}

			if (line.startsWith('stream')) {
				startStreamLine = i;
			} else if (
				(line.startsWith('endstream') || i === document.lineCount - 1) &&
				startStreamLine >= 0
			) {
				const r = new FoldingRange(startStreamLine, i);
				ranges.push(r);
				startStreamLine = -1;
			}

			if (line.startsWith('/') && line.includes('<<')) {
				startPdfNameLine = i;
			} else if (line.startsWith('>>') && startPdfNameLine >= 0) {
				const r = new FoldingRange(startPdfNameLine, i);
				ranges.push(r);
				startPdfNameLine = -1;
			}

			if (line.startsWith('q')) {
				startQLine = i;
			} else if (line.startsWith('Q') && startQLine >= 0) {
				const r = new FoldingRange(startQLine, i);
				ranges.push(r);
				startQLine = -1;
			}

			if (line.startsWith('BT')) {
				startBTLine = i;
			} else if (line.startsWith('ET') && startBTLine >= 0) {
				const r = new FoldingRange(startBTLine, i);
				ranges.push(r);
				startBTLine = -1;
			}

			if (line.startsWith('BX')) {
				startBXLine = i;
			} else if (line.startsWith('EX') && startBXLine >= 0) {
				const r = new FoldingRange(startBXLine, i);
				ranges.push(r);
				startBXLine = -1;
			}

			if (line.startsWith('BDC')) {
				startBDCLine = i;
			} else if (line.startsWith('BMC')) {
				startBMCLine = i;
			} else if (line.startsWith('EMC')) {
				if (startBDCLine >= 0) {
					const r = new FoldingRange(startBDCLine, i);
					ranges.push(r);
					startBDCLine = -1;
				} else if (startBMCLine >= 0) {
					const r = new FoldingRange(startBMCLine, i);
					ranges.push(r);
					startBMCLine = -1;
				}
			}
		}
		return ranges;
	}
}
