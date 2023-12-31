# VSCode PDF extension

![Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/pdfassociation.pdf-cos-syntax)
&nbsp;&nbsp;&nbsp;
![License](https://img.shields.io/github/license/pdf-association/pdf-cos-syntax)
&nbsp;&nbsp;&nbsp;
![LinkedIn](https://img.shields.io/static/v1?style=social&label=LinkedIn&logo=linkedin&message=PDF-Association)
&nbsp;&nbsp;&nbsp;
![YouTube Channel Subscribers](https://img.shields.io/youtube/channel/subscribers/UCJL_M0VH2lm65gvGVarUTKQ?style=social)


## TL;DR

This is **NOT** a debugger, renderer or text extractor for PDF!!

> This extension will **NEVER** render PDF pages or provide support like an interactive PDF viewer. There are other VSCode extensions and external applications which do this... but be aware that not all implementations are correct and most will _not_ indicate if a PDF contains syntax errors! 

> Implementers with suitable PDF rendering and viewing technologies are encouraged to create their own VSCode extensions to render PDF pages to work along side this extension.   

PDF (**Portable Document Format**) is an open page description language standard for fully typeset and paginated electronic documents defined by ISO 32000-2:2020 ([available at no cost](https://www.pdfa-inc.org/product/iso-32000-2-pdf-2-0-bundle-sponsored-access/)). 

This extension provides the following features for learning about text-based PDF files that use _conventional_ cross-reference sections (i.e. _not_ using cross-reference streams introduced with PDF 1.5):

- Support for both `.pdf` and `.fdf` files (based on file extension)
- PDF COS syntax and content stream operator [syntax highlighting](#syntax-highlighting) 
- [Hover](#hover-hints) information for cross reference section entries, `endstream` and `endobj`, bitmask keys, and string objects
- [Auto-complete and Auto-closing](#auto-complete-and-auto-closing) for dictionaries, arrays, strings, PostScript brackets and PDF name objects (starting with `/`)
- [Multi-line folding](#folding) for PDF objects, streams, dictionaries, conventional cross reference sections, and all paired graphics operators
- [Auto-indent and auto-outdent](#auto-indent-and-auto-outdent-on-enter) on ENTER 
- "[Go To definition](#go-to-functionality)", "Go To declaration", and "Find all references" functionality for PDF objects, including in PDFs with incremental updates and multiple objects with the same ID 
- "[Bracket matching](#bracket-matching)" for special PDF tokens  
- Single- and multi-line [comment toggling](#commenting--uncommenting-lines) 
- Basic PDF and FDF file validation, including comprehensive cross reference section checks
- [Snippets](#snippets) for new object, new stream, and empty PDF/FDF files
- [Outline View and Breadcrumbs](#outline-view-and-breadcrumbs) of the PDF file structure, including objects, streams and incremental updates 
- Many [Custom Commands](#custom-commands) to insert images, convert data, etc. using `ASCIIHexDecode` and `ASCII85Decode` filters (so binary data becomes text-based)


So get yourself the [latest no-cost PDF ISO 32000-2 specification](https://www.pdfa-inc.org/product/iso-32000-2-pdf-2-0-bundle-sponsored-access/), grab your free [PDF Cheat Sheets](https://pdfa.org/resource/pdf-cheat-sheets/), check out a few GitHub repos of text-centric PDF files (e.g. [PDF 2.0 Examples](https://github.com/pdf-association/pdf20examples/) repo, [PDF Differences](https://github.com/pdf-association/pdf-differences) repo, or [DARPA "SafeDocs"](https://github.com/pdf-association/safedocs) repo), and learn to program in PDF like any other graphics or page description language. And, if you already know HTML or SVG, then becoming fluent in PDF is not far away!

## PDF files are _BINARY_!

Technically all PDF files are **binary files** and should **never** be arbitrarily edited in, or saved from, text-based editors such as VSCode as this **will** break them! PDF files use precise byte offsets for locating objects and data, and can contain compressed or encrypted data. PDFs are **NOT** UTF-8 (even thoughout PDF 2.0 files may contain UTF-8 string objects internally)!

However, for the purposes of learning PDF or manually writing targeted PDF test files, it is possible to use a text editor if extra care is taken and certain features are avoided. The functionality provided by this extension is **NOT** intended for debugging or analysis of real-world PDF files as such files are "far too binary" for text editors such as VSCode. Use a proper PDF forensic inspection utility or a dedicated hex editor!

In particular, VSCode interprets all input as UTF-8 which will result in corrupted PDF files if PDF files with binary data are then saved! VSCode alters the the input byte sequence and will replace with "best guess" UTF-8 byte sequences and the [Unicode replacement character](https://en.wikipedia.org/wiki/Specials_(Unicode_block)#Replacement_character) "&#xFFFD;"! This will break almost all real-world PDFs that use encryption or compression filters (besides `ASCIIHexDecode` or `ASCII85Decode`). 

If you see any of these messages in VSCode then your PDF file is unsuitable/incompatible with this extension:

![VSCode binary file error](assets/VSCode-BinaryError.png)

Do **NOT** "Disable Invisible Highlight":

![VSCode invisible Unicode warning](assets/VSCode-InvisibleUnicode.png)

If you see this VSCode error message then you **must** choose "Ignore":

![VSCode mixed end-of-line error message](assets/VSCode-MixedEOLs.png)

## Learning PDF

Although PDF files are technically binary, when first learning PDF or when manually creating targeted test files it is convenient to use  "pure text" PDF files. As a result it is helpful to have a modern development/IDE environment with features such as syntax highlighting, folding, Intellisense, Go-To definition, find all references, snippet insertion, auto-indenting, auto-closing, outlining, breadcrumbs, etc.

A minimal PDF may only require binary bytes (>127) for the 4-bytes of the binary marker comment in the 2nd line of the file. When chosen carefully, this sequence of bytes can avoid confusion by VSCode. The following 5 byte sequence meets the PDF requirement to have a comment (`%` = 0x25) followed by 4 bytes all above 0x7F (>127) while also being valid 2-byte UTF-8 sequences - as a result VSCode will _**only display 2 characters representing the 4 binary bytes in the PDF!**_:

- In binary (hex values):  `25 C2 A9 C2 A9`
- As shown in VSCode (as UTF-8): `%©©`

If saved from VSCode, this will remain valid and thus is **highly recommended** for PDF files created with VSCode.

All other binary data, such as images or Unicode sequences, can be encoded using `ASCIIHexDecode` or `ASCII85Decode` filters, hex strings, literal string escape sequences, name object hex codes, etc. To assist with visualizing  whitespace and any non-printable control bytes, it is **strongly recommended** to enable both "Render whitespace" and "Render Control Characters" via the View \| Appearance... submenu.

A productive learning environment also works best with _conventional_ PDF files with _conventional_ cross reference sections (i.e. those with the `xref` and `trailer` keywords). PDF 1.5 or later files with either cross-reference (`/Type /XRef`) streams, hybrid-reference PDFs that have trailer dictionaries with a `/XRefStm` entry, or object streams (`/Type /ObjStm`) have additional hurdles to understanding PDF and are also more likely to contain binary data.


### Alternatives

The free open-source [VIM editor](https://www.vim.org/) ("Vi IMproved") also supports basic PDF COS syntax highlighting, but lacks many other features this extension provides.

Various GUI-based PDF forensic analysis tools such as [iText RUPS](https://github.com/itext/i7j-rups) and [Apache PDFBox Debugger](https://pdfbox.apache.org/) allow users to make certain classes of changes to PDF files, however the exact syntax (such as whitespace and delimiters) and precise file layout (such as incremental updates and cross reference information) cannot be directly edited or precisely controlled. Such tools also use their own lexical analyzers and parsers and thus provided a different level of support when learning PDF.

There are also many other free and commercial PDF inspection tools.

# VSCode Features

The following VSCode functionality is enabled for files with extensions `.pdf` and `.fdf` (Forms Data Field) as both file formats use the same PDF COS ("_Carousel Object System_") syntax and file structure. 

Toggling word wrapping may also be useful (menu: "View | Word Wrap", `ALT`+`Z`, or &#8997; `Z`)

## Syntax Highlighting
Syntax highlighting of PDF COS syntax and PDF content streams including special handling of _most_ PDF rules for delimiters and whitespace:
- PDF dictionary objects (`<<` ... `>>`)
- PDF array objects (start `[` ... `]`)
- PDF literal string objects (start `(` ... `)` with `\` escape sequences) - single line only
- PDF hex string objects (start `<` ... `>`) - single line only
- PDF name objects (start `/` with `#` hex pairs)
- PDF integer and real number objects (including with leading `+`, `-`, `.` or multiple leading `0`s)
- PDF comments (start with `%` to end-of-line)
- all case-sensitive PDF keywords (`endobj`, `endstream`, `false`, `null`, `obj` (including associated object ID integers), `R` (including associated object ID integers), `startxref`, `stream`,  `trailer`, `true`, `xref`)
- PDF content stream operators occuring between `stream` and `endstream` keywords

To inspect the tokens that the TextMate syntax highlighter has recognized, select "Developer: Inspect Editor Tokens and Scopes" from the VSCode Command Palette (`CTRL`+`SHIFT`+`P`, or &#8679; &#8984; `P`) via the View menu. For convenience, assign the command a new shortcut such as `CTRL`+`SHIFT`+`ALT`+`I`, or &#8679; &#8984; `I`, for `I` = inspect. 

| PDF construct | [TextMate token name](https://macromates.com/manual/en/language_grammars#naming_conventions) |
| --- | --- |
| Array `[` `]` | `punctuation.definition.array.pdf` |
| Content stream operators (_only between `stream` and `endstream` keywords_) | `keyword.section.content-stream.pdf`</br> `keyword.operator.content-stream.pdf` |
| Comment | `comment.line.percent.pdf` |
| Dictionary `<<` `>>` | `punctuation.definition.dictionary.pdf` |
| Hex string `<` `>`| `string.quoted.hex.pdf` |
| Indirect reference `X Y R` (_not inside content streams_) | `keyword.control.reference.pdf` |
| Inline image data (_only between `ID` and `EI` operators_) | `binary.data.inlineimage.pdf` |
| Integer | `"constant.numeric.integer.pdf` |
| Keywords `endobj`, `false`, `null`, `X Y obj`, `startxref`, `true` | `keyword.control.pdf` | 
| Literal string `(` `)` | `string.quoted.literal.pdf` |
| Literal string escape sequences |  `constant.character.escape.backslash.pdf`</br> `constant.character.escape.backspace.pdf`</br> `constant.character.escape.eol.pdf`</br> `constant.character.escape.formfeed.pdf`</br> `constant.character.escape.linefeed.pdf`</br> `constant.character.escape.octal.pdf`</br> `constant.character.escape.return.pdf`</br> `constant.character.escape.tab.pdf`|
| Name (_starts with `/`_) | `variable.other.name.pdf` |
| Real number | `constant.numeric.real.pdf` |
| Conventional cross-reference section (_between `xref` and `trailer` keywords_) | `keyword.section.xref-trailer.pdf`</br> `keyword.control.xref-subsection.pdf`</br> `keyword.control.free-object.pdf`</br> `keyword.control.inuse-object.pdf` |
| | |

### Known issues with [TextMate grammar](syntaxes/pdf.tmLanguage.json)
Binary data will confuse syntax highlighting!! **AVOID SUCH FILES!!**
- PDF literal strings with nested brackets `(` and `)` will confuse the syntax highlighting as to the end of the literal string object. This is most often seen as a red closing bracket `)` or following PDF objects being highlighted as part of the literal string: ![VSCode bad string](assets/VSCode-BadString.png) 

    - The easiest solution is to include a backslash (i.e. use `\)` and `\(`) for any brackets inside literal strings. e.g. write "`(\(\))`" instead of "`(())`".
    - PDF literal string `\)` and `\(` escape sequences are not explicitly identified (all other literal string escape sequences from Table 3 in ISO 32000-2:2020 are supported)
- UTF-16BE (_shown below_) and UTF-8 byte order markers in PDF text strings are not specifically identified (_and they also do not display!_)
![VSCode Unicode byte order marker warning message](assets/VSCode-UnicodeBOM.png)
- `#` hex codes in literal strings are not specifically highlighted
- the syntax highlighter can get confused between hex strings `<`/`>` and dictionary start tokens `<<`/`>>`, especially if a hex string spans multiple lines.
    - one way to overcome this confusion is to always have hex strings on a single and put the dictionary close token (`>>`) on a separate new line. 
- other text-centric streams such as CMaps, XMP metadata (XML), and PostScript Type 4 functions are not explicitly syntax highlighted.


## Hover hints
If the cursor is placed over a conventional cross-reference section entry, then a hover hint will appear stating the object number. If it is an in-use entry (`n`) the byte offset is also displayed. This is very helpful for PDF files with many objects and long cross reference sections:

![VSCode hover hint for an in-use object in a conventional cross referene section](assets/VSCode-xrefHover.png)

If the cursor is over the keywords `endstream` or `endobj` then the corresponding object number and line is displayed.

![VSCode hover hint for endobj keyword](assets/VSCode-endobj-hover.png)

If the cursor is over a key name which is a bitmask (`/F`, `/Ff`, `/Flags`), then a 32 bit binary bit mask is displayed.

![VSCode hover hint for bitmask](assets/VSCode-bitmask-hover.png)

If the cursor is over a hexadecimal string (between `<` and `>`), then the ASCII of that string is displayed.

![VSCode hover hint for hex string](assets/VSCode-hexstring-hover.png)


## Auto-complete and auto-closing
This extension supports auto-complete and auto-closing for arrays (`[`,`]`), literal strings (`(`/`)`), hex strings (`<`/`>`), dictionaries (`<<`/`>>`) and PostScript brackets (`{`/`}`), outside of strings and comments.
If text is highlighted, and one of the above PDF token start symbols is then typed, VSCode will automatically add the corresponding PDF token end symbol after the highlighted text. If these tokens are entered, then the corresponding PDF token end symbol will be added after the cursor (except for dictionaries).

Auto-completion is also enabled for PDF names once `/` is pressed. This is based on the [Arlington PDF Model](https://github.com/pdf-association/arlington-pdf-model) and currently lists all dictionary key names defined in ISO 32000-2:2020.


## Multi-line folding
Folding is enabled for PDF objects streams (`X Y obj`/`endobj`), streams (`stream`/`endstream`), conventional cross reference sections (`xref`/`trailer`) and multi-line PDF dictionary objects (`<<`...`>>`). The dictionary start token `<<` must be on a line by itself or preceded by a PDF name object (e.g. a key name). The dictionary end token `>>` must also be at the start of a line. 

Folding is also available for the paired PDF content stream operators `q`...`Q` `BT`...`ET`, `BX`...`EX`, `BDC`...`EMC`, and `BMC`...`EMC` when they are at the start of a line (preceded by the required operands in the case of `BDC` and `BMC`). 

Folding markers may get confused by comments, literal strings, or binary data containing these tokens. 

### Windows folding shortcuts
- `CTRL`+`SHIFT`+`[` = fold region
- `CTRL`+`SHIFT`+`]` = unfold region
- `CTRL`+`K`, `CTRL`+`[` = fold all subregions
- `CTRL`+`K`, `CTRL`+`]` = unfold all subregions
- `CTRL`+`K`, `CTRL`+`0` = fold all regions
- `CTRL`+`K`, `CTRL`+`J` = unfold all regions
### Mac folding shortcuts
- &#8984; `[` = fold region
- &#8984; `]` = unfold region
- &#8984; `K`, &#8984; `[` = fold all subregions
- &#8984; `K`, &#8984; `]` = unfold all subregions
- &#8984; `K`, &#8984; `0` = fold all regions
- &#8984; `K`, &#8984; `J` = unfold all regions


## Bracket Matching
Many IDEs for programming languages support bracketing matching, where the cursor can jump to a matching open or close bracket (e.g., `{` with `}` or `(` with `)`). In PDF, the equivalent brackets are:

- PDF dictionary objects (`<<`...`>>`)
- PDF array objects (`[`...`]`)
- PDF hex string objects (`<`...`>`)
- POstScript brackets (`{`...`}`)

This is visualized in VSCode with a outlined box around the paired brackets, with each bracket having the same text color.

### Windows bracket matching shortcut
- `CTRL`+`SHIFT`+`\` = jump to matching bracket
### Mac bracket matching shortcut
- &#8679; &#8984; `\` = jump to matching bracket


## Auto-indent and Auto-outdent on ENTER
When ENTER is hit after certain PDF start tokens (_listed below_), the next line will be automatically indented and the appropriate PDF end token will be inserted. This helps ensure that [multi-line folding support](#multi-line-folding) will work.

- PDF dictionary objects (`<<`...`>>`)
- PDF array objects (`[`...`]`)
- PDF hex string objects (`<`...`>`)
- PostScript brackets (`{`...`}`)


## "Go To" Functionality
VSCode allows easy navigation and examination of definitions, declarations and references. For PDF the following programming language equivalences are used:
- **definition**: a PDF object (`X Y obj`)
- **declaration**: the in-use cross-reference section entry for a PDF object (e.g., `0000003342 00000 n`)
- **reference**: an indirect reference (`X Y R`) to a PDF object

Note that for PDFs with incremental updates there _might_ be multiple objects with the same object ID (i.e., the same object number `X` and generation number `Y`). In this case all matches are displayed in a side panel for easy selection and navigation.

Placing the cursor anywhere in the object ID (the object number `X` or generation number `Y`) of an indirect reference (`X Y R`) or on the line of a conventional cross-reference section entry for an in-use object (e.g., `0000003342 00000 n`), and then selecting "Go to definition" will jump the cursor to the associated object (`X Y obj`). 

Placing the cursor anywhere in the object ID (the object number `X` or generation number `Y`) of an object definition (`X Y obj`) or indirect reference (`X Y R`), and then selecting "Find all references" will find all indirect references (`X Y R`) to that object. The references will be listed in the "References" sidebar panel.

**NOT IMPLEMENTED YET** - "Go To declaration" from `X Y R` or `X Y obj` to the appropriate cross reference section in-use `n` entry

### Windows Go To shortcuts
- `F12` = goto definition
- `ALT`+`F12` = peek definition
- `CTRL`+`K`, `F12` = open definition to the side
- `SHIFT`+`F12` = show references
- `ALT`+`LEFT-ARROW` = return to previous location
### Mac Go To shortcuts
- `F12` = goto definition
- &#8997; `F12` = peek definition
- &#8984; `K`, `F12` = open definition to the side
- &#8679; `F12` = show references
- &#8997; `LEFT-ARROW` = return to previous location


## Commenting & uncommenting lines 
Commenting and uncommenting one or more lines in a PDF enables features and capabilities to be switched on or off easily. Note that PDF only has line comments (`%`). Highlight one or more lines in a PDF/FDF file and use the "Toggle Line Comment" command.

### Windows comment shortcut
- `CTRL`+`/` = toggle line comment
### Mac comment shortcut
- &#8984; `/` = toggle line comment


## Basic PDF/FDF validation

VSCode can perform basic validation on _conventional_ PDF and FDF files (i.e. those **not** using cross-reference streams introduced in PDF 1.5). Validation issues are output to the "Problems" window (`CTRL`+`SHIFT`+`M` or &#8679; &#8984; `M`) and by clicking on a problem, the cursor will move to the appropriate line in the editor panel.

Validation checks include:

- checking validity of the PDF header including PDF version number (1st line) `%PDF-x.y` or `%FDF-x.y`
- checking validity of the PDF/FDF binary file comment marker (2nd line)
- checking that the PDF contains the necessary keywords to be a conventional PDF file (i.e. `xref`, `trailer` and `startxref` keywords are all present). 
    - _Note that this may falsely validate a hybrid-reference PDF that should not be used with VSCode!_
- checking that there is a conventional cross-reference section that starts with object 0 (as the start of the free list) 
- checking that there are no comments or other illegal data in conventional cross-reference sections 
- checking that cross-reference subsections are valid 
- checking that cross-reference entries are 20 bytes in length (note: VSCode does not display line endings)
- checking that the cross-reference free list of objects is valid 
- checking that the last non-blank line of the PDF/FDF starts with `%%EOF`


Example view of a Problem panel:

![VSCode example problem reports](assets/VSCode-problem-report.png)


## Snippets

[Snippets](https://code.visualstudio.com/docs/editor/userdefinedsnippets) are templated fragments of PDF syntax that can be inserted into a PDF at the current cursor location. Snippets are accessed via the Command Palette "Insert Snippet" or via IntelliSence (Windows: `CTRL` + `SPACE`, or Mac: &#8984; `SPACE`)

* `obj` - an empty PDF object. If you prefix with the object number (e.g. `10 obj`) then the snippet will expand nicely for you and add a default generation number of `0`.
* `stream` - an empty PDF stream object.  If you prefix with the object number (e.g. `10 stream`) then the snippet will expand nicely for you  and add a default generation number of `0`.
* `PDF-` - a complete minimal empty PDF file. Do **not** prefix this with `%` as this is a PDF comment marker and VSCode does **not** do snippet expansion inside comments! The snippet will automatically add the `%` for you.
  - The easiest way to use this snippet is to create an empty file with a `.pdf` (or `.fdf`) extension in the Explorer panel. Then open the new file, type `PDF-` on line 1 and select the snippet.

* `FDF-` - a complete minimal empty FDF file. Do **not** prefix this with `%` as this is a PDF comment marker and VSCode does **not** do snippet expansion inside comments! The snippet will automatically add the `%` for you.


## Outline View and Breadcrumbs

The extension analyzes PDFs for certain keywords and special comments (i.e. `%%PDF-x.y`, `X Y obj`, `stream`, `endstream`, `endobj`, `trailer`, `startxref`, `%%EOF`) to provide an outline tree-view of the physical file layout and structure. Objects (`X Y obj` to `endobj`) shown in this view are shown in the _physical file order_, not by object number order (since objects in PDF may be in any order). This is displayed in Outline window and as a "breadcrumb" trail at the top of the edit window. When editing a PDF, and especially if changing any of these keywords, strange or partial file structures may be shown. If this persists, ensure keywords are spelt correctly, are in the correct order, and that the required whitespace rules are used - generally speaking this means having keywords start on new lines.

The breadcrumb trail at the top of the edit window:

![VSCode Breadcrumbs](assets/VSCode-breadcrumbs.png)

The Outline tree view:

![VSCode Outline View](assets/VSCode-outline-view.png)

## Custom Commands

The extension provides various custom commands via the Command Palette (`CTRL`+`SHIFT`+`P`, or &#8679; &#8984; `P`) or the editor context menu under a new "PDF" category:

![VSCode PDF Command Palette](assets/VSCode-command-palette.png)

* import and conversion of various common image files (such as JPEG, PNG, or GIF) to a new Image XObject at the current cursor position using either ASCII-Hex or ASCII-85 filters. The use of these filters ensures that the binary image data does not get corrupted by VSCode as the output from these filters is always ASCII. The Image XObject can either be raw pixels (with single `/ASCIIHexDecode` or `/ASCII85Decode` filter) or a JPEG (using a chain of filters such as `[ /ASCIIHexDecode /DCTDecode ]` or `[ /ASCII85Decode /DCTDecode ]`).

* import and conversion of any external file (such as ICC, etc.) as a new stream object at the current cursor position using either ASCII-Hex or ASCII-85 filters. The use of these filters ensures that any binary data in the external file does not get corrupted by VSCode as the output from these filters is always ASCII.

* conversion of selected data to or from `/ASCIIHexDecode` or `/ASCII85Decode` encoded formats. In both cases the complete encoded data must be selected and include the appropriate end-of-data (EOD) marker (`>` and `~>` respectively). 
    - Note that VSCode _may corrupt binary data_ on decoding!

* conversion of a selected literal string (`(`...`)`) to a hex string (`<`...`>`). The entire literal string must be selected, including `(` and `)`.

* conversion of a selected hex string (`<`...`>`) to a literal string (`(`...`)`) . The entire hex string must be selected, including `<` and `>`.

* conversion of one or more indirect objects (from `X Y obj` to `endobj`, excluding stream objects) from a body section into a single new object stream _(PDF 1.5)_. The new object stream will replace the selection and use the object number of the first selected object.
    - Note that the version of the PDF file is **_not_** changed! 
    - The new object stream is **uncompressed** (so it remains fully readable in VSCode) and thus will **_not_** work with certain viewers, such as Adobe.

* conversion of a selected conventional cross reference section starting with the `xref` keyword all the way to the `%%EOF` marker to a cross reference stream with `/ASCIIHexDecode` compression. 
    - The fixed layout with whitespace of the resulting hex data makes this specific format amenible to easy reading in VSCode. Refer to Table 18 in ISO 32000-2:2020.
    - Be sure to select _everything_ from `xref` to `%%EOF` inclusive! This includes the `xref` keyword, all the cross reference section lines, the `trailer` keyword and trailer dictionary, the `startxref` keyword and byte offset, and the `%%EOF` marker.
    - Note that Adobe does **_not_** support cross reference streams with `/ASCIIHexDecode` filters!


# Creation of largely text-based PDFs

This section describes how real-world heavily binary PDFs are unsuitable for reviewing using VSCode can be converted to a largely text-based equivalents more suited to VSCode. Success is dependent on both the third party tool and the specific features in the PDF file. While the output is mostly equivalent, some features will get lost by the conversion process (such as incremental updates, exact lexical conventions used in the input PDF, etc.).

## Using [QPDF](https://github.com/qpdf/qpdf) (_OSS_)

Note that this will _remove_ all incremental updates and consolidate everything into a single revision.

```bash
qpdf --qdf --compress-streams=n --object-streams=disable --newline-before-endstream --decode-level=all --preserve-unreferenced --preserve-unreferenced-resources --normalize-content=n file.pdf file-as-qdf.pdf
```

## Using [Apache PDFBox-app](https://pdfbox.apache.org/2.0/commandline.html#writedecodeddoc) (_OSS_)

Note that this will _remove_ all incremental updates and consolidate everything into a single revision. PDFBox 2.x and 3.x also use different commands:

```bash
java -jar pdfbox-app-2.0.29.jar WriteDecodedDoc file.pdf output.pdf
java -jar pdfbox-app-3.0.0.jar decode file.pdf output.pdf
```

## Using Adobe Acrobat DC (_commercial tool_):
- open a PDF
- menu: File | Save as Other... | Optimized PDF...
- create a new PDF Optimizer profile and save as "Human readable" (or some another memorable name)
    - "Make compatible with" = retain existing
    - ensure all Image settings have "Downsample" = "Off" and "Compression" = "retain existing"
    - Fonts - ensure "Do not unembed any font" is checked
    - disable Transparency, Discard Objects and Discard User Data tabs
    - Clean Up: make sure "Object compression options" = "Remove compression"

Note that this Adobe Acrobat method will not be as "pure text" as other methods as content streams, etc. have their compression filters retained whereas other methods convert content streams to uncompressed raw data.
