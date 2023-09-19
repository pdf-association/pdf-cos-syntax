/**
 * @brief VSCode PDF COS syntax client-side command functionality
 *
 * @copyright
 * Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 * 
 * @author Peter Wyatt, PDF Association
 *
 * @remark
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
'use strict';

import * as vscode from "vscode";
import * as fs from 'fs';
import * as util from 'util';
import * as sharp from 'sharp';
import Ascii85 = require('ascii85');


/**
 * Convert current EOL setting to count bytes so lengths can be adjusted accordingly.
 * 
 * @param eol - current editor EOL setting ("auto" is normalized to something) 
 * @returns 1 or 2 bytes per EOL.
 */
function _EOLtoBytes(eol: vscode.EndOfLine) {
  switch (eol) {
		case vscode.EndOfLine.CRLF: return 2;
		case vscode.EndOfLine.LF: return 1;
    default: return 1; // should never happen! Code rot?? 
  }
}


/**
 * Converts a buffer of bytes to PDF `/ASCII85Decode` encoding.
 */
export function convertToAscii85Filter(bytes: Buffer): string[] {
  const a85encoded = Ascii85.encode(bytes, { delimiter: false });
  const res = _stringToChunks(a85encoded + '~>', 70);
  // console.log(`_convertToAscii85filter: ${res}`); 
  return res;
}


/**
 * Converts a buffer of `/ASCII85Decode` encoded data back
 * to raw bytes as a UTF-8 string. Requires data end with "~>".
 */
export function convertFromAscii85Filter(a85: string): string {
  try {
    if (a85.slice(a85.length - 2, a85.length - 1) !== '~>') {
      console.error(`Error: ASCII-85 data did not with '~>' end of data marker!`);
      vscode.window.showErrorMessage(`Error: ASCII-85 data did not with '~>' end of data marker!`);
      return '';
    }

    const s: string = Ascii85.decode(a85);
    // console.log(`_convertFromAscii85filter: ${s}`); 
    return s;
  }
  catch (error) {
    console.error(`_convertFromAscii85filter: Error ${error}`); 
    vscode.window.showErrorMessage(`ASCII-85 decompression error: ${error}!`);
    return '';
  }
}


/**
 * Splits a string into "chunks" of a fixed length.
 * 
 * @param string - string to wrap
 * @param chunkSize - width of a "chunk" of the string
 * @returns an array of strings with the 1st N-1 lines chunkSize
 */
function _stringToChunks(string: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  while (string.length > 0) {
    chunks.push(string.substring(0, chunkSize));
    string = string.substring(chunkSize, string.length);
  }
  // console.log(`_stringToChunks: ${chunks}`); 
  return chunks;
}


/**
 * Converts a buffer of bytes to `/ASCIIHexDecode` encoding.
 * Wraps at 32 characters (i.e. every 16 bytes of input data). 
 */
export function convertToAsciiHexFilter(data: Buffer): string[] {
  let s: string = "";
  let i: number;
  for (i = 0; i < data.length; i++) {
    const b = data[i];
    s = s + b.toString(16);
  }
  s = s + ">";
  const res = _stringToChunks(s, 32);
  // console.log(`_convertToAsciiHexfilter: ${res}`); 
  return res;
}


/**
 * Converts `/ASCIIHexDecode` encoded data to raw bytes as a UTF-8 string.
 * Fails on any non-hex code or whitespace characters. Requires data end with '>'
 */
export function convertFromAsciiHexFilter(aHex: string): string {
  try {
    if (aHex[aHex.length - 1] !== '>') {
      console.error(`Error: ASCII-Hex data did not end with '>' end of data marker!`);
      vscode.window.showErrorMessage(`Error: ASCII-Hex data did not end with '>' end of data marker!`);
      return '';
    }
    aHex = aHex.slice(0, aHex.length - 1);  // remove EOD '>'
    let i: number = 0;
    let res: string = '';
    while (i < aHex.length) {
      if ('0123456789abcdefABCDEF'.indexOf(aHex[i]) !== -1) {
        if (i + 1 < aHex.length) {
          const h: number = parseInt(aHex.slice(i, i + 2), 16);
          res = res + String.fromCharCode(h);
          i++;
        }
        else { // single hex digit at end of string
          const h: number = parseInt(aHex.slice(i, i + 1), 16);
          res = res + String.fromCharCode(h);
        }
      }
      else if (' \t\r\n\f\0'.indexOf(aHex[i]) === -1) {
        // Bad data!
        console.error(`Error: ASCII-Hex data had unexpected character '${aHex[i]}'!`);
        vscode.window.showErrorMessage(`Error: ASCII-Hex data had unexpected character '${aHex[i]}'!`);
        return '';
      }
      i++;
    }
    // console.log(`convertFromAsciiHexFilter: ${res}`); 
    return res;
  }
  catch (error) {
    console.error(`convertFromAsciiHexFilter: Error ${error}`); 
    vscode.window.showErrorMessage(`Error: ASCII-Hex ${error}!`);
    return '';
  }
}


/**
 * @todo move to hover
 * Normalizes a PDF name but replace the 2-digit `#` hex codes with the
 * ASCII character.
 * @param name - the PDF name
 * @returns equivalent PDF name, but without any 2-digit `#` hex codes
 */
export function normalizedPDFname(name: string): string {
  if (name.indexOf('#') == -1) return name;

  const m = name.match(/(#[0-9a-fA-F][0-9a-fA-F])/g);
  let newName: string = name;
  for(let i: number = 0; i < m.length; i++) {
    const hexDigits: string = m[i].slice(1, 3); // get the 2 hex digits
    const hexCode: number = parseInt(hexDigits, 16);
    newName = newName.replace(m[i], String.fromCharCode(hexCode));
  }
  // console.log(`normalizedPDFname: ${name} --> ${newName}`);
  return newName;
}


/**
 * Converts some arbitrary binary data to an ASCIIHex-encoded PDF stream object that
 * will work nicely in VSCode.
 * 
 * @param eol - the EOL setting in the editor. Impacts length calculations
 * @param data - a buffer of bytes
 * @param objNum - object number to use
 * @param genNum - generation number to use. Default = 0
 * @param otherFilters - other filters already used by data. Default = none
 * @param otherEntries - other key/value pairs to add to the stream extent dictionary. Default = none
 * @returns a full PDF stream object of the data encoded as ASCIIHex 
 */
export function convertDataToAscii85Stream(
  eol: vscode.EndOfLine,
  data: Buffer, 
  objNum: number, 
  genNum: number = 0, 
  otherFilters: string = "", 
  otherEntries: string[] = []
): string[] {
  let obj: string[] = [];
  const a85: string[] = convertToAscii85Filter(data);
  const num_a85_lines =  a85.length;
  const a85_length = a85.join('\n').length + (num_a85_lines * _EOLtoBytes(eol));
  obj.push(`${objNum} ${genNum} obj`);
  obj.push(`<<`);
  obj = obj.concat(otherEntries);
  obj.push(`  /Length ${a85_length} % length of the ASCII85 encoded data, ${num_a85_lines} lines`);
  obj.push(`  /Filter [ /ASCII85Decode ${otherFilters} ]`);
  obj.push(`  /DL ${data.length} % length of the decoded data`);
  obj.push(`>>`);
  obj.push(`stream`);
  obj = obj.concat(a85);
  obj.push(`endstream`);
  obj.push(`endobj`);
  // console.log(`convertDataToAscii85Stream: ${obj}`);
  return obj;
}


/**
 * Converts some arbitrary binary data to an ASCII85-encoded PDF stream obj that
 * will work nicely in VSCode.
 * 
 * @param eol - the EOL setting in the editor. Impacts length calculations
 * @param data - a buffer of bytes
 * @param objNum - object number to use
 * @param genNum - generation number to use. Default = 0
 * @param otherFilters - other filters already used by data. Default = none
 * @param otherEntries - other key/value pairs to add to the stream extent dictionary. Default = none
 * @returns a full PDF stream object of the data encoded as ASCII85 
 */
export function convertDataToAsciiHexStream(
  eol: vscode.EndOfLine,
  data: Buffer, 
  objNum: number, 
  genNum: number = 0, 
  otherFilters: string = "", 
  otherEntries: string[] = []
): string[] {
  let obj: string[] = [];
  const aHex: string[] = convertToAsciiHexFilter(data);
  const num_aHex_lines =  aHex.length;
  const aHex_length = aHex.join('\n').length + (num_aHex_lines * _EOLtoBytes(eol));
  obj.push(`${objNum} ${genNum} obj`);
  obj.push(`<<`);
  obj = obj.concat(otherEntries);
  obj.push(`  /Length ${aHex_length} % length of the ASCIIHex encoded data, ${num_aHex_lines} lines`);
  obj.push(`  /Filter [ /ASCIIHexDecode ${otherFilters}]`);
  obj.push(`  /DL ${data.length} % length of the decoded data`);
  obj.push(`>>`);
  obj.push(`stream`);
  obj = obj.concat(aHex);
  obj.push(`endstream`);
  obj.push(`endobj`);
  // console.log(`convertDataToAsciiHexStream: ${obj}`);
  return obj;
}


/**
  * Converts a PDF literal string to a PDF hex string.
  * 
  * @param literal - PDF literal string including `(` and `)`
  * @returns a PDF hex string including `<` and `>`
  */
export function convertLiteralToHexString(literal: string): string {
  let hex: string = "<";
  const lit = literal.slice(1, literal.length - 1); // remove "(" and ")"
  let i: number = 0; 
  let ch: number = -1;
  while (i < lit.length) {
    if (lit[i] === "\\") {
      // Literal string escape sequence - Table 3 ISO 32000-2:2020
      i++;
      if ((lit[i] >= "0") && (lit[i] <= "7") && ((i + 2) < lit.length)) {
        // 3-digit octal code
        const octal = lit.slice(i, i + 3);
        try {
          ch = parseInt(octal, 8);
        }
        catch {
          ch = -1;
        }
        i = i + 3;
      }
      else {
        switch (lit[i]) {
          case "n": ch = 0x0A; break; // line feed
          case "t": ch = 0x09; break; // horizontal tab
          case "r": ch = 0x0D; break; // carriage return
          case "b": ch = 0x08; break; // backspace
          case "f": ch = 0x0C; break; // form feed
          case "(": ch = 0x28; break; // left paren
          case ")": ch = 0x29; break; // right paren
          case "\\": ch = 0x5C; break; // reverse solidus
          case "\r": { // EOL or EOL pair - ignore
            ch = -1; 
            if (lit[i + 1] == "\n") 
              i++;
            break; 
          } 
          case "\n": ch = -1; break; // EOL - ignore
          default: ch = -1; break; // ignore unknown escapes
        }
      }
    }
    else { // non-escape character in literal
      ch = lit[i].charCodeAt(0);
    }

    if (ch !== -1) 
      hex = hex + ch.toString(16).padStart(2, '0');
    i++;
  }
  hex = hex + ">";
  // console.log(`Converted ${literal} to ${hex}`);
  return hex;
}


/**
  * Converts a PDF hex string to a literal string, using escape codes for unprintables.
  * 
  * @param literal - PDF hex string including `<` and `>`
  * @returns a PDF literal string including `(` and `)`
  */
export function convertHexToLiteralString(hexString: string): string {
  let lit = "(";
  const hex = hexString.slice(1, hexString.length - 1); // remove "<" and ">"
  let i: number = 0; 
  let ch: number;
  while (i < hex.length) {
    const h = hex.slice(i, i + 2);
    try {
      const ch = parseInt(h, 16);
      switch (ch) {
        case 0x0A: lit = lit + "\\n"; break; // line feed
        case 0x0D: lit = lit + "\\r"; break; // carriage return
        case 0x08: lit = lit + "\\b"; break; // backspace
        case 0x0C: lit = lit + "\\f"; break; // form feed
        case 0x5C: lit = lit + "\\\\"; break; // reverse solidus
        case 0x28: lit = lit + "\\("; break; // left paren
        case 0x29: lit = lit + "\\)"; break; // right paren
        default: {
          if ((ch < 0x20) || (ch > 127))
            lit = lit + "\\" + ch.toString(8); // unprintable so do as octal
          else
            lit = lit + String.fromCharCode(ch); // printable
          break;
        }
      }
    }
    catch { 
      // supress any hex conversion fails but keep going (fall through)
    }
    i = i + 2;
  }
  lit = lit + ")";
  // console.log(`Converted ${hexString} to ${lit}`);
  return lit;
}


/**
 * Convert any image file supported by the NPM module "sharp" to an Image XObject 
 * as an ASCII-85-compressed JPEG (i.e. `[ /ASCII85Decode /DCTDecode ]` filter pipeline).
 * The PDF Image XObject is returned as `string[]` without `\n`.
 * 
 * @param objNum - the object ID object number 
 * @param genNum - the object ID generation number
 * @param eol - current editor EOL setting for calculating lengths
 */ 
export async function convertImageToAscii85DCT(
  objNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine): Promise<string[]> 
{
  try {
    const imgFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select an image file',
      title: 'Choose an image',
      filters: { 'Images': ['jpg', 'png', 'gif', 'WebP', 'AVIF' ] }
    });
    
    if (imgFile === null || imgFile.length < 1) {
      console.error(`Valid image file not selected!`);
      vscode.window.showErrorMessage(`Valid image file not selected!`);
      return [];
    }

    let width: number;
    let height: number;
    const img = await sharp(imgFile[0].fsPath).withMetadata();
    await img.metadata()
      .then((info) => {
        console.log(info);
        width = info.width;
        height = info.height;
      });

    let pdfObj: string[];
    await img.jpeg()
      .toBuffer()
      .then((data) => {
        const extras: string[] = [];
        extras.push(`  /Type /XObject`);
        extras.push(`  /Subtype /Image`);
        extras.push(`  % ${imgFile[0].fsPath}`);
        extras.push(`  /ColorSpace /DeviceRGB % JPEGs are always RGB`);
        extras.push(`  /BitsPerComponent 8 % JPEGs are always 8 bit per color component`);
        extras.push(`  /DecodeParms [ % an array because there are 2 filters`);
        extras.push(`    null % no parameters for ASCII-85`);
        extras.push(`    << /ColorTransform 0 >> % for /DCTDecode - may need to be changed to 1`);
        extras.push(`  ]`);
        extras.push(`  /Width ${width}`);
        extras.push(`  /Height ${height}`);
        pdfObj = convertDataToAscii85Stream(eol, data, objNum, genNum, '/DCTDecode', extras);
        console.log(`Successfully converted image ${imgFile[0].fsPath} to [ /ASCII85Decode /DCTDecode ]`);
        vscode.window.showInformationMessage(`Successfully converted image ${imgFile[0].fsPath} to [ /ASCII85Decode /DCTDecode ]`);
    });
    return pdfObj;
  }
  catch (error) {
      console.error(`Failed to convert image to [ /ASCII85Decode /DCTDecode ]. Error: ${error}`);
      vscode.window.showErrorMessage(`Failed to convert to [ /ASCII85Decode /DCTDecode ]. Error: ${error}`);
      return [];
  }
}


/**
 * Convert any image file supported by the NPM module "sharp" to an Image XObject 
 * as an ASCII-Hex-compressed JPEG (i.e. `[ /ASCIIHexDecode /DCTDecode ]` filter pipeline).
 * The PDF Image XObject is returned as `string[]` without `\n`.
 * 
 * @param objNum - the object ID object number 
 * @param genNum - the object ID generation number
 * @param eol - current editor EOL setting for calculating lengths
 */ 
export async function convertImageToAsciiHexDCT(
  objNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine): Promise<string[]> 
{
  try {
    const imgFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select an image file',
      title: 'Choose an image',
      filters: { 'Images': ['jpg', 'png', 'gif', 'WebP', 'AVIF' ] }
    });
    
    if (imgFile === null || imgFile.length < 1) {
      console.error(`Valid image file not selected!`);
      vscode.window.showErrorMessage(`Valid image file not selected!`);
      return [];
    }

    let width: number;
    let height: number;
    const img = await sharp(imgFile[0].fsPath).withMetadata();
    await img.metadata()
      .then((info) => {
        width = info.width;
        height = info.height;
      });

    let pdfObj: string[];
    await img.jpeg()
      .toBuffer()
      .then((data) => {
        const extras: string[] = [];
        extras.push(`  /Type /XObject`);
        extras.push(`  /Subtype /Image`);
        extras.push(`  % ${imgFile[0].fsPath}`);
        extras.push(`  /ColorSpace /DeviceRGB % JPEGs are always RGB`);
        extras.push(`  /BitsPerComponent 8 % JPEGs are always 8 bit per color component`);
        extras.push(`  /DecodeParms [ % an array because there are 2 filters`);
        extras.push(`    null % no parameters for ASCIIHex`);
        extras.push(`    << /ColorTransform 0 >> % for /DCTDecode - may need to be changed to 1`);
        extras.push(`  ]`);
        extras.push(`  /Width ${width}`);
        extras.push(`  /Height ${height}`);
        pdfObj = convertDataToAsciiHexStream(eol, data, objNum, genNum, '/DCTDecode', extras);
        extras.push(`endobj`);
        console.log(`Successfully converted image ${imgFile[0].fsPath} to [ /ASCIIHexDecode /DCTDecode ]`);
        vscode.window.showInformationMessage(`Successfully converted image ${imgFile[0].fsPath} to [ /ASCIIHexDecode /DCTDecode ]`);
    });
    return pdfObj;
  }
  catch (error) {
      console.error(`Failed to convert image to [ /ASCIIHexDecode /DCTDecode ]. Error: ${error}`);
      vscode.window.showErrorMessage(`Failed to convert to [ /ASCIIHexDecode /DCTDecode ]. Error: ${error}`);
      return [];
  }
}


/**
 * Convert any image file supported by the NPM module "sharp" to an Image XObject 
 * as an ASCII-85 compressed raw pixels (i.e. just `/ASCII85Decode` filter),
 * The PDF Image XObject is returned as `string[]` without `\n`.
 */ 
export async function convertImageToRawAscii85(
  objNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine): Promise<string[]> 
{
  try {
    const imgFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select an image file',
      title: 'Choose an image',
      filters: { 'Images': ['jpg', 'png', 'gif', 'WebP', 'AVIF' ] }
    });
    
    if (imgFile === null || imgFile.length < 1) {
      console.error(`Valid image file not selected!`);
      vscode.window.showErrorMessage(`Valid image file not selected!`);
      return [];
    }

    let width: number;
    let height: number;
    let pdfCS: string = '/DeviceRGB % assumed!';
    const img = await sharp(imgFile[0].fsPath).withMetadata();
    await img.metadata()
      .then((info) => {
        width = info.width;
        height = info.height;
        if (info.space) {
          if ((info.space === 'cmyk') && (info.channels === 4)) {
            pdfCS = '/DeviceCMYK';
          }
          else if ((info.space === 'srgb') && (info.channels === 3)) {
            pdfCS = '/DeviceRGB';
          }
          else if ((info.space === 'b-w') || (info.space === 'bw')) {
            pdfCS = '/DeviceGray';
          }
        }
      });

    let pdfObj: string[];
    await img.raw({ depth: 'uchar' }) // force 8-bit
      .toBuffer()
      .then((data) => {
        const extras: string[] = [];
        extras.push(`  /Type /XObject`);
        extras.push(`  /Subtype /Image`);
        extras.push(`  % ${imgFile[0].fsPath}`);
        extras.push(`  /ColorSpace ${pdfCS}`);
        extras.push(`  /BitsPerComponent 8`);
        extras.push(`  /Width ${width}`);
        extras.push(`  /Height ${height}`);
        pdfObj = convertDataToAscii85Stream(eol, data, objNum, genNum, '', extras);
        console.log(`Successfully converted image ${imgFile[0].fsPath} to /ASCII85Decode`);
        vscode.window.showInformationMessage(`Successfully converted image ${imgFile[0].fsPath} to /ASCII85Decode`);
    });
    return pdfObj;
  }
  catch (error) {
      console.error(`Failed to convert image to /ASCII85Decode. Error: ${error}`);
      vscode.window.showErrorMessage(`Failed to convert to /ASCII85Decode. Error: ${error}`);
      return [];
  }
}


/**
 * Convert any image file supported by the NPM module "sharp" to an Image XObject 
 * as ASCII-Hex compressed raw pixels (i.e. just `/ASCIIHexDecode` filter).
 * The PDF Image XObject is returned as `string[]` without `\n`.
 */ 
export async function convertImageToRawAsciiHex(
  objNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine): Promise<string[]> 
{
  try {
    const imgFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select an image file',
      title: 'Choose an image',
      filters: { 'Images': ['jpg', 'png', 'gif', 'WebP', 'AVIF' ] }
    });
    
    if (imgFile === null || imgFile.length < 1) {
      console.error(`Valid image file not selected!`);
      vscode.window.showErrorMessage(`Valid image file not selected!`);
      return [];
    }    

    let width: number;
    let height: number;
    let pdfCS: string = '/DeviceRGB % assumed!';
    const img = await sharp(imgFile[0].fsPath).withMetadata();
    await img.metadata()
      .then((info) => {
        width = info.width;
        height = info.height;
        if (info.space) {
          if ((info.space === 'cmyk') && (info.channels === 4)) {
            pdfCS = '/DeviceCMYK';
          }
          else if ((info.space === 'srgb') && (info.channels === 3)) {
            pdfCS = '/DeviceRGB';
          }
          else if ((info.space === 'b-w') || (info.space === 'bw')) {
            pdfCS = '/DeviceGray';
          }
        }
      });

    let pdfObj: string[];
    await img.raw({ depth: 'uchar' }) // force 8-bit
      .toBuffer()
      .then((data) => {
        const extras: string[] = [];
        extras.push(`  /Type /XObject`);
        extras.push(`  /Subtype /Image`);
        extras.push(`  % ${imgFile[0].fsPath}`);
        extras.push(`  /ColorSpace ${pdfCS}`);
        extras.push(`  /BitsPerComponent 8`);
        extras.push(`  /Width ${width}`);
        extras.push(`  /Height ${height}`);
        pdfObj = convertDataToAsciiHexStream(eol, data, objNum, genNum, '', extras);
        console.log(`Successfully converted image ${imgFile[0].fsPath} to /ASCIIHexDecode`);
        vscode.window.showInformationMessage(`Successfully converted image ${imgFile[0].fsPath} to /ASCIIHexDecode`);
    });
    return pdfObj;
  }
  catch (error) {
      console.error(`Failed to convert image to /ASCIIHexDecode. Error: ${error}`);
      vscode.window.showErrorMessage(`Failed to convert to /ASCIIHexDecode. Error: ${error}`);
      return [];
  }
}


/**
 * Convert arbitary binary data loaded directly from a file to `/ASCII85Decode`
 * compressed stream object. The PDF stream object is returned as `string[]` without `\n`.
 */
export async function convertDataToAscii85(
  objNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine): Promise<string[]> 
{
  try {
    const dataFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select a data file',
      title: 'Choose a data file',
      filters: { 'All files': ['icc', 'icm', 'bin', '*', ] }
    });

    if (dataFile === null || dataFile.length < 1) {
      console.error(`Valid data file not selected!`);
      vscode.window.showErrorMessage(`Valid data file not selected!`);
      return [];
    }

    const readFile = util.promisify(fs.readFile);
    let pdfObj: string[];
    await readFile(dataFile[0].fsPath)
      .then((data) => {
        pdfObj = convertDataToAscii85Stream(eol, data, objNum, genNum);
        pdfObj.splice(0, 0, `% ${dataFile[0].fsPath}`);
        console.log(`Successfully converted ${dataFile[0].fsPath} to /ASCII85Decode`);
        vscode.window.showInformationMessage(`Successfully converted ${dataFile[0].fsPath} to /ASCII85Decode`);
      });
    return pdfObj;
  }
  catch (error) {
    console.error(`Failed to convert to ASCII-85. Error: ${error}`);
    vscode.window.showErrorMessage(`Failed to convert to ASCII-85. Error: ${error}`);
    return [];
  }
}


/**
 * Convert arbitary binary data loaded directly from a file to an `/ASCIIHexDecode` 
 * compressed stream object. The PDF stream object is returned as `string[]` without `\n`.
 */
export async function convertDataToAsciiHex(
  objNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine): Promise<string[]> 
{
  try {
    const dataFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select a data file',
      title: 'Choose a data file',
      filters: { 'All files': ['icc', 'icm', 'bin', '*', ] }
    });

    if (dataFile === null || dataFile.length < 1) {
      console.error(`Valid data file not selected!`);
      vscode.window.showErrorMessage(`Valid data file not selected!`);
      return [];
    }

    const readFile = util.promisify(fs.readFile);
    let pdfObj: string[];
    await readFile(dataFile[0].fsPath)
      .then((data) => {
        pdfObj = convertDataToAsciiHexStream(eol, data, objNum, genNum);
        pdfObj.splice(0, 0, `% ${dataFile[0].fsPath}`);
        console.log(`Successfully converted ${dataFile[0].fsPath} to /ASCIIHexDecode`);
        vscode.window.showInformationMessage(`Successfully converted ${dataFile[0].fsPath} to /ASCIIHexDecode`);
      });
    return pdfObj;
  }
  catch (error) {
    console.error(`Failed to convert to ASCIIHex. Error: ${error}`);
    vscode.window.showErrorMessage(`Failed to convert to ASCIIHex. Error: ${error}`);
    return [];
  }
}

/**
 * Convert one or more PDF indirect objects (objects in a body section) to an **UNCOMPRESSED**
 * object stream. Stream objects are not allowed to be in the input.
 * Note that Adobe does not support uncompressed object streams!
 * Does **NOT** check if object is just an indirect reference (which is not permitted in object streams).
 * 
 * @param inp - lines from input PDF comprising 1 or more full PDF indirect objects
 * @returns the PDF object stream is returned as `string[]` without `\n`.
 */ 
export function objectsToObjectStream(eol: vscode.EndOfLine, inp: string[]): string[] {
  const inpLinesLen = inp.length; // number of lines
  const inpString = inp.join('\n'); // input lines as a single string

  if ((inpLinesLen === 0) || (inpString.trim().length === 0)) return []; 

  const stream = inpString.match(/[ \t\r\n\f\0>]stream[ \t\r\n\f\0]/g);
  const endstream = inpString.match(/[ \t\r\n\f\0]endstream[ \t\r\n\f\0]/g);
  if ((stream && (stream.length > 0)) || (endstream && (endstream.length > 0))) {
    console.error(`Stream objects cannot be converted to object streams!`);
    vscode.window.showErrorMessage(`Stream objects cannot be converted to object streams!`);
    return [];
  }

  const obj = inpString.match(/[ \t\r\n\f\0]\d+[ \t\r\n\f\0]\d+[ \t\r\n\f\0]obj[ \t\r\n\f\0]/g);
  const endobj = inpString.match(/[ \t\r\n\f\0]endobj[ \t\r\n\f\0]/g);
  if (((obj && (obj.length === 0)) || 
      ((endobj && (endobj.length === 0)) || 
      (obj.length !== endobj.length)))) 
  {
    console.error(`No or partial objects were found. Cannot convert to an object stream!`);
    vscode.window.showErrorMessage(`No or partial objects were found. Cannot convert to an object stream!`);
    return [];
  }

  // Object stream required entries and body
  let N: number = -1;
  let firstLine: string = '';
  const objStm: string[] = [];

  // convert indirect objects to object stream
  let firstObjectNum: number = -1;
  let i: number;
  let inObj: boolean = false;
  let m: RegExpMatchArray;
  for (i = 0; i < inpLinesLen; i++) {
    if (inp[i].trim().length === 0) {
      // blank or whitespace-only line --> skip
    }
    else if ((m = inp[i].match(/(\d+)[ \t\r\n\f\0]\d+[ \t\r\n\f\0]obj/))) {
      // Matched an "X Y obj"
      inObj = true;
      if (firstObjectNum < 0) firstObjectNum = parseInt(m[1]);
      firstLine = firstLine + ' ' + m[1] + ' ' + objStm.join('\n').length;
      N++;
    }
    else if (inp[i].match(/endobj/)) {
      // "endobj" --> skip over
      inObj = false;
    }
    else if (inObj) {
      // non-blank and between "X Y obj" / "endobj" --> add to object stream
      objStm.push(inp[i]);
    }
  }
  firstLine = firstLine.trim();

  // Create the object stream without any `\n`
  let out: string[] = [];
  const first: number = firstLine.length + 1;
  const objStm_lines = objStm.length;
  const length: number = first + objStm.join('\n').length + (objStm_lines * _EOLtoBytes(eol));
  out.push(`${firstObjectNum} 0 obj`);
  out.push(`<< % UNCOMPRESSED object stream`);
  out.push(`  /Type /ObjStm % required`);
  out.push(`  /Length ${length} % required, ${objStm_lines} lines`);
  out.push(`  /DL ${length}`);
  out.push(`  /Filter null % object stream data is uncompressed`);
  out.push(`  /N ${N} % required: number of objects stored in this object stream`);
  out.push(`  /First ${first} % required: byte offset in stream of the 1st object.`);
  out.push(`>>`);
  out.push(`stream`);
  out.push(`${firstLine}`);
  out = out.concat(objStm);
  out.push(`endstream`);
  out.push(`endobj`);
  console.log(`objectsToObjectStream: ${out}`);
  return out;
}


/**
 * Convert a conventional cross-reference table to an **UNCOMPRESSED** cross-reference stream.
 * Note that Adobe does not support uncompressed cross-reference streams!
 * Does **NOT** check validity of the input conventional cross-reference table!!!
 * 
 * @param inp - lines from input PDF comprising a conventional cross-reference table starting
 *              with `xref` keyword up to and including `%%EOF`
 * @returns the PDF cross reference stream is returned as `string[]` without `\n`.
 */ 
export function xrefToXRefStream(
  objStmNum: number, 
  genNum: number, 
  eol: vscode.EndOfLine,
  inp: string[]): string[] 
{
  const inpLinesLen = inp.length; // number of lines
  const inpString = inp.join('\n'); // input lines as a single string

  if ((inpLinesLen === 0) || (inpString.trim().length === 0)) return []; 

  if (!inp[0].startsWith("xref")) {
    console.error(`Conventional cross reference table must start with 'xref'!`);
    vscode.window.showErrorMessage(`Conventional cross reference table must start with 'xref'!`);
    return [];
  }

  const trailerIdx = inp.findIndex((s) => (s.trim() === 'trailer'));
  if (trailerIdx === -1) {
    console.error(`Conventional cross reference table must include a 'trailer'!`);
    vscode.window.showErrorMessage(`Conventional cross reference table must include a 'trailer'!`);
    return [];
  }

  if (!inp[inpLinesLen - 3].startsWith("startxref")) {
    console.error(`Conventional cross reference table must include 'startxref' as 3rd last line!`);
    vscode.window.showErrorMessage(`Conventional cross reference table must include 'startxref' as 3rd last line!`);
    return [];
  }

  if (!inp[inpLinesLen - 1].startsWith("%%EOF")) {
    console.error(`Conventional cross reference table must end with '%%EOF'!`);
    vscode.window.showErrorMessage(`Conventional cross reference table must end with '%%EOF'!`);
    return [];
  }

  try {
    const inpXrefEntries = inp.slice(1, trailerIdx);

    // Cross reference stream data
    let indexStr: string = '';
    const startxrefOffset: number = 0;
    const xrefEntries: string[] = []; // the ASCII-Hex encoded entries as per Table 18

    let objNum: number = -1;
    let objCount: number = -1;
    let m: RegExpMatchArray;
    for (const e of inpXrefEntries) {
      if ((objNum >= 0) && (objCount > 0) && ((m = e.match(/^(\d{10}) (\d{5}) f\b/)))) {
        // free object --> Type 0: 00 <obj:%08x> <gen:%04x>
        const obj = parseInt(m[1]);
        const gen = parseInt(m[2]);
        xrefEntries.push(`00 ${obj.toString(16).padStart(8, '0')} ${gen.toString(16).padStart(4, '0')}`);
        objNum++;
        objCount--;
      }
      else if ((objNum > 0) && (objCount > 0) && ((m = e.match(/^(\d{10}) (\d{5}) n\b/)))) {
        // in-use object --> Type 1: 01 <byteOffset:%08x> <gen:%04x>
        const byteOffset = parseInt(m[1]);
        const gen = parseInt(m[2]);
        xrefEntries.push(`01 ${byteOffset.toString(16).padStart(8, '0')} ${gen.toString(16).padStart(4, '0')}`);
        objNum++;
        objCount--;
      }
      else if ((m = e.match(/^(\d+) (\d+)\b/))) {
        // Set objNum and objCount
        objNum = parseInt(m[1]);
        objCount = parseInt(m[2]);
        indexStr = indexStr + m[1] + ' ' + m[2] + ' ';
      }
    }

    // Find all the lines making up the trailer dictionary (immediately after 'trailer' keyword).
    // Remove first `<<` and final `>>` then copy everything else to output
    let trailerLines = inp.slice(trailerIdx + 1, inp.length - 3);
    if (trailerLines[0].trim() === '<<') 
      trailerLines = trailerLines.slice(1); // common case
    else {
      let t = trailerLines.join('\n');
      t = t.replace('<<', '');
      trailerLines = t.split('\n');
    }
    if (trailerLines[trailerLines.length - 1].trim() === '>>') 
      trailerLines = trailerLines.slice(0, trailerLines.length - 2); // common case
    else {
      let t = trailerLines.join('\n');
      for (let i = t.length; i > 0; i--) {
        if ((t[i] === '>') && (t[i - 1] === '>')) {
          t = t.substring(0, i-2) + t.substring(i + 1);
          trailerLines = t.split('\n');
          break;
        }
      }
    }

    let xrefStm: string[] = []; // the output cross reference stream
    const xrefEntries_lines = xrefEntries.length;
    const length = (xrefEntries.join('\n').length + 1) + (xrefEntries_lines * _EOLtoBytes(eol)); // +1 is for EOD '>'
    xrefStm.push(`${objStmNum} ${genNum} obj`);
    xrefStm.push(`<<`);
    xrefStm.push(`  /Type /XRef % required`);
    xrefStm.push(`  /Length ${length}`); 
    xrefStm.push(`  /Filter /ASCIIHexDecode`);
    xrefStm.push(`  /Index [ ${indexStr.trim()} ]`);
    xrefStm.push(`  /W [ 1 4 2 ]`);
    xrefStm.push(`  % original trailer dictionary entries:`);
    xrefStm = xrefStm.concat(trailerLines);
    xrefStm.push(`>>`);
    xrefStm.push(`stream`);
    xrefStm = xrefStm.concat(xrefEntries, '>'); // add ASCII-Hex EOD
    xrefStm.push(`endstream`);
    xrefStm.push(`endobj`);
    xrefStm.push(`startxref`);
    xrefStm.push(`${startxrefOffset}`);
    xrefStm.push(`%%EOF`);
    return xrefStm;
  }
  catch (error) {
    console.error(`ERROR: Conventional cross reference table conversion failed: ${error}!`);
    vscode.window.showErrorMessage(`ERROR: Conventional cross reference table conversion failed: ${error}!`);
    return [];
  }
}
