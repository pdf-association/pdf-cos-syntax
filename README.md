# VSCode PDF extension

![Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/pdfassociation.pdf-cos-syntax)
&nbsp;&nbsp;&nbsp;
![License](https://img.shields.io/github/license/pdf-association/pdf-cos-syntax)
&nbsp;&nbsp;&nbsp;
![LinkedIn](https://img.shields.io/static/v1?style=social&label=LinkedIn&logo=linkedin&message=PDF-Association)
&nbsp;&nbsp;&nbsp;
![YouTube Channel Subscribers](https://img.shields.io/youtube/channel/subscribers/UCJL_M0VH2lm65gvGVarUTKQ?style=social)


## TL;DR

This is **NOT** a debugger, renderer or text extractor for PDF.

PDF (**Portable Document Format**) is an open page description language standard for typeset and paginated electronic documents defined by ISO 32000-2:2020 ([available at no cost](https://www.pdfa-inc.org/product/iso-32000-2-pdf-2-0-bundle-sponsored-access/)). This extension provides the following features for PDF files that use conventional cross-reference tables:

- support for both `.pdf` and `.fdf` files
- PDF COS [syntax highlighting](#syntax-highlighting) 
- PDF content stream operator [syntax highlighting](#syntax-highlighting) 
- [folding](#folding) for PDF objects and multi-line dictionaries
- "[Go To definition](#go-to-functionality)", "Go To declaration", and "Find all references" functionality for PDF objects 
- "[Bracket matching](#bracket-matching)" for special PDF tokens  
- single- and multi-line [comment toggling](#commenting--uncommenting-lines) 
- basic PDF and FDF file validation
- [snippets](#snippets) for new object, new stream, and empty PDF/FDF files

## PDF files are _BINARY_!

Technically all PDF files are **binary files** and should **never** be arbitrarily edited in text-based editors such as VSCode - as this can break them! However, for the purposes of learning PDF or manually writing targeted PDF test files, it is possible to use a text editor if sufficient care is taken and certain features are avoided. The functionality provided by this extension is **NOT** intended for debugging or analysis of real-world PDF files as such files are "far too binary" for text editors such as VSCode. Use a proper PDF forensic inspection utility or a dedicated hex editor!

In particular, VSCode interprets sequences of bytes above 127 as multi-byte UTF-8 sequences which will result in corrupted PDF files as these byte sequences invalid UTF-8 sequences are removed or replaced!

If you see any of these messages in VSCode then your PDF file is unsuitable/incompatible with this extension and _**will get corrupted if saved!**_:

![VSCode binary file error](assets/VSCode-BinaryError.png)

![VSCode invisible Unicode warning](assets/VSCode-InvisibleUnicode.png)

If you see this VSCode error message then you **must** choose "Ignore":

![VSCode mixed end-of-line error message](assets/VSCode-MixedEOLs.png)

## Learning PDF

Although PDF files are technically binary, when first learning PDF or when manually creating targeted test files it is convenient to use  "pure text" PDF files. As a result it is more productive to have a modern development/IDE environment with features such as syntax highlighting, folding, Intellisense, Go To definition, find all references, snippet insertion, etc.

A minimal PDF only requires binary bytes (>127) for the 4-bytes of the binary marker comment in the 2nd line of the file. When chosen carefully, this sequence of bytes can avoid confusion by VSCode, even if the display is not correct. The following 5 byte sequence meets the PDF requirement to have a comment (`%` = 0x25) followed by 4 bytes all above 0x7F (>127) while also being valid 2-byte UTF-8 sequences - as a result VSCode will _**only display 2 characters representing the 4 binary bytes in the PDF!**_:

- In binary (hex values):  `25 C2 A9 C2 A9`
- As shown in VSCode (as UTF-8): `%©©`

If saved from VSCode, this will remain valid and thus is highly recommended for PDF created with VSCode

All other binary data, such as images or Unicode sequences, can be encoded using `ASCIIHexDecode` or `ASCII85Decode` filters, hex strings, literal string escape sequences, name object hex codes, etc. To assist with visualizing  whitespace and any non-printable control bytes, it is **strongly recommended** to enable both "Render whitespace" and "Render Control Characters" via the View \| Appearance... submenu.

A productive learning environment also works best with _conventional_ PDF files with _conventional_ cross reference tables (i.e. those with the `xref` and `trailer` keywords). PDF files with either cross-reference (`/Type /XRef`) streams or object streams (`/Type /ObjStm`) have additional hurdles to understanding PDF.

### Alternatives

The free open-source [VIM editor](https://www.vim.org/) ("Vi IMproved") also supports basic PDF COS syntax highlighting, but lacks many other features this extension provides.

Various GUI-based PDF forensic analysis tools such as [iText RUPS](https://github.com/itext/i7j-rups) and [Apache PDFBox Debugger](https://pdfbox.apache.org/) allow users to make certain classes of changes to PDF files, however the exact syntax (such as whitespace and delimiters) and precise file layout (such as incremental updates and cross reference tables) cannot be edited nor precisely controlled. Such tools also use their own lexical analyzers and parsers and thus provided a different level of support when learning PDF.

# Features

The following VSCode functionality is enabled for files with extensions `.pdf` and `.fdf` (Forms Data Field) as both file formats use the same PDF COS ("_Carousel Object System_") syntax and file structure. 

## Syntax Highlighting
Syntax highlighting of PDF COS syntax and PDF content streams including special handling of _most_ PDF rules for delimiters and whitespace:
- PDF dictionary objects (start `<<` and end `>>`)
- PDF array objects (start `[` and end `]`)
- PDF literal string objects (start `(` and end `)` with `\` escape sequences) 
- PDF hex string objects (start `<` and end `>`)
- PDF name objects (start `/` with `#` hex pairs)
- PDF integer and real number objects (including with leading `+`, `-`, `.` or multiple `0`s)
- PDF comments (start with `%` to end-of-line)
- all case-sensitive PDF keywords (`endobj`, `endstream`, `false`, `null`, `obj` (including associated object ID integers), `R` (including associated object ID integers), `startxref`, `stream`,  `trailer`, `true`, `xref`)
- PDF content stream operators when occuring between `stream` and `endstream` keywords

To inspect the tokens that the TextMate syntax highlighter has recognized, select "Developer: Inspect Editor Tokens and Scopes" from the VSCode Command Palette (`CTRL` + `SHIFT` + `P` or or &#8679; &#8984; `P`) via the View menu. For convenience, assign the command a new shortcut such as `CTRL` + `SHIFT` + `ALT` + `I` or &#8679; &#8984; `I`, for `I` = inspect. 

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
| Conventional cross-reference table (_between `xref` and `trailer` keywords_) | `keyword.section.xref-trailer.pdf`</br> `keyword.control.xref-subsection.pdf`</br> `keyword.control.free-object.pdf`</br> `keyword.control.inuse-object.pdf` |
| | |

### Known issues with [TextMate grammar](./pdf.tmLanguage.json)
- PDF literal string `\)` and `\(` escape sequences are not explicitly identified (all other literal string escape sequences from Table 3 in ISO 32000-2:2020 are supported)
- the PDF content stream text operator `"` is not explicitly supported in `keyword.operator.content-stream.pdf`
- `#` hex codes in literal strings are not highlighted
- the syntax highlighter can get confused between hex strings `<`/`>` and dictionary start tokens `<<`/`>>` (as a dictionary start token can look like a malformed hex string!).
    - one way to overcome this confusion is to put the dictionary close token (`>>`) on a new line 
- binary data will confuse syntax highlighting!

## Folding
Folding is enabled for PDF objects (`X Y obj` and `endobj`) and multi-line PDF dictionary objects (`<<` and `>>`). The dictionary start `<<` needs to be on a line by itself or preceded by a PDF name (e.g. a key name from a containing dictionary for an inline dictionary: ` /Font <<`).

### Windows folding shortcuts
- `CTRL` + `SHIFT` + `[` = fold region
- `CTRL` + `SHIFT` + `]` = unfold region
- `CTRL` + `K`, `CTRL` + `[` = fold all subregions
- `CTRL` + `K`, `CTRL` + `]` = unfold all subregions
- `CTRL` + `K`, `CTRL` + `0` = fold all regions
- `CTRL` + `K`, `CTRL` + `J` = unfold all regions
### Mac folding shortcuts
- &#8984; `[` = fold region
- &#8984; `]` = unfold region
- &#8984; `K`, &#8984; `[` = fold all subregions
- &#8984; `K`, &#8984; `]` = unfold all subregions
- &#8984; `K`, &#8984; `0` = fold all regions
- &#8984; `K`, &#8984; `J` = unfold all regions

## Go To Functionality
VSCode allows easy navigation and examination of definitions, declarations and references. For PDF the following programming language equivalences are used:
- **definition**: a PDF object (`X Y obj`)
- **declaration**: the in-use cross-reference table entry for a PDF object (e.g., `0000003342 00000 n`)
- **reference**: an indirect references (`X Y R`) to a PDF object

Placing the cursor anywhere in the object ID (the object number `X` or generation number `Y`) of an indirect reference (`X Y R`) or on the line of a conventional cross-reference table entry for an in-use object (e.g., `0000003342 00000 n`), and then selecting "Go to definition" will jump the cursor to the associated object (`X Y obj`). 

Placing the cursor anywhere in the object ID (the object number `X` or generation number `Y`) of an object definition (`X Y obj`) or indirect reference (`X Y R`), and then selecting "Find all references" will find all indirect references (`X Y R`) to that object. The references will be listed in the "References" sidebar panel.

**NOT IMPLEMENTED YET** - goto declaration... from `X Y R` or `XY obj` to the xref table in-use entry


### Windows Go To shortcuts
- `F12` = goto definition
- `ALT` + `F12` = peek definition
- `CTRL` + `K`, `F12` = open definition to the side
- `SHIFT` + `F12` = show references
### Mac Go To shortcuts
- `F12` = goto definition
- &#8997; `F12` = peek definition
- &#8984; `K`, `F12` = open definition to the side
- &#8679;  `F12` = show references


## Bracket Matching

**NOT IMPLEMENTED YET** 

Many IDEs for programming languages support bracketing matching, where the cursor can jump to a matching open or close bracket (e.g., `{` with `}` or `(` with `)`). In PDF, the equivalent brackets are:

- PDF dictionary objects (start `<<` and end `>>`)
- PDF array objects (start `[` and end `]`)
- PDF literal string objects (start `(` and end `)`) 
- PDF hex string objects (start `<` and end `>`)
- PDF content stream operator pairs
    - graphics state push and pop (`q` and `Q`)
    - text object (start `BT` and end `ET`)
    - compatibility operators (start `BX` and end `EX`)
    - marked content regions (start `BDC` or `BMC`, and end `EMC`)

### Windows shortcut
- `CTRL` + `SHIFT` + `\` = jump to matching bracket
### Mac shortcut
- &#8679; &#8984; `\` = jump to matching bracket


## Commenting & uncommenting lines 

Commenting and uncommenting one or more lines in a PDF enables features and capabilities to be switched on or off easily. Note that PDF only has line comments (`%`). Highlight one or more lines in a PDF/FDF file and use the "Toggle Line Comment" command.

### Windows shortcut
- `CTRL` + `/` = toggle line comment
### Mac shortcut
- &#8984; `/` = toggle line comment


## Basic PDF/FDF validation

VSCode can perform basic validation on _conventional_ PDF and FDF files (i.e. those **not** using cross-reference table streams). Validation issues are output to the "Problems" window (`CTRL` + `SHIFT` + `M` or &#8679; &#8984; `M`).

Validation checks include:

- checking validity of the PDF header including PDF version number (1st line) `%PDF-x.y` or `%FDF-x.y`
- checking validity of the PDF/FDF binary file comment marker (2nd line)
- checking that the PDF contains the necessary keywords to be a conventional PDF file (i.e. `xref`, `trailer` and `startxref` keywords are all present). 
    - _Note that this may falsely validate a hybrid-reference PDF that should not be used with VSCode!
- checking that there is a conventional cross-reference table that starts with object 0 (as the start of the free list) = **NOT IMPLEMENTED YET**
- checking that there are no comments in conventional cross-reference tables = **NOT IMPLEMENTED YET**
- checking that the last non-blank line of the PDF/FDF starts with `%%EOF`


## [Snippets](https://code.visualstudio.com/docs/editor/userdefinedsnippets)

Snippets are templated fragments of PDF syntax that can be inserted into a PDF at the current cursor location. Snippets are accessed via the Command Palette "Insert Snippet" or via IntelliSence (Windows: `CTRL` + `SPACE`, or Mac: &#8984; `SPACE`)

* `obj` - an empty PDF object. If you prefix with the object number (e.g. `10 obj`) then the snippet will expand nicely for you and add a default generation number of `0`.
* `stream` - an empty PDF stream object.  If you prefix with the object number (e.g. `10 stream`) then the snippet will expand nicely for you  and add a default generation number of `0`.
* `PDF-` - a complete minimal empty PDF file. Do **not** prefix this with `%` as this is a PDF comment marker and VSCode does **not** do snippet expansion inside comments! The snippet will automatically add the `%` for you.
  - The easiest way to use this snippet is to create an empty file with a `.pdf` (or `.fdf`) extension in the Explorer panel. Then open the new file, type `PDF-` on line 1 and select the snippet.
* `FDF-` - a complete minimal empty FDF file. Do **not** prefix this with `%` as this is a PDF comment marker and VSCode does **not** do snippet expansion inside comments! The snippet will automatically add the `%` for you.


---
---

# Creation of largely text-based PDFs

This section describes how real-world heavily binary PDFs that would otherwise be unsuitable for reviewing using VSCode can be converted to a largely text-based equivalents more suited to VSCode. Success is dependent on both the third party tool and the specific features in the PDF file. While the output is mostly equivalent, some features will get lost by the conversion process (such as incremental updates, the exact lexical conventions used in the input PDF, etc.).

## Using [QPDF](https://github.com/qpdf/qpdf) (_OSS_)

```bash
qpdf -qdf file.pdf file-as-qdf.pdf
```

## Using [Apache PDFBox-app](https://pdfbox.apache.org/2.0/commandline.html#writedecodeddoc) (_OSS_)

Note that only PDFBox 2.x appears to have the `WriteDecodedDoc` functionality (_PDFBox 3.0.0 beta1 doesn't_):

```bash
java -jar pdfbox-app-2.0.29.jar WriteDecodedDoc file.pdf output.pdf
```

## Using Adobe Acrobat DC (_commercial tool_):
- open a PDF
- menu: File | Save as Other... | Optimized PDF...
- create a new PDF Optimizer profile and save as "Human readable"
    - "Make compatible with" = retain existing
    - ensure all Image settings have "Downsample" = "Off" and "Compression" = "retain existing"
    - Fonts - ensure "Do not unembed any font" is checked
    - disable Transparency, Discard Objects and Discard User Data tabs
    - Clean Up: make sure "Object compression options" = "Remove compression"

Note that this Adobe Acrobat method will not be as "pure text" as other methods as content streams, etc. have their compression filters retained whereas other methods convert content streams to uncompressed raw data.

## Locating PDFs with specific features

Avoid using `^` start-of-line due to PDFs specific end-of-line rules which can vary and not match the current platform which `grep` will then ignore.

* Number of incremental updates = approximated by number of `%%EOF` or `startxref` lines

```bash
grep --text --count -Po "%%EOF" *.pdf | sed -e "s/\(.*\):\(.*\)/\2\t\1/g" | sort -nr
grep --text --byte-offset -Po "%%EOF" *.pdf
```


* Find the number of objects in each PDF (trailer /Size entry)

```bash
grep --text -Po "/Size [0-9]+" *.pdf
```


* Find all conventional cross-reference table entries (in use = `n`', free = `f`)

```bash
grep --text -Po "[0-9]{10} [0-9]{5} [fn]" *.pdf
grep --text -Po --count "[0-9]{10} [0-9]{5} f" *.pdf | sed -e "s/\(.*\):\(.*\)/\2\t\1/g" | sort -nr
``` 


* Find the xref sub-section marker lines for conventional cross-reference table PDFs. Can then find sparse cross-reference tables in incremental updates. Multi-line so must use `pcregrep -M`. 

```bash
pcregrep -Mo --color=auto --buffer-size=999999 --text "[^t]xref[\r\n][0-9]+ *[0-9]+" *.pdf
```

