import { Range } from 'vscode-languageserver-textdocument';
import PDFParser from './PdfParser';

export default class PDFObject {
  id: string;
  range: Range;

  constructor(id: string, range: Range) {
    this.id = id;
    this.range = range;
  }

  getRange(): Range {
    return this.range;
  }

  getSelectionRange(): Range {
    return {
      start: this.range.start,
      end: { line: this.range.start.line, character: this.id.length },
    };
  }

  getStreamRange(parser: PDFParser): Range | null {
    return parser.getStreamRangeForObject(this);
  }
}