// ============================================================
// SMATER CHAT AI
// api/file.js — FINAL 1/4
// ============================================================

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return res.status(200).json({
      ok: true
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

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
        error:
          "Please provide a document prompt."
      });
    }

    const allowedTypes = [
      "pdf",
      "txt",
      "html"
    ];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error:
          "Unsupported file type."
      });
    }

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error:
          "OPENROUTER_API_KEY is not configured."
      });
    }

    // Colour is enabled ONLY when explicitly requested.
    const colourful =
      /\b(
        colourful|
        colorful|
        colour\s+pdf|
        color\s+pdf|
        colourful\s+pdf|
        colorful\s+pdf
      )\b/ix.test(prompt);

    // ----------------------------------------------------------
    // UNICODE FONTS
    // ----------------------------------------------------------

    let regularFont = null;
    let boldFont = null;

    const regularCandidates = [
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2"
    ];

    const boldCandidates = [
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff",
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff2"
    ];

    for (const relative of regularCandidates) {

      const full =
        path.join(
          process.cwd(),
          relative
        );

      if (fs.existsSync(full)) {
        regularFont = full;
        break;
      }
    }

    for (const relative of boldCandidates) {

      const full =
        path.join(
          process.cwd(),
          relative
        );

      if (fs.existsSync(full)) {
        boldFont = full;
        break;
      }
    }

    // ==========================================================
    // AI DOCUMENT PROMPT
    // ==========================================================

    const systemPrompt = `
You are the professional document-generation engine
inside SMATER CHAT AI.

Create a polished, accurate and well-structured document.

RULES:

1. Understand Hindi, English and Hinglish.
2. Follow the requested language.
3. Keep information accurate.
4. Use clear headings.
5. Use bullets where useful.
6. Use numbered lists where useful.
7. Use Markdown tables when useful.
8. Never create decorative separators.
9. Never add "Prepared by: SMATER CHAT AI".
10. Do not use code fences.
11. Do not add strange control characters.
12. Keep paragraphs readable.
13. Make reports professional.
14. Make notes structured.
15. Keep chat documents clearly separated.
16. Do not repeat sections.
17. Do not add fake references.
18. Do not add unnecessary emojis.

SMATER CHAT AI was built by
Damini Singh Bhadauria.

Mention the builder only when relevant.

Return ONLY the document content.

Requested language:
${language}

Colourful formatting:
${colourful ? "YES" : "NO"}
`;

    // ==========================================================
    // OPENROUTER REQUEST
    // ==========================================================

    const response =
      await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",

            "HTTP-Referer":
              "https://smater-chat-ai.vercel.app/",

            "X-Title":
              "SMATER CHAT AI"
          },

          body: JSON.stringify({
            model:
              "openrouter/free",

            messages: [
              {
                role: "system",
                content:
                  systemPrompt
              },
              {
                role: "user",
                content:
                  prompt
              }
            ],

            temperature: 0.3
          })
        }
      );

    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "OpenRouter file error:",
        response.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        error:
          "The AI could not generate the document."
      });
    }

    const data =
      await response.json();

    let generatedText =
      data?.choices?.[0]?.message?.content;

    if (
      Array.isArray(generatedText)
    ) {
      generatedText =
        generatedText
          .map(item =>
            typeof item === "string"
              ? item
              : item?.text || ""
          )
          .join("\n");
    }

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

    // ==========================================================
    // CLEAN AI DOCUMENT
    // ==========================================================

    function cleanDocumentText(text) {

      let value =
        String(text || "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

      value =
        value.replace(
          /^```(?:markdown|md|text|html)?\s*/i,
          ""
        );

      value =
        value.replace(
          /\s*```$/i,
          ""
        );

      const lines =
        value.split("\n");

      const cleaned = [];

      for (let line of lines) {

        const trimmed =
          line.trim();

        if (
          /^prepared\s+by\s*:\s*smater\s+chat\s+ai/i
            .test(trimmed)
        ) {
          continue;
        }

        if (
          /^[-_*=\s]{3,}$/.test(trimmed) ||
          /^(\*\s*){3,}$/.test(trimmed)
        ) {
          continue;
        }

        line =
          line.replace(
            /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            ""
          );

        line =
          line.replace(
            /\*\*(.*?)\*\*/g,
            "$1"
          );

        line =
          line.replace(
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
      cleanDocumentText(
        generatedText
      );

    if (!documentText) {
      return res.status(502).json({
        success: false,
        error:
          "The generated document was empty."
      });
    }
    // ============================================================
// SMATER CHAT AI
// api/file.js — FINAL 2/4
// DOCUMENT PARSER + PDF SETUP
// ============================================================

    // ==========================================================
    // DOCUMENT PARSER
    // ==========================================================

    function parseDocument(text) {

      const lines =
        String(text || "")
          .split("\n")
          .map(line => line.trim());

      const blocks = [];

      for (const line of lines) {

        if (!line) {
          blocks.push({
            type: "space"
          });
          continue;
        }

        // H1
        if (/^#\s+/.test(line)) {
          blocks.push({
            type: "h1",
            text: line.replace(/^#\s+/, "")
          });
          continue;
        }

        // H2
        if (/^##\s+/.test(line)) {
          blocks.push({
            type: "h2",
            text: line.replace(/^##\s+/, "")
          });
          continue;
        }

        // H3
        if (/^###\s+/.test(line)) {
          blocks.push({
            type: "h3",
            text: line.replace(/^###\s+/, "")
          });
          continue;
        }

        // Bullet
        if (/^[-*•]\s+/.test(line)) {
          blocks.push({
            type: "bullet",
            text: line.replace(
              /^[-*•]\s+/,
              ""
            )
          });
          continue;
        }

        // Numbered list
        const number =
          line.match(
            /^(\d+)[.)]\s+(.+)$/
          );

        if (number) {
          blocks.push({
            type: "number",
            number: number[1],
            text: number[2]
          });
          continue;
        }

        // Chat format
        const chat =
          line.match(
            /^(User|SMATER CHAT AI|AI|Assistant)\s*:\s*(.*)$/i
          );

        if (chat) {
          blocks.push({
            type: "chat",
            label: chat[1],
            text: chat[2]
          });
          continue;
        }

        // Markdown table
        if (
          line.startsWith("|") &&
          line.endsWith("|")
        ) {

          const cells =
            line
              .slice(1, -1)
              .split("|")
              .map(cell =>
                cell.trim()
              );

          // Skip markdown separator row
          if (
            cells.every(cell =>
              /^:?-{2,}:?$/.test(cell)
            )
          ) {
            continue;
          }

          blocks.push({
            type: "table",
            cells
          });

          continue;
        }

        // Normal paragraph
        blocks.push({
          type: "paragraph",
          text: line
        });
      }

      return blocks;
    }

    // ==========================================================
    // PDF BUILDER
    // ==========================================================

    function buildPdf(
      text,
      colourful
    ) {

      return new Promise(
        (resolve, reject) => {

          try {

            const doc =
              new PDFDocument({
                size: "A4",
                margin: 50,
                bufferPages: true
              });

            const chunks = [];

            doc.on(
              "data",
              chunk => chunks.push(chunk)
            );

            doc.on(
              "error",
              reject
            );

            doc.on(
              "end",
              () => {

                const buffer =
                  Buffer.concat(chunks);

                resolve({
                  base64:
                    buffer.toString("base64"),

                  pages:
                    doc
                      .bufferedPageRange()
                      .count
                });
              }
            );

            // --------------------------------------------------
            // FONT SELECTION
            // --------------------------------------------------

            const regular =
              regularFont ||
              "Helvetica";

            const bold =
              boldFont ||
              regularFont ||
              "Helvetica-Bold";

            const width =
              doc.page.width -
              doc.page.margins.left -
              doc.page.margins.right;

            const left =
              doc.page.margins.left;

            const bottom =
              doc.page.height -
              doc.page.margins.bottom -
              35;

            const blocks =
              parseDocument(text);

            // --------------------------------------------------
            // PAGE SPACE CHECK
            // --------------------------------------------------

            function checkSpace(
              height = 35
            ) {

              if (
                doc.y + height >
                bottom
              ) {
                doc.addPage();
              }
            }

            // --------------------------------------------------
            // FONT CHOICE
            // --------------------------------------------------

            function chooseFont(
              value,
              requestedFont
            ) {

              const hasHindi =
                /[\u0900-\u097F]/.test(
                  String(value || "")
                );

              if (
                hasHindi &&
                regularFont
              ) {
                return requestedFont === bold
                  ? bold
                  : regular;
              }

              return requestedFont === bold
                ? "Helvetica-Bold"
                : "Helvetica";
            }

            // --------------------------------------------------
            // BASIC TEXT
            // --------------------------------------------------

            function writeText(
              value,
              size = 13,
              requestedFont = regular
            ) {

              const textValue =
                String(value || "");

              checkSpace();

              doc
                .font(
                  chooseFont(
                    textValue,
                    requestedFont
                  )
                )
                .fontSize(size)
                .fillColor("#111111")
                .text(
                  textValue,
                  {
                    width,
                    lineGap: 4
                  }
                );

              doc.moveDown(0.15);
                }
            // ============================================================
// api/file.js — FINAL 3/4
// TABLE + CONTENT RENDERING
// ============================================================

            // --------------------------------------------------
            // TABLE RENDERER
            // --------------------------------------------------

            function drawTable(rows) {

              if (!rows.length) return;

              const columns =
                Math.max(
                  ...rows.map(row =>
                    row.length
                  )
                );

              const cellWidth =
                width / columns;

              for (
                let rowIndex = 0;
                rowIndex < rows.length;
                rowIndex++
              ) {

                const row =
                  rows[rowIndex];

                const rowHeight = 32;

                checkSpace(rowHeight);

                const y = doc.y;

                for (
                  let i = 0;
                  i < columns;
                  i++
                ) {

                  const x =
                    left +
                    i * cellWidth;

                  const background =
                    rowIndex === 0
                      ? (
                          colourful
                            ? "#E8F0FF"
                            : "#F0F0F0"
                        )
                      : "#FFFFFF";

                  doc
                    .save()
                    .fillColor(background)
                    .rect(
                      x,
                      y,
                      cellWidth,
                      rowHeight
                    )
                    .fill()
                    .restore();

                  doc
                    .save()
                    .lineWidth(0.5)
                    .strokeColor("#BBBBBB")
                    .rect(
                      x,
                      y,
                      cellWidth,
                      rowHeight
                    )
                    .stroke()
                    .restore();

                  const value =
                    String(
                      row[i] || ""
                    );

                  doc
                    .font(
                      rowIndex === 0
                        ? bold
                        : regular
                    )
                    .fontSize(9.5)
                    .fillColor("#111111")
                    .text(
                      value,
                      x + 5,
                      y + 8,
                      {
                        width:
                          cellWidth - 10,
                        height:
                          rowHeight - 8
                      }
                    );
                }

                doc.y =
                  y + rowHeight;
              }

              doc.moveDown(0.5);
            }

            // --------------------------------------------------
            // RENDER DOCUMENT
            // --------------------------------------------------

            let tableRows = [];

            for (
              const block of blocks
            ) {

              // Collect table rows
              if (
                block.type === "table"
              ) {
                tableRows.push(
                  block.cells
                );
                continue;
              }

              // Draw collected table
              if (tableRows.length) {
                drawTable(tableRows);
                tableRows = [];
              }

              // Spacing
              if (
                block.type === "space"
              ) {
                doc.moveDown(0.5);
                continue;
              }

              // Main title
              if (
                block.type === "h1"
              ) {

                checkSpace(60);

                doc
                  .font(bold)
                  .fontSize(24)
                  .fillColor(
                    colourful
                      ? "#2457D6"
                      : "#111111"
                  )
                  .text(
                    block.text,
                    {
                      width
                    }
                  );

                doc.moveDown(0.5);
                continue;
              }

              // Heading 2
              if (
                block.type === "h2"
              ) {

                writeText(
                  block.text,
                  18,
                  bold
                );

                continue;
              }

              // Heading 3
              if (
                block.type === "h3"
              ) {

                writeText(
                  block.text,
                  15,
                  bold
                );

                continue;
              }

              // Bullet
              if (
                block.type === "bullet"
              ) {

                writeText(
                  "•  " +
                  block.text
                );

                continue;
              }

              // Numbered item
              if (
                block.type === "number"
              ) {

                writeText(
                  `${block.number}. ${block.text}`
                );

                continue;
              }

              // Chat message
              if (
                block.type === "chat"
              ) {

                writeText(
                  block.label,
                  14,
                  bold
                );

                writeText(
                  block.text
                );

                continue;
              }

              // Normal paragraph
              if (
                block.type === "paragraph"
              ) {

                writeText(
                  block.text
                );
              }
            }

            // Draw remaining table
            if (tableRows.length) {
              drawTable(tableRows);
              tableRows = [];
            }
            // ============================================================
// api/file.js — FINAL 4/4
// FOOTER + FILE RESPONSE + ERROR HANDLING
// ============================================================

            // --------------------------------------------------
            // PAGE FOOTERS
            // --------------------------------------------------

            const pageRange =
              doc.bufferedPageRange();

            for (
              let i = 0;
              i < pageRange.count;
              i++
            ) {

              doc.switchToPage(i);

              doc
                .font(regular)
                .fontSize(8)
                .fillColor("#555555")
                .text(
                  `Prepared by: SMATER CHAT AI     Page ${i + 1} of ${pageRange.count}`,
                  50,
                  doc.page.height - 30,
                  {
                    width:
                      doc.page.width - 100,
                    align: "center"
                  }
                );
            }

            doc.end();

          } catch (error) {
            reject(error);
          }
        }
      );
    }

    // ==========================================================
    // PDF
    // ==========================================================

    if (type === "pdf") {

      const pdf =
        await buildPdf(
          documentText,
          colourful
        );

      const pdfUrl =
        `data:application/pdf;base64,${pdf.base64}`;

      return res.status(200).json({
        success: true,
        type: "pdf",
        filename:
          "smater-chat-ai-document.pdf",

        // Both fields are kept for frontend compatibility.
        url: pdfUrl,
        file: pdfUrl,

        pages: pdf.pages,
        colourful: colourful
      });
    }

    // ==========================================================
    // TXT
    // ==========================================================

    if (type === "txt") {

      const txtUrl =
        "data:text/plain;charset=utf-8," +
        encodeURIComponent(
          documentText
        );

      return res.status(200).json({
        success: true,
        type: "txt",
        filename:
          "smater-chat-ai-document.txt",
        url: txtUrl,
        file: txtUrl,
        colourful: false
      });
    }

    // ==========================================================
    // HTML
    // ==========================================================

    const html =
      `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>SMATER CHAT AI</title>
</head>
<body>
${documentText
  .split("\n")
  .map(line =>
    `<p>${line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    }</p>`
  )
  .join("")}
</body>
</html>`;

    const htmlUrl =
      "data:text/html;charset=utf-8," +
      encodeURIComponent(html);

    return res.status(200).json({
      success: true,
      type: "html",
      filename:
        "smater-chat-ai-document.html",
      url: htmlUrl,
      file: htmlUrl,
      colourful: false
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
