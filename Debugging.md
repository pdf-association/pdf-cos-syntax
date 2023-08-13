# Extension debugging and development environment 

Heavily documented sample code for https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

- https://code.visualstudio.com/api
- https://code.visualstudio.com/api/language-extensions/language-server-extension-guide 
- https://langserver.org/
- https://microsoft.github.io/language-server-protocol/


## Functionality

This Language Server works for PDFs that are plain text. It has the following language features:
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

## Running 

- Run `npm install` in this folder. This installs all necessary npm modules in both the client and server folder
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
```

See also https://code.visualstudio.com/api/working-with-extensions/publishing-extension.

# Development Notes for PDF/FDF

- cannot use "FirstLine" in `package.json` because otherwise new PDFs cannot use the "PDF-" snippets as file type is not recognized and snippets don't work inside comments. Same goes for FDF.

- bytes are always interpreted as UTF-8 by VSCode!! This is a big problem for bytes > 0x7F that form invalid UTF-8 sequences since these get completely eaten up by VSCode and replaced with an alternative UTF-8 symbol using different bytes! 
    - For valid UTF-8 byte sequences, can use a `TextEncoder()` to convert the UTF-8 codepoints (as returned by `Strings.slice()`, etc) back into their original bytes. See the binary marker comment validation code in `server/src/server.ts`. See also the discussion in `README.md`
