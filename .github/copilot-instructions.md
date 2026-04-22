# Copilot Instructions for PDF COS Syntax Extension

This is a VS Code extension built with TypeScript that provides comprehensive support for PDF COS (Carousel Object System) syntax highlighting, editing, and analysis. The extension is for learning PDF as a page description language. It relies on Language Server Protocol (LSP) for syntax analysis.

## Project Structure

- **Client-side** (`client/src/`): VS Code extension UI, commands, webviews
- **Server-side** (`server/src/`): Language server with parsing, semantic tokens, hover information
- **Grammar** (`server/src/grammar/`): Ohm.js parser definitions for PDF syntax
- **Syntaxes** (`syntaxes/`): TextMate grammars for VS Code syntax highlighting
- **Snippets** (`snippets/`): Code snippets for PDF/FDF files

## Development Workflow

### Build Commands

- `npm run generate` - Generate Ohm parser code from Ohm grammar files
- `npm run compile` - Build TypeScript and copy Ohm parser files to output location
- `npm run watch` - Watch mode for interactive development
- `npm run lint` - Run ESLint on client and server code
- `vsce package` - Create a binary VSIX package that can be uploaded to the Microsoft VSCode marketplace.

### Key Conventions

**TypeScript Configuration:**

- Strict mode enabled with `strictNullChecks`, `exactOptionalPropertyTypes`
- Target ES2020, Node16 modules
- Separate compilation for client and server with composite project

**ESLint Rules:**

- TypeScript recommended rules with type checking
- Unused variables ignored if prefixed with `_`
- Ohm.js CLI automatically generated parsers code files are excluded from linting

**Architecture:**

- Language Server Protocol (LSP) for syntax analysis
- Semantic tokens for PDF object highlighting
- Custom commands accessible via Command Palette
- Webview for Sankey diagram visualization

### PDF-Specific Knowledge

**File Types:**

- `.pdf` - Portable Document Format files
- `.fdf` - Forms Data Format files
- Both use identical COS syntax

**Cross-Reference Sections:**

- Extension focuses on conventional `xref` tables (not cross-reference streams)
- Supports incremental updates with multiple trailers to visualize document revisions
- PDF object indirect references use `X Y R` syntax where X and Y are integers

**Content Streams:**

- Graphics operators between `stream`/`endstream`
- Support for PostScript-style operators
- Folding and highlighting for operator pairs

### Common Pitfalls

- When editing a PDF file, edits can temporarily cause syntax errors
- PDF files are arbitrary binary by definition but VSCode assumes the binary data is UTF-8 sequences which is wrong. This results in incorrect file offsets and byte counting from  the VSCode TypeScript code
- Cross-reference offsets must be real byte positions, not the UTF-8 byte offsets that VSCode wants
- Object streams and cross-reference streams not fully supported
- NPM does not include multi-platform libraries for sharp

### Testing

- Done manually. Do not automate or attempt to use an agent.

## Links to Documentation

- [README.md](../README.md) - Feature overview and usage guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines and IPR policy
- [Testing.md](../Testing.md) - Testing strategy and corpora
- [Debugging.md](../Debugging.md) - Development and debugging setup
- [Changelog.md](../Changelog.md) - Version history and changes
