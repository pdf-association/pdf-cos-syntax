/**
 * @brief VSCode "pdf-cos-syntax" extension client-side folding support
 *
 * @copyright
 * Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * @remark
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
import { FoldingRangeProvider, TextDocument, FoldingRange, ProviderResult } from 'vscode';

export class PDFFoldingRangeProvider implements FoldingRangeProvider {
	provideFoldingRanges(document: TextDocument): ProviderResult<FoldingRange[]> {
		const ranges: FoldingRange[] = [];

		let startObjLine = -1;
		let startStreamLine = -1;
		let startxrefLine = -1;
		let startDictLines = [];
		let startQLines = [];
		let startBTLines = [];
		let startBXLines = [];
		let startMarkedContentLines = [];

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i).text.trim();

			/** 
			 * @todo Remove any comments to leave just content. Handle strings
			 *  Especially important if a comment or string contains any of the markers!
			 */

			// cannot be nested 
			if (line.match('\\d+ \\d+ obj')) {
				startObjLine = i;
				startDictLines = []; // reset dictionaries
				continue;
			} else if (line.startsWith('endobj') && startObjLine >= 0) {
				const r = new FoldingRange(startObjLine, i);
				ranges.push(r);
				startObjLine = -1;
				continue;
			}

			// cannot be nested 
			if (line.startsWith('xref')) {
				startxrefLine = i;
				startDictLines = []; // reset dictionaries
				continue;
			} else if (line.startsWith('trailer') && startxrefLine >= 0) {
				const r = new FoldingRange(startxrefLine, i);
				ranges.push(r);
				startxrefLine = -1;
				continue;
			}

			// cannot be nested 
			if (line.startsWith('stream')) {
				startStreamLine = i;
				startDictLines = []; // reset dictionaries
				startQLines = []; // reset q/Q operand pairs
				startBTLines = []; // reset BT/ET operand pairs
				startBXLines = []; // reset BX/EX operand pairs
				startMarkedContentLines = []; // reset BDC/BMC/EMC operand pairs
				continue;
			} else if (line.startsWith('endstream') && (startStreamLine >= 0)) {
				const r = new FoldingRange(startStreamLine, i);
				ranges.push(r);
				startStreamLine = -1;
				startDictLines = []; // reset dictionaries
				startQLines = []; // reset q/Q operand pairs
				startBTLines = []; // reset BT/ET operand pairs
				startBXLines = []; // reset BX/EX operand pairs
				startMarkedContentLines = []; // reset BDC/BMC/EMC operand pairs
				continue;
			}

			// Nestable. Avoid when an entire dict (both "<<" and ">>") are on 1 line
			if (line.startsWith('<<') && !line.includes('>>')) {
				startDictLines.push(i);
				continue;
			}
			else if (line.startsWith('/') && line.includes('<<')  && !line.includes('>>')) {
				startDictLines.push(i);
				continue;
			} else if (line.startsWith('>>') && (startDictLines.length > 0)) {
				const r = new FoldingRange(startDictLines.pop(), i);
				ranges.push(r);
				continue;
			}

			// No operands or other operators. Nestable.
			if (line.startsWith('q')) {
				startQLines.push(i);
				continue;
			} else if (line.startsWith('Q') && (startQLines.length > 0)) {
				const r = new FoldingRange(startQLines.pop(), i);
				ranges.push(r);
				continue;
			}

			// No operands or other operators. Nestable.
			if (line.startsWith('BT')) {
				startBTLines.push(i);
				continue;
			} else if (line.startsWith('ET') && startBTLines.length > 0) {
				const r = new FoldingRange(startBTLines.pop(), i);
				ranges.push(r);
				continue;
			}

			// No operands or other operators. Nestable.
			if (line.startsWith('BX')) {
				startBXLines.push(i);
				continue;
			} else if (line.startsWith('EX') && startBXLines.length > 0) {
				const r = new FoldingRange(startBXLines.pop(), i);
				ranges.push(r);
				continue;
			}

			// Nestable. Supports operands on same line as operator: 
			//   tag properties BDC
			//   tag BMC
			if ((line.includes('BDC')) || (line.includes('BMC'))) {
				startMarkedContentLines.push(i);
				continue;
			} else if (line.startsWith('EMC') && (startMarkedContentLines.length > 0)) {
				const r = new FoldingRange(startMarkedContentLines.pop(), i);
				ranges.push(r);
				continue;
			}
		}
		return ranges;
	}
}
