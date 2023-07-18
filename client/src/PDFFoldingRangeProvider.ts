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
		const bracketStartLines: number[] = [];

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
				bracketStartLines.push(i);
			} else if (line.text.includes('>>') && bracketStartLines.length > 0) {
				let startBracketLine = bracketStartLines.pop();
				let r = new FoldingRange(startBracketLine, i);
				ranges.push(r);
			}
		}
		return ranges;
	}
}
