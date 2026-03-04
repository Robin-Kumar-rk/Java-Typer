# JavaTyper

🚀 **[Play JavaTyper Live Here!](https://robin-kumar-rk.github.io/Java-Typer/)**

JavaTyper is a fast, responsive, strictly-enforced typing test web application specifically designed to help users master Java syntax, build muscle memory, and improve typing speed.

Unlike traditional typing tests that just use English vocabulary, JavaTyper builds randomized algorithms of Java keywords, class instantiations, generic typings, and method-chaining syntax drawn straight from common Java architectures.

## Features

- **Standard Syntax Practice**: Generates a continuous stream of classes and core keywords.
- **Method Practice**: Spawns fully qualified class method signatures, forcing you to practice typing periods, camelCase, parentheses, and semicolons rapidly.
- **Constructor Practice**: Generates random constructor calls (grouped by package/class data), one constructor per line (e.g., `new String(char[] arr);`).
- **Intelligent Bracket Auto-Completion**: Typing the leading `<` for generics or `[` for arrays immediately auto-completes the trailing bracket. The user can skip out of the auto-completed brackets with correct keystrokes, mimicking IDE behavior.
- **Strict Error Handling**: Typos must be corrected! The application will violently refuse to let you pass over wrong characters—physically shaking the letter and emitting an audio warning tone.
- **Dynamic Configuration**: 
  - Choose any test duration.
  - Select exactly which core Java Packages (e.g. `java.long`, `java.util`) to include in your practice pool.
  - Expand your pool with Advanced Packages like `java.io`, `java.net`, and `java.nio.file`.
- **Beautiful Aesthetics**: Styled with a dark glassmorphic design and LeetCode-inspired syntax coloring.

## Project Structure

This is a completely client-side, vanilla web application.

- `index.html`: The core UI markup and structure.
- `style.css`: The styling engine, containing all CSS grid/flex layouts, glassmorphism filters, animations, and LeetCode theme color tokens.
- `main.js`: The application logic. Handles DOM manipulation, the strict keystroke validator, the bracket auto-complete engine, Web Audio API synthesize, and algorithm generation.
- `dictionary.json`: The core data source housing base Java keywords, `java.lang`, and `java.util`.
- `packages.json`: The secondary data source housing advanced class packages.

## Running Locally

Because the application uses the `fetch` API to dynamically load its dictionaries over HTTP, directly opening the `index.html` file in Chrome via the `file://` protocol will result in CORS/security blocks.

To run the application, you must serve it over a local HTTP server.

**Option 1: Using Node.js (Recommended)**
1. Ensure Node is installed.
2. Navigate to the project directory in your terminal.
3. Run `npx serve`
4. Open your browser to `http://localhost:3000`

**Option 2: Using VS Code**
1. Install the "Live Preview" or "Live Server" extension in VS Code.
2. Right-click `index.html` and select "Show Preview" or "Open with Live Server".

## Deployment
This project is built using 100% static files and requires zero backend compilation. It is currently hosted and automatically deployed via **GitHub Pages**.
