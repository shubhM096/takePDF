# Contributing to SnapCapture

First off, thank you for considering contributing to SnapCapture! It's people like you that make this extension such a great tool.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/takePDF.git
   cd takePDF
   ```

2. **Install dependencies (for testing):**
   ```bash
   npm install
   ```

3. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner.
   - Click "Load unpacked" and select the `takePDF/` directory.

## Code Style Guidelines

- **Vanilla JS Only:** No TypeScript, no build tools, no frameworks. Pure ES2020+ JavaScript.
- **JSDoc Comments:** Document everything. Every file and major function must have comprehensive JSDoc comments explaining what it does, why it exists, alternatives considered, and references.
- **Architecture:** Follow the established module pattern. Use ES module syntax (`export`/`import`) for service worker modules. Use IIFE or global registration for content scripts.

## Running Tests

Test-Driven Development (TDD) is mandatory. For EVERY module, write tests FIRST, then implement until tests pass.

To run the test suite:
```bash
npm test
```

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Write tests for your changes.
3. Make sure all tests pass.
4. Ensure your code follows the style guidelines.
5. Issue a pull request with a comprehensive description of the changes.

## Issue Reporting Guidelines

Please use the provided issue templates when reporting bugs or requesting features.
