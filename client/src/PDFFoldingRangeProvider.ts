import { FoldingRangeProvider, TextDocument, FoldingRange, ProviderResult } from 'vscode';

export class PDFFoldingRangeProvider implements FoldingRangeProvider {
	provideFoldingRanges(document: TextDocument): ProviderResult<FoldingRange[]> {
		const ranges: FoldingRange[] = [];

		let startObjLine: number = -1;
		let startBracketLine: number = -1;
		let startStreamLine: number = -1;

		for (let i = 0; i < document.lineCount; i++) {
			let line = document.lineAt(i).text.trim();

			if (line.startsWith('obj')) {
				startObjLine = i;
			} else if (line.startsWith('endobj') && startObjLine >= 0) {
				let r = new FoldingRange(startObjLine, i);
				ranges.push(r);
				startObjLine = -1;
			}

			if (line.startsWith('<<')) {
				startBracketLine = i;
			} else if (line.startsWith('>>') && startBracketLine >= 0) {
				let r = new FoldingRange(startBracketLine, i);
				ranges.push(r);
				startBracketLine = -1;
			}

			if (line.startsWith('stream')) {
				startStreamLine = i;
			} else if ((line.startsWith('endstream') || i === document.lineCount - 1) && startStreamLine >= 0) {
				let r = new FoldingRange(startStreamLine, i);
				ranges.push(r);
				startStreamLine = -1;
			}
		}
		return ranges;
	}
}
