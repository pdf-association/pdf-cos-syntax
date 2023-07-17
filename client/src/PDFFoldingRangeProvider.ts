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
		const ranges: FoldingRange[] = []

		const startPattern = /^\d+ \d+ obj/g
		const endPattern = /^endobj/g

		let startObjLine = -1
		let startBracketLine = -1

		// for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
		// 	const lineText = document.lineAt(lineNum).text;

		// 	if (startPattern.test(lineText)) {
		// 		startLine = lineNum
		// 	} else if (endPattern.test(lineText) && startLine !== -1) {
		// 		ranges.push(new FoldingRange(startLine, lineNum))
		// 		startLine = -1
		// 	}
		// }

		for (let i = 0; i < document.lineCount; i++) {
			let line = document.lineAt(i)

			if (line.text.includes(' obj')) {
				startObjLine = i
			} else if (line.text.includes('endobj')) {
				if (startObjLine >= 0) {
					let r = new FoldingRange(startObjLine, i)
					ranges.push(r)
					startObjLine = -1
				}
			}

			if (line.text.includes('<<')) {
				startBracketLine = i
			} else if (line.text.includes('>>')) {
				if (startBracketLine >= 0) {
					let r = new FoldingRange(startBracketLine, i)
					ranges.push(r)
					startBracketLine = -1
				}
			}
		}
		return ranges
	}
}
