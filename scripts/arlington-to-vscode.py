#!/usr/bin/python3
# -*- coding: utf-8 -*-
# Copyright 2023 PDF Association, Inc. https://www.pdfa.org
#
# This material is based upon work supported by the Defense Advanced
# Research Projects Agency (DARPA) under Contract No. HR001119C0079.
# Any opinions, findings and conclusions or recommendations expressed
# in this material are those of the author(s) and do not necessarily
# reflect the views of the Defense Advanced Research Projects Agency
# (DARPA). Approved for public release.
#
# SPDX-License-Identifier: Apache-2.0
# Contributors: Peter Wyatt, PDF Association
#
# Converts an Arlington PDF Model "pandas.tsv" monolithic model
# into a JSON file for use with VSCode Code Completion.
#

import pandas as pd
import sys
import csv
import os
import re
import json
import argparse
from pprint import pprint

rowCount = 1

# Each VSCode Code Completion item needs a unique ID number
# These IDs are now global for an Arlington model. VSCode does not require
# them to be sequential
def CreateVSCodeCompletionData(row):
    global rowCount
    rowCount = rowCount + 1
    return rowCount - 1


# VSCode Code Completion MarkDown-styled documentation a-la PDF specifications
# e.g.  documentation: {
#   kind: MarkupKind.Markdown,
#   value: "`array`;`boolean` _(PDF 1.2; Required; Deprecated in PDF 1.4)_ Must be indirect reference."
#   }
def CreateVSCodeCompletionDocumentation(row):
    s = "`" + row["Type"] + "` _("
    s = re.sub(";", "`;`", s)
    if (len(row["SinceVersion"]) == 3):
        s = s + "PDF " + row["SinceVersion"]
    if (row["Required"] == "TRUE"):
        s = s + "; Required"
    elif (row["Required"] == "FALSE"):
        s = s + "; Optional"
    if (row["DeprecatedIn"] != ""):
        s = s + "; Deprecated in PDF " + row["DeprecatedIn"]
    s = s + ")_"
    if (row["IndirectReference"] == "TRUE"):
        s = s + " Must be indirect reference."
    # Tidy up the documentation
    s = re.sub("_\(\)_", "", s)
    s = re.sub("_\(; ", "_(", s)
    return s


# Convert pandas TSV to JSON, but also add some additional fields for VSCode Code Completion
def ArlingtonToTS(pandas_fname: str, json_fname: str):
    df = pd.read_csv(pandas_fname, delimiter='\t', na_filter=False, 
                     dtype={'Object':'string', 'Key':'string', 'Type':'string', 'SinceVersion':'string',
                             'DeprecatedIn':'string', 'Required':'string', 'IndirectReference':'string', 
                             'Inheritable':'string', 'DefaultValue':'string', 'PossibleValues':'string',
                             'SpecialCase':'string', 'Link':'string', 'Note':'string'})

    # df is a pandas DataFrame of a full Arlington file set
    df = df.drop(columns='Note')

    # Drop all arrays - where "Object" contains "Array" or "ColorSpace"
    arr_obj = df[ df["Object"].find("Array") != -1].index
    df.drop(arr_obj, inplace = True)
    arr_obj = df[ df["Object"].find("ColorSpace") != -1].index
    df.drop(arr_obj, inplace = True)

    # Add new columns needed for VSCode Code Completion
    df["Data"] = df.apply( lambda row: CreateVSCodeCompletionData(row), axis=1)
    df["Documentation"] = df.apply( lambda row: CreateVSCodeCompletionDocumentation(row), axis=1)

    df.to_json(path_or_buf=json_fname, orient='records', indent=2)


# Attempt to load pandas created JSON file to see if it is valid
def ValidateJSONLoads(json_fname: str):
    with open(json_fname) as f:
        d = json.load(f)
        f.close()
        # pprint(d)


if __name__ == '__main__':
    cli_parser = argparse.ArgumentParser()
    cli_parser.add_argument('-p', '--pandas', dest="pandasTSV", default="pandas.tsv",
                            help='filename of a single Pandas-compatible TSV')
    cli_parser.add_argument('-j', '--json', dest="jsonFile", default="arlington.json",
                            help='filename of a JSON output file')
    cli = cli_parser.parse_args()

    if (cli.pandasTSV is None) or not os.path.isfile(cli.pandasTSV):
        print("'%s' is not a valid file" % cli.pandasTSV)
        cli_parser.print_help()
        sys.exit()

    print("Loading from '%s' --> '%s'" % (cli.pandasTSV, cli.jsonFile))
    arl = ArlingtonToTS(cli.pandasTSV, cli.jsonFile)
    ValidateJSONLoads(cli.jsonFile)
    print("Done")
