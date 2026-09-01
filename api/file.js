// ============================================================
// SMATER CHAT AI
// Professional File & PDF Generator
// api/file.js — PART 1/3
// ============================================================

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // ----------------------------------------------------------
  // CORS / OPTIONS
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  // ----------------------------------------------------------
  // METHOD CHECK
  // ----------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    // --------------------------------------------------------
    // REQUEST DATA
    // --------------------------------------------------------

    const body = req.body || {};

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const type =
      typeof body.type === "string"
        ? body.type.toLowerCase().trim()
        : "pdf";

    const language =
      typeof body.language === "string"
        ? body.language.trim()
        : "auto";

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Please provide a document prompt."
      });
    }

    // --------------------------------------------------------
    // ALLOWED FILE TYPES
    // --------------------------------------------------------

    const allowedTypes = [
      "pdf",
      "txt",
      "html"
    ];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported file type."
      });
    }

    // --------------------------------------------------------
    // OPENROUTER KEY
    // --------------------------------------------------------

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENROUTER_API_KEY is not configured."
      });
    }

    // --------------------------------------------------------
    // COLOUR MODE
    // --------------------------------------------------------
    // Normal PDF = clean black/white.
    // Colour is enabled ONLY when explicitly requested.

    const colourful =
      /\b(colou?rful|colou?r\s*full)\b/i.test(prompt);

    // --------------------------------------------------------
    // UNICODE FONT
    // --------------------------------------------------------
    // Supports Hindi/Devanagari and other Unicode text.
    //
    // The exact package path is resolved dynamically so that
    // the project can use the installed Unicode font package.

    let unicodeFont = null;

    const possibleFonts = [
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"
    ];

    for (const fontPath of possibleFonts) {
      const absolutePath =
        path.join(process.cwd(), fontPath);

      if (fs.existsSync(absolutePath)) {
        unicodeFont = absolutePath;
        break;
      }
    }

    // --------------------------------------------------------
    // DOCUMENT GENERATION PROMPT
    // --------------------------------------------------------

    const systemPrompt = `
You are the professional document-generation engine
inside SMATER CHAT AI.

Create a polished, accurate and well-structured document
from the user's request.

GENERAL RULES:

1. Understand Hindi, English and Hinglish.
2. Follow the language requested by the user.
3. Do not invent unnecessary facts.
4. Keep information organized and readable.
5. Use proper headings.
6. Use bullets where useful.
7. Use numbered lists where useful.
8. Use tables when the information benefits from a table.
9. Tables MUST use proper Markdown table syntax.

Example:

| Name | Amount | Status |
|---|---:|---|
| Example | ₹1000 | Complete |

10. NEVER create decorative separators such as:

---
***
___
* * * * *

11. NEVER add:
Prepared by: SMATER CHAT AI

The application will add that automatically.

12. Do not put the document inside a code block.
13. Do not add unnecessary explanations before or after
the document.
14. Do not add unnecessary emojis.
15. Avoid corrupted or strange control characters.
16. Use normal punctuation.
17. Keep paragraphs reasonably short.
18. If the user requests a report/project, make it professional.
19. If the user requests notes, make them structured and easy
to read.
20. If the user requests a chat/conversation document, clearly
separate User and SMATER CHAT AI.
21. Preserve important details from the user's request.
22. Do not repeat the title unnecessarily.
23. Do not repeat sections.
24. Do not add fake references or sources.
25. Do not include Markdown code fences.

SMATER CHAT AI was founded/built by Damini Singh Bhadauria.
Mention this ONLY if it is relevant to the user's request.

Return ONLY the document content.

Requested language:
${language}

Colourful formatting requested:
${colourful ? "YES" : "NO"}
`;

    // --------------------------------------------------------
    // OPENROUTER REQUEST
    // --------------------------------------------------------

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            "https://smater-chat-ai.vercel.app/",
          "X-Title":
            "SMATER CHAT AI"
        },

        body: JSON.stringify({
          model: "openrouter/free",

          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.3
        })
      }
    );

    // --------------------------------------------------------
    // OPENROUTER ERROR
    // --------------------------------------------------------

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "OpenRouter file generation error:",
        response.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        error:
          "The AI could not generate the document."
      });
    }

    // --------------------------------------------------------
    // READ AI RESPONSE
    // --------------------------------------------------------

    const data =
      await response.json();

    const generatedText =
      data?.choices?.[0]?.message?.content;

    if (
      typeof generatedText !== "string" ||
      !generatedText.trim()
    ) {
      return res.status(502).json({
        success: false,
        error:
          "The AI returned an empty document."
      });
    }

    // --------------------------------------------------------
    // CLEAN DOCUMENT
    // --------------------------------------------------------

    function cleanDocumentText(text) {
      let value = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

      // Remove Markdown code fences
      value = value
        .replace(/^```(?:markdown|md|text|html)?\s*/i, "")
        .replace(/\s*```$/i, "");

      const lines =
        value.split("\n");

      const cleaned = [];

      for (let line of lines) {
        const trimmed =
          line.trim();

        // Remove duplicate application footer
        if (
          /^prepared\s+by\s*:\s*smater\s+chat\s+ai\s*$/i.test(
            trimmed
          )
        ) {
          continue;
        }

        // Remove decorative separator lines
        if (
          /^[-_*=\s]{3,}$/.test(trimmed) ||
          /^(\*\s*){3,}$/.test(trimmed)
        ) {
          continue;
        }

        // Remove invisible control characters,
        // while preserving normal Unicode.
        line = line.replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
          ""
        );

        // Clean bold/italic Markdown markers
        line = line.replace(
          /\*\*(.*?)\*\*/g,
          "$1"
        );

        line = line.replace(
          /__(.*?)__/g,
          "$1"
        );

        cleaned.push(line);
      }

      return cleaned
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    const documentText =
      cleanDocumentText(generatedText);

    if (!documentText) {
      return res.status(502).json({
        success: false,
        error:
          "The generated document was empty after cleanup."
      });
    }

    // --------------------------------------------------------
    // PART 2 WILL CONTINUE HERE
    // --------------------------------------------------------
      // ============================================================
    // PART 2/3 — FILE BUILDERS + PDF CONTENT PARSER
    // ============================================================

    // ------------------------------------------------------------
    // TXT FILE
    // ------------------------------------------------------------

    if (type === "txt") {
      const txtContent =
        documentText +
        "\n\nPrepared by: SMATER CHAT AI\n";

      const txtUrl =
        "data:text/plain;charset=utf-8," +
        encodeURIComponent(txtContent);

      return res.status(200).json({
        success: true,
        type: "txt",
        filename:
          "smater-chat-ai-document.txt",
        url: txtUrl
      });
    }

    // ------------------------------------------------------------
    // HTML FILE
    // ------------------------------------------------------------

    if (type === "html") {
      const escaped =
        documentText
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>SMATER CHAT AI Document</title>

<style>

  body {
    font-family:
      Arial,
      "Noto Sans",
      sans-serif;

    line-height: 1.7;

    max-width: 900px;

    margin: 40px auto;

    padding:
      0 24px;

    font-size: 16px;

    color: #111;
  }

  h1 {
    font-size: 32px;
    margin-bottom: 24px;
  }

  h2 {
    font-size: 24px;
    margin-top: 30px;
  }

  h3 {
    font-size: 20px;
    margin-top: 24px;
  }

  pre {
    white-space: pre-wrap;
    word-wrap: break-word;

    font-family:
      Arial,
      "Noto Sans",
      sans-serif;

    font-size: 16px;
    line-height: 1.7;
  }

  .footer {
    margin-top: 50px;
    padding-top: 12px;

    border-top:
      1px solid #999;

    font-size: 13px;
  }

</style>
</head>

<body>

<pre>${escaped}</pre>

<div class="footer">
Prepared by: SMATER CHAT AI
</div>

</body>
</html>`;

      const htmlUrl =
        "data:text/html;charset=utf-8," +
        encodeURIComponent(
          htmlContent
        );

      return res.status(200).json({
        success: true,
        type: "html",
        filename:
          "smater-chat-ai-document.html",
        url: htmlUrl
      });
    }

    // ------------------------------------------------------------
    // PDF HELPERS
    // ------------------------------------------------------------

    function cleanPdfLine(text) {
      return String(text || "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\t/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function isTableSeparator(line) {
      const value =
        String(line || "").trim();

      if (!value.includes("|")) {
        return false;
      }

      const cells =
        value
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|");

      if (cells.length < 2) {
        return false;
      }

      return cells.every(cell =>
        /^:?-{2,}:?$/.test(
          cell.trim()
        )
      );
    }

    function parseDocument(text) {
      const lines =
        String(text || "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .split("\n");

      const blocks = [];

      let previousWasSpace = false;

      for (let rawLine of lines) {
        let line =
          rawLine.trim();

        // --------------------------------------------------------
        // EMPTY LINE
        // --------------------------------------------------------

        if (!line) {
          if (!previousWasSpace) {
            blocks.push({
              type: "space"
            });

            previousWasSpace = true;
          }

          continue;
        }

        previousWasSpace = false;

        // --------------------------------------------------------
        // REMOVE DECORATIVE SEPARATORS
        // --------------------------------------------------------

        if (
          /^[-_*=\s]{3,}$/.test(line) ||
          /^(\*\s*){3,}$/.test(line)
        ) {
          continue;
        }

        // --------------------------------------------------------
        // REMOVE GENERATED FOOTER
        // --------------------------------------------------------

        if (
          /^prepared\s+by\s*:\s*smater\s+chat\s+ai/i.test(
            line
          )
        ) {
          continue;
        }

        // --------------------------------------------------------
        // TABLE SEPARATOR
        // --------------------------------------------------------

        if (
          isTableSeparator(line)
        ) {
          continue;
        }

        // --------------------------------------------------------
        // H1
        // --------------------------------------------------------

        if (
          /^#\s+/.test(line)
        ) {
          blocks.push({
            type: "h1",
            text: cleanPdfLine(
              line.replace(
                /^#\s+/,
                ""
              )
            )
          });

          continue;
        }

        // --------------------------------------------------------
        // H2
        // --------------------------------------------------------

        if (
          /^##\s+/.test(line)
        ) {
          blocks.push({
            type: "h2",
            text: cleanPdfLine(
              line.replace(
                /^##\s+/,
                ""
              )
            )
          });

          continue;
        }

        // --------------------------------------------------------
        // H3
        // --------------------------------------------------------

        if (
          /^###\s+/.test(line)
        ) {
          blocks.push({
            type: "h3",
            text: cleanPdfLine(
              line.replace(
                /^###\s+/,
                ""
              )
            )
          });

          continue;
        }

        // --------------------------------------------------------
        // CHAT FORMAT
        // --------------------------------------------------------

        const chatMatch =
          line.match(
            /^(User|AI|Assistant|SMATER CHAT AI)\s*:\s*(.*)$/i
          );

        if (chatMatch) {
          blocks.push({
            type: "chat",
            label:
              chatMatch[1],
            text:
              cleanPdfLine(
                chatMatch[2]
              )
          });

          continue;
        }

        // --------------------------------------------------------
        // BULLET
        // --------------------------------------------------------

        if (
          /^[-*•]\s+/.test(line)
        ) {
          blocks.push({
            type: "bullet",
            text: cleanPdfLine(
              line.replace(
                /^[-*•]\s+/,
                ""
              )
            )
          });

          continue;
        }

        // --------------------------------------------------------
        // NUMBERED LIST
        // --------------------------------------------------------

        const numberMatch =
          line.match(
            /^(\d+)[.)]\s+(.*)$/
          );

        if (numberMatch) {
          blocks.push({
            type: "number",
            number:
              numberMatch[1],
            text:
              cleanPdfLine(
                numberMatch[2]
              )
          });

          continue;
        }

        // --------------------------------------------------------
        // MARKDOWN TABLE
        // --------------------------------------------------------

        if (
          line.includes("|")
        ) {
          const cells =
            line
              .replace(/^\|/, "")
              .replace(/\|$/, "")
              .split("|")
              .map(cell =>
                cleanPdfLine(cell)
              )
              .filter(
                cell => cell.length > 0
              );

          if (cells.length >= 2) {
            blocks.push({
              type: "table",
              cells
            });

            continue;
          }
        }

        // --------------------------------------------------------
        // NORMAL PARAGRAPH
        // --------------------------------------------------------

        blocks.push({
          type: "paragraph",
          text: cleanPdfLine(line)
        });
      }

      return blocks;
    }

    // ------------------------------------------------------------
    // PDF TEXT WRAPPER
    // ------------------------------------------------------------

    function wrapText(
      text,
      maxLength
    ) {
      const words =
        String(text || "")
          .split(/\s+/)
          .filter(Boolean);

      const result = [];

      let current = "";

      for (const word of words) {
        const test =
          current
            ? `${current} ${word}`
            : word;

        if (
          test.length <= maxLength
        ) {
          current = test;
        } else {
          if (current) {
            result.push(
              current
            );
          }

          current = word;
        }
      }

      if (current) {
        result.push(
          current
        );
      }

      return result.length
        ? result
        : [""];
    }

    // ------------------------------------------------------------
    // PDF STRING ESCAPE
    // ------------------------------------------------------------

    function escapePdfText(text) {
      return String(text || "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
    }

    // ------------------------------------------------------------
    // SIMPLE PDF TEXT COMMAND
    // ------------------------------------------------------------

    function pdfText(
      font,
      size,
      x,
      y,
      text
    ) {
      return [
        "BT",
        `/${font} ${size} Tf`,
        `${x} ${y} Td`,
        `(${escapePdfText(text)}) Tj`,
        "ET"
      ].join("\n");
    }

    // ------------------------------------------------------------
    // PDF WILL BE BUILT IN PART 3
    // ------------------------------------------------------------
      // ============================================================
    // PART 3/3 — PDF RENDERER + UNICODE + TABLES + FOOTER
    // ============================================================

    function buildPdf(text, colourful) {
      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({
            size: "A4",
            margin: 50,
            bufferPages: true,
            autoFirstPage: true
          });

          const chunks = [];

          doc.on("data", chunk => {
            chunks.push(chunk);
          });

          doc.on("end", () => {
            const buffer =
              Buffer.concat(chunks);

            resolve({
              base64:
                buffer.toString("base64"),
              pages:
                doc.bufferedPageRange().count
            });
          });

          doc.on("error", reject);

          // ------------------------------------------------------
          // FONT SETUP
          // ------------------------------------------------------

          let regularFont = "Helvetica";
          let boldFont = "Helvetica-Bold";

          if (unicodeFont) {
            regularFont = unicodeFont;

            const boldCandidate =
              path.join(
                process.cwd(),
                "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"
              );

            if (
              fs.existsSync(
                boldCandidate
              )
            ) {
              boldFont =
                boldCandidate;
            } else {
              boldFont =
                unicodeFont;
            }
          }

          // ------------------------------------------------------
          // DOCUMENT SETTINGS
          // ------------------------------------------------------

          const blocks =
            parseDocument(text);

          const pageWidth =
            doc.page.width;

          const left =
            doc.page.margins.left;

          const right =
            doc.page.margins.right;

          const usableWidth =
            pageWidth -
            left -
            right;

          // ------------------------------------------------------
          // COLOUR SETTINGS
          // ------------------------------------------------------

          // Default is professional black/white.
          // Colour is used only when explicitly requested.

          const titleColor =
            colourful
              ? "#2457D6"
              : "#111111";

          const headingColor =
            colourful
              ? "#174EA6"
              : "#111111";

          const bodyColor =
            "#111111";

          const tableHeaderColor =
            colourful
              ? "#E8F0FF"
              : "#F0F0F0";

          // ------------------------------------------------------
          // BASIC HELPERS
          // ------------------------------------------------------

          function setFont(
            font,
            size
          ) {
            doc
              .font(font)
              .fontSize(size);
          }

          function pageBottom() {
            return (
              doc.page.height -
              doc.page.margins.bottom
            );
          }

          function ensureSpace(
            needed
          ) {
            if (
              doc.y + needed >
              pageBottom()
            ) {
              doc.addPage();
            }
          }

          function cleanForPdf(
            value
          ) {
            return String(
              value || ""
            )
              .replace(
                /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
                ""
              )
              .trim();
          }

          // ------------------------------------------------------
          // TITLE
          // ------------------------------------------------------

          function drawTitle(text) {
            ensureSpace(70);

            setFont(
              boldFont,
              24
            );

            doc
              .fillColor(titleColor)
              .text(
                cleanForPdf(text),
                {
                  width:
                    usableWidth,
                  align:
                    "left",
                  lineGap: 5
                }
              );

            doc.moveDown(0.7);

            // Small underline
            doc
              .strokeColor(
                colourful
                  ? "#2457D6"
                  : "#777777"
              )
              .lineWidth(1)
              .moveTo(
                left,
                doc.y
              )
              .lineTo(
                pageWidth - right,
                doc.y
              )
              .stroke();

            doc.moveDown(0.8);

            doc.fillColor(
              bodyColor
            );
          }

          // ------------------------------------------------------
          // HEADING
          // ------------------------------------------------------

          function drawHeading(
            text,
            size
          ) {
            ensureSpace(50);

            setFont(
              boldFont,
              size
            );

            doc
              .fillColor(
                size >= 18
                  ? headingColor
                  : "#222222"
              )
              .text(
                cleanForPdf(text),
                {
                  width:
                    usableWidth,
                  lineGap: 3
                }
              );

            doc.moveDown(
              size >= 18
                ? 0.5
                : 0.35
            );

            doc.fillColor(
              bodyColor
            );
          }

          // ------------------------------------------------------
          // PARAGRAPH
          // ------------------------------------------------------

          function drawParagraph(
            text
          ) {
            const value =
              cleanForPdf(text);

            if (!value) return;

            ensureSpace(35);

            setFont(
              regularFont,
              13.5
            );

            doc
              .fillColor(
                bodyColor
              )
              .text(
                value,
                {
                  width:
                    usableWidth,
                  align:
                    "left",
                  lineGap: 4,
                  paragraphGap: 7,
                  continued: false
                }
              );

            doc.moveDown(0.25);
          }

          // ------------------------------------------------------
          // BULLET
          // ------------------------------------------------------

          function drawBullet(
            text
          ) {
            ensureSpace(32);

            setFont(
              regularFont,
              13.5
            );

            const bullet =
              "•";

            doc
              .fillColor(
                bodyColor
              )
              .text(
                bullet,
                {
                  width: 18,
                  continued: true
                }
              );

            doc
              .text(
                cleanForPdf(text),
                {
                  width:
                    usableWidth - 18,
                  lineGap: 4
                }
              );

            doc.moveDown(0.2);
          }

          // ------------------------------------------------------
          // NUMBERED LIST
          // ------------------------------------------------------

          function drawNumber(
            number,
            text
          ) {
            ensureSpace(32);

            setFont(
              regularFont,
              13.5
            );

            const prefix =
              `${number}.`;

            doc
              .fillColor(
                bodyColor
              )
              .text(
                prefix,
                {
                  width: 28,
                  continued: true
                }
              );

            doc.text(
              cleanForPdf(text),
              {
                width:
                  usableWidth - 28,
                lineGap: 4
              }
            );

            doc.moveDown(0.2);
          }

          // ------------------------------------------------------
          // CHAT BLOCK
          // ------------------------------------------------------

          function drawChat(
            label,
            text
          ) {
            ensureSpace(55);

            setFont(
              boldFont,
              14
            );

            doc
              .fillColor(
                headingColor
              )
              .text(
                cleanForPdf(label),
                {
                  width:
                    usableWidth
                }
              );

            doc.moveDown(0.15);

            setFont(
              regularFont,
              13.5
            );

            doc
              .fillColor(
                bodyColor
              )
              .text(
                cleanForPdf(text),
                {
                  width:
                    usableWidth - 15,
                  indent: 15,
                  lineGap: 4
                }
              );

            doc.moveDown(0.35);
          }

          // ------------------------------------------------------
          // TABLE
          // ------------------------------------------------------

          function drawTable(
            tableRows
          ) {
            if (
              !tableRows ||
              !tableRows.length
            ) {
              return;
            }

            const rows =
              tableRows.filter(
                row =>
                  row &&
                  row.length
              );

            if (!rows.length) {
              return;
            }

            const columnCount =
              Math.max(
                ...rows.map(
                  row =>
                    row.length
                )
              );

            if (
              columnCount < 2
            ) {
              rows.forEach(row => {
                drawParagraph(
                  row.join("    ")
                );
              });

              return;
            }

            const colWidth =
              usableWidth /
              columnCount;

            const cellPadding = 6;
            const fontSize = 10.5;

            function drawRow(
              cells,
              header
            ) {
              const values =
                Array.from(
                  {
                    length:
                      columnCount
                  },
                  (_, index) =>
                    cleanForPdf(
                      cells[index] ||
                      ""
                    )
                );

              const heights =
                values.map(value => {
                  const lines =
                    Math.max(
                      1,
                      Math.ceil(
                        value.length /
                        Math.max(
                          8,
                          Math.floor(
                            colWidth /
                            5.5
                          )
                        )
                      )
                    );

                  return (
                    lines *
                    13
                  ) + 14;
                });

              const rowHeight =
                Math.max(
                  ...heights,
                  28
                );

              if (
                doc.y +
                rowHeight +
                5 >
                pageBottom()
              ) {
                doc.addPage();
              }

              const startY =
                doc.y;

              for (
                let i = 0;
                i < columnCount;
                i++
              ) {
                const x =
                  left +
                  i *
                    colWidth;

                doc
                  .save()
                  .rect(
                    x,
                    startY,
                    colWidth,
                    rowHeight
                  )
                  .fill(
                    header
                      ? tableHeaderColor
                      : "#FFFFFF"
                  )
                  .restore();

                doc
                  .save()
                  .lineWidth(0.5)
                  .strokeColor(
                    "#BBBBBB"
                  )
                  .rect(
                    x,
                    startY,
                    colWidth,
                    rowHeight
                  )
                  .stroke()
                  .restore();

                setFont(
                  header
                    ? boldFont
                    : regularFont,
                  fontSize
                );

                doc
                  .fillColor(
                    bodyColor
                  )
                  .text(
                    values[i],
                    x +
                      cellPadding,
                    startY +
                      cellPadding,
                    {
                      width:
                        colWidth -
                        cellPadding *
                          2,
                      height:
                        rowHeight -
                        cellPadding *
                          2,
                      lineGap: 1
                    }
                  );
              }

              doc.y =
                startY +
                rowHeight;
            }

            // First row is treated as table header.
            drawRow(
              rows[0],
              true
            );

            for (
              let i = 1;
              i < rows.length;
              i++
            ) {
              drawRow(
                rows[i],
                false
              );
            }

            doc.moveDown(0.7);
          }

          // ------------------------------------------------------
          // RENDER BLOCKS
          // ------------------------------------------------------

          let pendingTable = [];

          function flushTable() {
            if (
              pendingTable.length
            ) {
              drawTable(
                pendingTable
              );

              pendingTable = [];
            }
          }

          for (
            const block of blocks
          ) {
            if (
              block.type ===
              "table"
            ) {
              pendingTable.push(
                block.cells
              );

              continue;
            }

            flushTable();

            if (
              block.type ===
              "space"
            ) {
              doc.moveDown(
                0.55
              );

              continue;
            }

            if (
              block.type ===
              "h1"
            ) {
              drawTitle(
                block.text
              );

              continue;
            }

            if (
              block.type ===
              "h2"
            ) {
              drawHeading(
                block.text,
                18
              );

              continue;
            }

            if (
              block.type ===
              "h3"
            ) {
              drawHeading(
                block.text,
                15
              );

              continue;
            }

            if (
              block.type ===
              "bullet"
            ) {
              drawBullet(
                block.text
              );

              continue;
            }

            if (
              block.type ===
              "number"
            ) {
              drawNumber(
                block.number,
                block.text
              );

              continue;
            }

            if (
              block.type ===
              "chat"
            ) {
              drawChat(
                block.label,
                block.text
              );

              continue;
            }

            if (
              block.type ===
              "paragraph"
            ) {
              drawParagraph(
                block.text
              );
            }
          }

          flushTable();

          // ------------------------------------------------------
          // FOOTER
          // ------------------------------------------------------

          const range =
            doc.bufferedPageRange();

          for (
            let i = 0;
            i < range.count;
            i++
          ) {
            doc.switchToPage(
              i
            );

            const footerY =
              doc.page.height -
              34;

            doc
              .save()
              .strokeColor(
                "#BBBBBB"
              )
              .lineWidth(0.5)
              .moveTo(
                left,
                footerY - 7
              )
              .lineTo(
                pageWidth - right,
                footerY - 7
              )
              .stroke()
              .restore();

            setFont(
              regularFont,
              8.5
            );

            doc
              .fillColor(
                "#555555"
              )
              .text(
                `Prepared by: SMATER CHAT AI     Page ${i + 1} of ${range.count}`,
                left,
                footerY,
                {
                  width:
                    usableWidth,
                  align:
                    "center"
                }
              );
          }

          // Return to final page before ending.
          if (range.count) {
            doc.switchToPage(
              range.start +
              range.count -
              1
            );
          }

          doc.end();

        } catch (error) {
          reject(error);
        }
      });
    }

    // ============================================================
    // CREATE PDF
    // ============================================================

    const pdf =
      await buildPdf(
        documentText,
        colourful
      );

    return res.status(200).json({
      success: true,
      type: "pdf",
      filename:
        "smater-chat-ai-document.pdf",
      url:
        `data:application/pdf;base64,${pdf.base64}`,
      pages:
        pdf.pages,
      colourful
    });

  } catch (error) {
    console.error(
      "SMATER CHAT AI file generation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "I couldn't create that file right now. Please try again."
    });
  }
}
