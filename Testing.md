# Testing Strategy / Plan

# Corpora

- https://github.com/pdf-association/safedocs
- https://github.com/pdf-association/pdf20examples/ 
- https://github.com/pdf-association/interactive-pdf - "Sample lessons" folder
- https://github.com/pdfix/Functional-PDF-Exemplars-ISO-32000-2 

# Display / Navigation
- check things work for `.pdf` and `.fdf` files

## Syntax highlighting

Text-based PDF-centric grammars to test: COS, Content Streams, XMP (XML), PS Type 4 Functions, CMaps, JavaScript, other embedded XML (e.g. ZUGFeRD, Order-X, Fractur-X)

- check with test-based PDFs
- check with binary PDFs - does the syntax highlighting eventually re-sync after binary data??

NOTE: there is some confusion over empty dictionaries and hex-strings.
NOTE: there is some confusion over multi-line literal strings.

## Folding
- check folding of `X Y obj` to matching `endobj` - what if no matching?
- check folding of `stream` to matching `endstream` - what if no matching?
- check folding of dictionaries with `<<` and `>>` on lines by themselves
- check folding of dictionaries (incl. deeply nested) with `/Keyname <<` and `>>` on a line by itself

NOTE: there is some confusion over empty dictionaries and hex-strings.

## Hover hints
- check hovers of `xref` table in-use (`n`) entries
- check hovers of `xref` table free (`f`) entries
- check hovers of hex-strings `<...>` - check degenerate `<>`
- check hovers of literal strings `(...)` - especially with escape sequences, octal codes, multi-line, etc. Check degenerate `()`
- check hovers of name objects with `#`-hex pairs `/...#xx...`


## Bracket Matching
- check bracket matching for dictionaries and hex-strings `<`/`>`
- check bracket matching for literal strings `(`/`)`
- check bracket matching for arrays `[`/`]`
- check bracket matching for PS Type 4 functions `{`/`}`

## "Go to" functionality

Use a PDF with incremental updates where multiple objects exist with the same object ID.

- right-click `X Y obj`
- right-click `X Y R`
- right-click cross reference table in-use `n` entry

## Outline / Breadcrumbs
- use a PDF with multiple incremental updates
- change/edit/add/delete various keywords and comments

## Sankey Flow Diagram
-

# Editing 

## Snippets
- start with a blank editor (with extension `.pdf`)
- type "PDF-" on a blank line --> new PDF file
- type snippets on a comment line `%` --> nothing!

# Block comment / uncomment
- pick some arbitrary lines of a file. Toggle '%' comment on and off

## Auto-complete and auto-closing
-

## Auto-indent and Auto-outdent on ENTER
-

## File validation

- check `%PDF-` header with good and bad versions
- change/edit/add/delete a `xref` keyword in a PDF and in an incremental update
- change/edit/add/delete a `trailer` keyword in a PDF and in an incremental update 
- change/edit/add/delete a `startxref` keyword in a PDF and in an incremental update
- change/edit/add/delete a `%%EOF` keyword in a PDF and in an incremental update
- change/edit/add/delete a cross reference in-use `n` entry - add whitespace or junk at end of line
- change/edit/add/delete a cross reference in-use `f` entry - add whitespace or junk at end of line
- change/edit/add/delete a cross reference subsection marker line - add junk at end of line

## Custom Commands
-
