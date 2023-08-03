# LSP Example

Heavily documented sample code for https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

## Functionality

This Language Server works for plain text file. It has the following language features:
- Completions
- Diagnostics regenerated on each file change or configuration change

It also includes an End-to-End test.

## Structure

```
.
├── client // Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running the Sample

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a PDF document in 'plain text' language mode.

# VSCode PDF extension

## PDF files are BINARY!

Technically all PDF files are **binary files** and should **never** be arbitrarily edited in text-based editors such as VSCode - as this can break them! However, for the purposes of learning PDF or manually writing targeted PDF test files, it is possible to use a text editor if sufficient care is taken. The functionality provided by this extension is **NOT** intended for debugging or analysis of real-world PDF files as such files are "too binary" for text editors such as VSCode. Use a proper PDF forensic inspection utility or a dedicated hex editor. 

If you see either of these messages in VSCode then your PDF file is unsuitable for editing with this extension and _**will get corrupted if saved!**_:

![VSCode binary file error](assets/VSCode-BinaryError.png)

![VSCode invisible Unicode warning](assets/VSCode-InvisibleUnicode.png)

# Features

The following functionality is enabled for files with extensions `.pdf` and `.fdf` (Forms Data Field) as both file formats use the same PDF COS ("_Carousel Object System_") syntax and file structure.

## Syntax Highlighting
Syntax highlighting of PDF COS syntax and PDF content streams including special handling of PDF rules for delimiters and whitespace:
- PDF dictionary objects (start `<<` and end `>>`)
- PDF array objects (start `[` and end `]`)
- PDF literal string objects (start `(` and end `)` with `\` escape sequences) 
- PDF hex string objects (start `<` and end `>`)
- PDF name objects (start `/` with `#` hex pairs)
- PDF integer and real number objects (including with leading `+`, `-`, `.` or multiple `0`s)
- PDF comments (start with `%` to end-of-line)
- all case-sensitive PDF keywords (`endobj`, `endstream`, `false`, `null`, `obj` including associated object identifier, `R` including associated object identifier, `startxref`, `stream`,  `trailer`, `true`, `xref`)
- PDF content stream operators when occuring between `stream` and `endstream` keywords

## Folding
Folding is enabled for PDF objects (`X Y obj` and `endobj`) and multi-line PDF dictionary objects (`<<` and `>>`).

### Windows folding shortcuts:
- `CTRL` + `SHIFT` + `[` = fold region
- `CTRL` + `SHIFT` + `]` = unfold region
- `CTRL` + `K`, `CTRL` + `[` = fold all subregions
- `CTRL` + `K`, `CTRL` + `]` = unfold all subregions
- `CTRL` + `K`, `CTRL` + `0` = fold all regions
- `CTRL` + `K`, `CTRL` + `J` = unfold all regions
### Mac folding shortcuts:
- &#8984; `[` = fold region
- &#8984; `]` = unfold region
- &#8984; `K`, &#8984; `[` = fold all subregions
- &#8984; `K`, &#8984; `]` = unfold all subregions
- &#8984; `K`, &#8984; `0` = fold all regions
- &#8984; `K`, &#8984; `J` = unfold all regions

## Go To Functionality
VSCode allows easy navigation and examination of definitions, declarations and references. For PDF the following equivalences are used:
- "definition": a PDF object (`X Y obj`)
- "declaration": the cross-reference table entry of a PDF object
- "reference": an indirect references (`X Y R`) to a PDF object

Placing the cursor anywhere in a cross-reference table entry for an in-use object (e.g., `0000003342 00000 n`), and then selecting "Go to definition" will jump the cursor to the associated object (`X Y obj`). Note that the very first entry in the cross-reference table of an original PDF (without incremental updates) is always `0000000000 65535 f` and represents the start of the free list and thus there is no associated object 0. 

Placing the cursor anywhere on an indirect reference (`X Y R`), and then selecting "Go to definition" will jump the cursor to the associated object (`X Y obj`).

Placing the cursor anywhere on an object definition (`X Y obj`), and then selecting "Show references" will find all indirect references (`X Y R`) to that object.


### Windows GoTo shortcuts
- `F12` = goto definition
- `ALT` + `F12` = peek definition
- `CTRL` + `K`, `F12` = open definition to the side
- `SHIFT` + `F12` = show references
### Mac GoTo shortcuts
- `F12` = goto definition
- &#8997; `F12` = peek definition
- &#8984; `K`, `F12` = open definition to the side
- &#8679;  `F12` = show references


# Creation of largely text-based PDFs

Using [QPDF](https://github.com/qpdf/qpdf):
```bash
qpdf -qdf file.pdf file-as-qdf.pdf
```

Using Adobe Acrobat (_commercial tool_):
- open a PDF
- File | Save as Other... | Optimized PDF...
- create a new PDF Optimizer profile and save as "Human readable"
    - "Make compatible with" = retain existing
    - ensure all Image settings have "Downsample" = "Off" and "Compression" = "retain existing"
    - Fonts - ensure "Do not unembed any font" is checked
    - disable Transparency, Discard Objects and Discard User Data tabs
    - Clean Up: make sure "Object compression options" = "Remove compression"

Note that the Adobe Acrobat method will not be as "pure text" as the QPDF method as content streams, etc. have their compression filters retained whereas QPDF will convert all streams to uncompressed raw data.

## Locating PDFs with specific features

Avoid using `^` start-of-line due to PDFs specific end-of-line rules which can vary and not match the current platform.

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
