import {
	FoldingRangeProvider,
	TextDocument,
	FoldingRange,
	CancellationToken,
	ProviderResult,
	FoldingContext,
} from 'vscode';

export class PDFFoldingRangeProvider implements FoldingRangeProvider {
	provideFoldingRanges(
		document: TextDocument,
		context: FoldingContext,
		token: CancellationToken
	): ProviderResult<FoldingRange[]> {
		const ranges: FoldingRange[] = [];

		let startObjLine: number = -1;
		let startBracketLine: number = -1;

		for (let i = 0; i < document.lineCount; i++) {
			let line = document.lineAt(i);

			if (line.text.includes(' obj')) {
				startObjLine = i;
			} else if (line.text.includes('endobj') && startObjLine >= 0) {
				let r = new FoldingRange(startObjLine, i);
				ranges.push(r);
				startObjLine = -1;
			}

			if (line.text.includes('<<')) {
				startBracketLine = i;
			} else if (line.text.includes('>>') && startBracketLine >= 0) {
				let r = new FoldingRange(startBracketLine, i);
				ranges.push(r);
				startBracketLine = -1;
			}
		}
		return ranges;
	}
}
