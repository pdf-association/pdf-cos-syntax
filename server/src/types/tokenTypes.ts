export interface Token {
  start: number;
  end: number;
  type: string;
  [key: string]: any;
}