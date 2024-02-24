# Extension debugging and development environment 

Heavily documented sample code for https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

- https://code.visualstudio.com/api
- https://code.visualstudio.com/api/language-extensions/language-server-extension-guide 
- https://langserver.org/
- https://microsoft.github.io/language-server-protocol/


## Structure

```
.
├── package.json // The extension manifest.
├── node_modules
│   └── ... modules needed by BOTH client and server
├── out 
│   └── ... compiled output for BOTH client and server
├── client // Language Client
│   └── src
│       └── extension.ts // Language Client entry point
|       └── ... other client-side files and folders ...
└── server // Language Server
    └── src
        └── grammar 
            └── ... Ohm.js grammar files ...
        └── server.ts // Language Server entry point
        └── ... other server-side files and folders ...
```

## Running 

- Run `npm install` in this folder. This installs all necessary npm modules 
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a PDF document in 'plain text' language mode.

## Packaging as VSIX
```bash
npm install -g @vscode/vsce
vsce package
vsce publish
```

See also https://code.visualstudio.com/api/working-with-extensions/publishing-extension.

# Development Notes for PDF/FDF

- cannot use "FirstLine" in `package.json` because otherwise new PDFs cannot use the "PDF-" snippets as file type is not recognized and snippets don't work inside comments. Same goes for FDF.

- bytes are always interpreted as UTF-8 by VSCode!! This is a big problem for bytes > 0x7F that form invalid UTF-8 sequences since these get completely eaten up by VSCode and replaced with an alternative UTF-8 symbol using different bytes! 
    - For valid UTF-8 byte sequences, can use a `TextEncoder()` to convert the UTF-8 codepoints (as returned by `Strings.slice()`, etc) back into their original bytes. See the binary marker comment validation code in `server/src/server.ts`. See also the discussion in `README.md`

# Notes on JavaScript/TypeScript regex

Working in VSCode is heavily JS centric, however JS regex special characters are NOT the same as PDF and thus **extreme caution** must be used: 

- JS `\b` (word boundary special char assertion) is **_NOT_** how anything in PDF is defined! According to [this Mozilla JS link](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Word_boundary_assertion) `\b` is anything that is not in `[a-zA-Z0-9_]`. And we definitely do NOT want to enable Unicode because of how VSCode treats binary data in PDFs.  
    - Note that it is OK to use `\b` between `xref` and `trailer` keywords in conventional cross-reference tables, such as when parsing the cross-reference table entries or sub-section marker lines, because this section of PDFs has **_very_** strict rules (`[0-9fn \r\n]`) - but nowhere else is suitable!
- JS `\s` (whitespace special char assertion) is also not the same as PDF whitespace, as it includes far more whitespace than PDF allows - see [this Mozilla JS link](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Assertions). 
    - PDF needs just the 6 characters in Table 1: `[\0\t\n\f\n ]` but if demarcating a "next token" then the set needs to be extended by the 8 PDF delimiters `[\(\)<>\[\]\/%]` (and if it is in a Type 4 PostScript function the `[\{\}]` also needs to be added).

- `xref` is a substring in `startxref` - this can be addressed be avoided the letter `t` before `xref` as in `(?:[^t])xref`, or looking for PDF whitespace before `xref` as in `(?:\0|\t|\n|\f|\n| )xref`. Depending on use-case, non-capturing of the preceding character may also be desirable as shown here with `(?:`...`)`

- due to PDFs with binary data, various "end" symbols can be missed since VSCode sees some of the bytes as part of a UTF-8 multi-byte sequence and thus misses the end symbol. For this reason, some dictionary and object ending sequences also include `endobj` (and possibly other keywords or symbols) in an attempt to isolate the confusion within a single PDF object. Non-capturing of these backups may also be helpful...

# Node modules

All Node module are in the root folder `./node_modules`. This ensures that client and server are both using identical modules and keeps VSIX package size as small as possible. 

There should be no `./client/node_modules` or `./server/node_modules`!  

# Packaging

Most NPM modules are development-time-only packages and sharing modules between client and server helps keep the VSIX package size down significantly. 


```
$ npm list
pdf-cos-syntax@0.1.6 C:\Temp\share\pdf-cos-syntax
+-- @ohm-js/cli@2.0.0
+-- @types/mocha@10.0.6
+-- @types/node@20.11.20
+-- @types/vscode@1.86.0
+-- @vscode/test-electron@2.3.9
+-- @typescript-eslint/eslint-plugin@7.0.2
+-- @typescript-eslint/parser@7.0.2
+-- @vscode/test-electron@2.3.9
+-- ascii85@1.0.2
+-- copyfiles@2.4.1
+-- eslint@8.57.0
+-- install@0.13.0
+-- mocha@10.3.0
+-- npm@10.4.0
+-- ohm-js@17.1.0
+-- sharp@0.33.2
+-- typescript@5.3.3
+-- vscode-languageclient@9.0.1
+-- vscode-languageserver-textdocument@1.0.11
`-- vscode-languageserver@9.0.1

$ npm list --omit=dev
pdf-cos-syntax@0.1.6 C:\Temp\share\pdf-cos-syntax
+-- ascii85@1.0.2
+-- ohm-js@17.1.0
+-- sharp@0.33.2
+-- vscode-languageclient@9.0.1
+-- vscode-languageserver-textdocument@1.0.11
`-- vscode-languageserver@9.0.1
```

## Ohm grammars

The [Ohm.js](https://ohmjs.org/) files (`*.ohm`) need to be physically included in the VSIX. This is accomplished via `package.josn` using the [copyfiles](https://www.npmjs.com/package/copyfiles) NPM module (as a devDependency only!):

```json
"compile": "tsc -b && npx copyfiles -V \"./server/src/grammar/*.ohm\" ./out"
```


## Supporting Sharp across multiple platforms

[Sharp](https://www.npmjs.com/package/sharp) is used to read image files such as JPEG, PNG, PPM, etc. and depends it on `libvips` which is a platform-dependent DLLs, dylibs, etc. To ensure the packaged VSIX is cross-platform, all supported platforms need to be installed locally - see https://sharp.pixelplumbing.com/install: 

```
npm install --os=win32 --cpu=x64 sharp
npm install --os=darwin --cpu=arm64 sharp
npm install --os=darwin --cpu=x64 sharp
npm install --os=linux --cpu=arm64 sharp
npm install --os=linux --cpu=x64 sharp
```

This makes the VSIX package much bigger as it is multi-platform including `libvips` runtimes!
