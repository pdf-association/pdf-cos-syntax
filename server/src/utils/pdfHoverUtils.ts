/**
 * Utilities functions to support VSCode hovers
 *
 * @copyright Copyright 2024 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
 *
 * Original portions: Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * @remarks
 * This material is based upon work supported by the Defense Advanced
 * Research Projects Agency (DARPA) under Contract No. HR001119C0079.
 * Any opinions, findings and conclusions or recommendations expressed
 * in this material are those of the author(s) and do not necessarily
 * reflect the views of the Defense Advanced Research Projects Agency
 * (DARPA). Approved for public release.
 */
'use strict';

/**
 * @public Construct a hover for PDF Date objects.
 * 
 * @param d - PDF date string (literal or hex string)
 * 
 * @returns Human-readable date for the valid parts of the PDF date string
 */
export function hoverPDFDateString(d: string): string {
  /** @todo - hex strings! */ 

  // Parse a PDF Date string into consistuent fields
  const PDFDateRegex = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([-+Z])?(\d{2})?(')?(\d{2})?(')?/gm;

  let errorInFormat: boolean = false;
  let year: number = -1;
  let month: number = 1;
  let day: number = 1;
  let hour: number = 0;
  let minute: number = 0;
  let second: number = 0;
  let utc_char: string = ''; // Z, + or -
  let utc_hour: number = 0;
  let utc_minute: number = 0;
  let s: string = '';

  const m = PDFDateRegex.exec(d);
  if (m != null) {
    try {
      // console.log(m);

      if ((m.length >= 1) && (m[1] != null)) {
        year = parseInt(m[1]);
        if (year < 0) year = 0;
        s = year.toString().padStart(4, '0');
      }

      const MonthNames: string[] = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec' ];
      if ((m.length >= 2) && (m[2] != null)) {
        month = parseInt(m[2]);
        if ((month < 1) || (month > 12)) { month = 1; errorInFormat = true; }
      }
      s = MonthNames[month - 1] + ' ' + s;

      const DaysInMonth: number[] = [ 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ]; // Leap years not checked!
      if ((m.length >= 3) && (m[3] != null) && !errorInFormat) {
        day = parseInt(m[3]);
        if ((day < 1) || (day > DaysInMonth[month - 1])) { day = 1; errorInFormat = true; }
      }
      s = day + ' ' + s;

      if ((m.length >= 4) && (m[4] != null) && !errorInFormat) {
        hour = parseInt(m[4]);
        if ((hour < 0) || (hour > 23)) { hour = 0; errorInFormat = true; }
      }
      s = s + ', ' + hour.toString().padStart(2, '0');

      if ((m.length >= 5) && (m[5] != null) && !errorInFormat) {
        minute = parseInt(m[5]);
        if ((minute < 0) || (minute > 59)) { minute = 0; errorInFormat = true; }
      }
      s = s + ':' + minute.toString().padStart(2, '0');

      if ((m.length >= 6) && (m[6] != null) && !errorInFormat) {
        second = parseInt(m[6]);
        if ((second < 0) || (second > 59)) { second = 0; errorInFormat = true; }
      }
      s = s + ':' + second.toString().padStart(2, '0');

      if ((m.length >= 7) && (m[7] != null) && !errorInFormat) {
        utc_char = m[7];

        if ((m.length >= 8) && (m[8] != null) && !errorInFormat) {
          utc_hour = parseInt(m[8]);
          if ((utc_hour < 0) || (utc_hour > 23)) { utc_hour = 0; errorInFormat = true; }

          // skip m[9] (apostrophe)

          if ((m.length >= 10) && (m[10] != null) && !errorInFormat) {
            utc_minute = parseInt(m[10]);
            if ((utc_minute < 0) || (utc_minute > 59)) { utc_minute = 0; errorInFormat = true; }
          }
        }
        if (utc_char === 'Z')
          s = s + ' UTC';
        else // + or -
          s = s + ' UTC' + utc_char + utc_hour.toString().padStart(2, '0') + ':' + utc_minute.toString().padStart(2, '0');
      }
      else {
        s = s + ' GMT'; // Default as per PDF specification
      }

    }
    catch (e) {
      console.log("ERROR: ", e);
      s = 'ERROR: ' + e + ' - ' + s;
    }
  }

  return s;
}


/**
 * @public Takes a number, assumed to be a 32 bit signed integer and
 * converts to groups of 8 bits for display as a PDF bitmask hover.
 * 
 * @param num - the assumed 32 bit integer number (converted)
 * 
 * @returns binary bitmask of flags as a string
 */
export function hoverFlags32_to_binary(num: number): string {
  const flag = Math.abs(num) & 0xFFFFFFFF;

  let s = (flag & 0x000000FF).toString(2).padStart(8, "0");
  s = ((flag & 0x0000FF00) >>  8).toString(2).padStart(8, "0") + ' ' + s;
  s = ((flag & 0x00FF0000) >> 16).toString(2).padStart(8, "0") + ' ' + s;
  s = ((flag & 0x8F000000) >> 24).toString(2).padStart(7, "0") + ' ' + s;
  if (num < 0) {
    s = "1" + s;
  }
  else {
    s = "0" + s;
  }
  return "Bitmask: " + s;
}
  
  
/**
 * @public Normalize a PDF name by replacing the 2-digit `#` hex codes with the
 * ASCII character.
 * 
 * @param name - the PDF name
 * 
 * @returns equivalent PDF name, but without any 2-digit `#` hex codes
 */
export function hoverNormalizedPDFname(name: string): string {
  if (name.indexOf('#') == -1) return name;

  const m = name.match(/(#[0-9a-fA-F][0-9a-fA-F])/g);
  if (m === null) return name;
  let newName: string = name;
  for(let i: number = 0; i < m.length; i++) {
    const hexDigits: string = m[i].slice(1, 3); // get the 2 hex digits
    const hexCode: number = parseInt(hexDigits, 16);
    newName = newName.replace(m[i], String.fromCharCode(hexCode));
  }
  // console.log(`hoverNormalizedPDFname(${name}) --> ${newName}`);
  return newName;
}


/**
 * @public convert a PDF hex string to human-readable UTF-8 string
 * 
 * @param hexstring - the PDF hex string (can include whitespace)
 * 
 * @returns UTF-8 equivalent 
 */
export function hoverHexStringToUTF8(hexstring: string): string {
  let s = hexstring.trim().replace(/ \t\n\r\f\0/g, ""); // remove all whitespace
  if (s.length === 0) return `Empty hex string`;

  s = s.length % 2 ? s + "0" : s;

  let asUTF8 = "'";
  for (let i = 0; i < s.length; i += 2) {
    const ch = String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
    asUTF8 += ch;
  }
  asUTF8 += "'";
  // console.log(`hoverHexStringToUTF8(${hexstring}) --> ${asUTF8}`);
  return asUTF8;
}
