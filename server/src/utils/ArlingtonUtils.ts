/**
 * VSCode PDF COS syntax Arlington PDF Model utility functions
 *
 * @copyright Copyright 2023 PDF Association, Inc. https://www.pdfa.org
 * SPDX-License-Identifier: Apache-2.0
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

import { ArlingtonPDFModel } from "../models/ArlingtonPDFModel";
import type { AlringtonItem } from "../models/ArlingtonPDFModel";

import type {
  CompletionItem
} from "vscode-languageserver/node";

import {
  CompletionItemKind,
  MarkupKind,
} from "vscode-languageserver/node";


  /**
   * Returns a list of all key names from the Arlington PDF Model (except for wildcards).
   * If a key is unique then lots of detail.
   * 
   * @todo support deprecation tags in 
   * @todo support filtering by PDF version from header / Catalog::Version
   */
export function DictKeyCodeCompletion() : CompletionItem[] {
  const dictKeys: CompletionItem[] = [];

  let k: AlringtonItem;
  for (k of ArlingtonPDFModel) {
    if (k.Key.includes("*")) { continue; } // skip wildcards
    const alreadyExist = dictKeys.find((obj) => { return obj.label === k.Key; });
    if (!alreadyExist) {
      dictKeys.push({
        kind: CompletionItemKind.Variable,
        // data: k.Data, // not needed
        label: k.Key,
        detail: k.Object,
        documentation: { kind: MarkupKind.Markdown, value: k.Documentation },
        // tags: [ CompletionItemTag.Deprecated ]
      });
    }
    else {
      // Multiple objects have a key with this name. Clean out the specifics.
      alreadyExist.documentation = "";
      if (alreadyExist.detail && (alreadyExist.detail !== "Many...")) {
        alreadyExist.detail = alreadyExist.detail + ", " + k.Object;
        // Too many objects so don't list them all
        if (alreadyExist.detail.length > 90) { alreadyExist.detail = "Many..."; }
      }
      alreadyExist.data = 0;
    }
  }
  return dictKeys;
}


/**
 * Returns the list of possible name values for a given dictionary key.
 * @param dictKey - the PDF key name
 */
export function DictKeyValueCodeCompletion(dictKey: string) : CompletionItem[] {
  const dictKeyValues: CompletionItem[] = [];

  let k: AlringtonItem;
  for (k of ArlingtonPDFModel) {
    if (k.Key.includes("*")) { continue; } // skip wildcards

    /** @todo support multi-typed keys: k.Type.includes("name") */
    if ((k.Key === dictKey) && (k.Type === "name")) {
      const values = k.PossibleValues.slice(1, k.PossibleValues.length - 1).split(',');
      let v: string;
      for (v of values) {
        dictKeyValues.push({
          kind: CompletionItemKind.Variable,
          label: v,
          detail: k.Object + "::" + k.Key,
          documentation: { kind: MarkupKind.Markdown, value: k.Documentation },
        });
      }
    }
  }
  return dictKeyValues;
}
