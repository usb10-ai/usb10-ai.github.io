# Office Editor

A browser-based editor for **Word (.docx)** and **PowerPoint (.pptx)** files.
Open `index.html` (or `/office/` on the GitHub Pages site). Files are processed
entirely in the browser — nothing is uploaded anywhere, and it works offline
(all libraries are vendored in `vendor/`).

## Word (.docx)
- Open, edit, and save `.docx`; create new documents
- Headings, fonts, sizes, bold/italic/underline/strike, sub/superscript, text colour, highlight
- Alignment, bulleted/numbered lists (with nesting), indent
- Tables (insert, add/delete rows & columns, Tab to move between cells), pictures (insert, paste, drag corner to resize), links, page breaks
- Find & replace (Ctrl+H), word count, print / save as PDF

## PowerPoint (.pptx)
- Open, edit, and save `.pptx`; create new presentations
- Slides render from the file's own masters, layouts and theme (placeholders, bullets, fills, pictures, tables, groups)
- Edit text in place; font size, bold/italic/underline, colour, alignment
- Insert text boxes, rectangles, ellipses, pictures; drag to move, handles to resize, arrow keys to nudge, Ctrl+D to duplicate, Delete to remove, bring to front / send to back, shape fill, slide background
- New slide from any layout, duplicate, delete, reorder (buttons or drag thumbnails)
- Speaker notes, undo/redo, full-screen slideshow (F5, arrow keys, Esc)
- Editing is done on the original XML, so content the editor doesn't understand (charts, SmartArt, animations, transitions) is preserved on save

## Shortcuts
Ctrl+O open · Ctrl+S save · Ctrl+Z / Ctrl+Y undo/redo · F5 present

## Limitations
- Legacy binary `.doc` / `.ppt` files are not supported (save them as .docx/.pptx first).
- Word files are converted to HTML for editing, so advanced layout (headers/footers, columns, text boxes, tracked changes, comments) is not kept when saving.
- Charts and SmartArt in slides are shown as placeholders and kept unchanged; they can be moved/resized but not edited.

## Files
- `index.html`, `app.css` – UI
- `word.js` – .docx reader (DOCX → HTML) and writer (HTML → DOCX via `docx`)
- `ppt.js` – .pptx package model, slide renderer and text serializer
- `main.js`, `common.js` – app shell and helpers
- `blank.pptx` – template for new presentations
- `vendor/` – JSZip 3.10.1, mammoth 1.8.0 (fallback reader), docx 8.5.0
