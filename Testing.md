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
- check syntax highlight for the basic PDF data types
- check with binary PDFs - does the syntax highlighting eventually re-sync after binary data??

NOTE: there is some confusion over empty dictionaries and hex-strings.
NOTE: there is some confusion over multi-line literal strings.

## Folding
- check folding of `X Y obj` to matching `endobj` - what if no matching?
- check folding of `stream` to matching `endstream` - what if no matching?
- check folding of dictionaries with `<<` and `>>` on lines by themselves
- check folding of dictionaries (incl. deeply nested) with `/Keyname <<` and `>>` on a line by itself
- VSCode now supports "stickiness" at the top of the edit window - this should "stick" to lines of the form `X Y obj`

NOTE: there is some confusion over empty dictionaries and hex-strings.

## Hover hints
- check hovers of `xref` table in-use (`n`) entries
- check hovers of `xref` table free (`f`) entries
- check hovers of hex-strings `<...>` 
- check degenerate hex-string `<>`
- check multi-line hex-string 
- check hovers of literal strings `(...)` - especially with escape sequences, octal codes, multi-line, etc. 
- check degenerate literal string `()`
- check multi-line literal string
- check hovers of name objects with `#`-hex pairs `/...#xx...`
- check hovers over keyword `stream`, `endobj` and `endstream`


## Bracket Matching
- check bracket matching for dictionaries and hex-strings `<`/`>` (and `<<`/`>>`)
- check bracket matching for literal strings `(`/`)`
- check bracket matching for arrays `[`/`]`
- check bracket matching for PS Type 4 functions `{`/`}`

## "Go to" functionality

Use a PDF with incremental updates (revisions) where multiple objects exist with the same object ID.

- right-click `X Y obj`
- right-click `X Y R`
- right-click cross reference table in-use `n` entry

## Outline / Breadcrumbs
- use a PDF with multiple incremental updates (revisions)
- is outline view correct?
   - check Linearized PDF
   - check Hybrid Reference PDF
   - check PDF 1.5 with cross reference streams and object streams
- does the breadcrumb at the top of the edit window match the outline?
- change/edit/add/delete various keywords and special comments
   - keywords: `obj`, `endobj`, `stream`, `endstream`, `xref`, `trailer`, `startxref` and `%%EOF`
- change/edit/add/delete various special symbols
   - symbols: `<<`, `>>`, `[`, `]`
- click on objects/items in the outline --> edit window focus line should change appropriately

# Editing 

## Snippets
- start with a blank editor (with extension `.pdf`)
- type "PDF-" on a blank line --> new PDF file
- type snippets on a comment line `%` --> _nothing should happen!_

# Block comment / uncomment
- pick some arbitrary lines of a file. Toggle `%` comment on and off

## Auto-complete and auto-closing
-

## Auto-indent and Auto-outdent on ENTER
-

# File validation

- check `%PDF-` header 
    - good PDF version
    - bad PDF versions
    - add bytes at end of line
    - missing 2nd binary marker comment
    - add a 2nd `%PDF` somewhere else in the PDF
- change/edit/add/delete `X Y obj` and `endobj` keywords in a PDF
- change/edit/add/delete `stream` and `endstream` keywords in a PDF
- change/edit/add/delete a `xref` keyword in a PDF and in an incremental update
    - delete cross reference section (but leave `xref` keyword)
- change/edit/add/delete a `trailer` keyword in a PDF and in an incremental update 
    - remove `<<` after keyword
- change/edit/add/delete a `startxref` keyword in a PDF and in an incremental update
    - remove integer after keyword
- change/edit/add/delete a `%%EOF` keyword in a PDF and in an incremental update
- change/edit/add/delete a cross reference in-use `n` entry - add whitespace or junk at end of line
- change/edit/add/delete a cross reference in-use `f` entry - add whitespace or junk at end of line
- change/edit/add/delete a cross reference subsection marker line (2 integers)
   - make just 1 integer
   - reduce the object number (1st number)
   - increase the object number (1st number)
   - reduce the number of objects (2nd number)
   - increase the number of objects (2nd number)
   - add junk at the end of the line

# Custom Commands
-

# Sankey Flow Diagram
- T.B.D.

