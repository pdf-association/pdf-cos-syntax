import { XrefInfoMatrix } from '../parser/XrefInfoMatrix';

export interface PDSCOSSyntaxSettings {
  maxNumberOfProblems: number;
}

export type PDFDocumentData = {
  settings: PDSCOSSyntaxSettings;
  xrefMatrix?: XrefInfoMatrix;
};