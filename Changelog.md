# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.4 - 2023-09-04
- (IMPROVED) Hover hints for cross-reference table entries
- (ADDED) Hover hints for `endstream` and `endobj` keywords
- (ADDED) Hover hints for key names which are bitmasks (`/F`, `/Ff`, `/Flags`)
- (ADDED) Hover hints for hex strings
- (ADDED) "Go to" functionality now supports PDFs with incremental updates and potentially multiple objects with the same object ID 
- (IMPROVED, FIXED and ADDED) Additional validation checks of conventional cross reference tables to Problem panel. 

## 0.1.3 - 2023-08-24
- (ADDED) Hover hints for cross-reference table entries
- (IMPROVED) bracket matching for dictionaries (`<<`,`>>`), arrays (`[`,`]`), and PostScript brackets (`{`/`}`). 
- (IMPROVED) auto-indent and auto-outdent for dictionaries (`<<`,`>>`), arrays (`[`,`]`), hex strings (`<`/`>`) and PostScript brackets (`{`/`}`). 
- (ADDED) auto-complete and auto-closing for dictionaries (`<<`,`>>`), arrays (`[`,`]`), literal strings (`(`/`)`), hex strings (`<`/`>`) and PostScript brackets (`{`/`}`). 
- (ADDED) LSP semantic token processor used by "go to" functionality to ensure correct token is located
- (IMPROVED) TextMate grammar updates for syntax highlighting for PDFs with binary data
- (IMPROVED) Folding support for objects, streams, conventional cross-reference tables and paired content stream operators 
- (ADDED and FIXED) Additional validation checks of conventional cross reference tables

## 0.1.2 - 2023-08-15
- (ADDED) Distinguish handling of FDF and PDF for validation checks and snippets
- (FIXED) Visual quality of icons (relevant to FDF) and made PNG backgrounds transparent
- (ADDED) Added badges to the README
- (ADDED) Additional validation checks of conventional cross reference tables
- Code and packaging tidy-up
- Update and improve this changelog

## 0.1.1 - 2023-08-15
- (FIXED) Fix packaging of server for "Go to" functionality

## 0.1.0 - 2023-08-14
- Initial release via Marketplace: https://marketplace.visualstudio.com/items?itemName=pdfassociation.pdf-cos-syntax  

## 0.0.2 - 2023-08-13 (prerelease)
- Initial pre-release for feedback. 
