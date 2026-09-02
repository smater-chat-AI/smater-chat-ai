// ============================================================
// SMATER CHAT AI
// Professional File & PDF Generator
// api/file.js — PART 1/4
// ============================================================

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {

  // CORS
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {

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

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENROUTER_API_KEY is not configured."
      });
    }

    // Colour only when user explicitly asks.
    const colourful =
      /\b(colou?rful|colou?r\s*full|colou?r\s+pdf)\b/i
        .test(prompt);

    // Unicode font
    let unicodeFont = null;
    let unicodeBoldFont = null;

    const fontPaths = [
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
      "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"
    ];

    const regularPath =
      path.join(process.cwd(), fontPaths[0]);

    const boldPath =
      path.join(process.cwd(), fontPaths[1]);

    if (fs.existsSync(regularPath)) {
      unicodeFont = regularPath;
    }

    if (fs.existsSync(boldPath)) {
      unicodeBoldFont = boldPath;
    }

    // ==========================================================
    // AI DOCUMENT PROMPT
    // ==========================================================

    const systemPrompt = `
You are the professional document-generation engine
inside SMATER CHAT AI.

Create a polished, accurate and well-structured document
from the user's request.

Rules:
1. Understand Hindi, English and Hinglish.
2. Follow the requested language.
3. Do not invent unnecessary facts.
4. Use clear headings.
5. Use bullets when useful.
6. Use numbered lists when useful.
7. Use Markdown tables when useful.
8. Never create decorative separators.
9. Never add "Prepared by: SMATER CHAT AI".
10. Do not use code fences.
11. Avoid strange control characters.
12. Keep paragraphs readable.
13. Make reports and projects professional.
14. Make notes structured and easy to read.
15. For chat documents, separate User and SMATER CHAT AI.
16. Preserve important details from the request.
17. Do not repeat sections.
18. Do not add fake references or sources.
19. Do not add unnecessary emojis.

SMATER CHAT AI was built by Damini Singh Bhadauria.
Mention this only when relevant.

Return ONLY the document content.

Requested language:
${language}

Colourful formatting requested:
${colourful ? "YES" : "NO"}
`;

    // ==========================================================
    // OPENROUTER
    // ==========================================================

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

    // ==========================================================
    // CLEAN DOCUMENT
    // ==========================================================

    function cleanDocumentText(text) {

      return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
          ""
        )
        .replace(
          /^```(?:markdown|md|text)?\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();
    }

    const documentText =
      cleanDocumentText(generatedText);
    // ============================================================
// api/file.js — PART 2/4
// DOCUMENT PARSER
// ============================================================

    function parseDocument(text) {

      const lines =
        String(text || "")
          .split("\n")
          .map(x => x.trim())
          .filter(x => x.length);

      const blocks = [];

      for (const line of lines) {

        // Heading 1
        if (/^#\s+/.test(line)) {
          blocks.push({
            type: "h1",
            text: line.replace(/^#\s+/, "")
          });
          continue;
        }

        // Heading 2
        if (/^##\s+/.test(line)) {
          blocks.push({
            type: "h2",
            text: line.replace(/^##\s+/, "")
          });
          continue;
        }

        // Heading 3
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
            text: line.replace(/^[-*•]\s+/, "")
          });
          continue;
        }

        // Numbered list
        const numberMatch =
          line.match(/^(\d+)[.)]\s+(.+)$/);

        if (numberMatch) {
          blocks.push({
            type: "number",
            number: numberMatch[1],
            text: numberMatch[2]
          });
          continue;
        }

        // Chat format
        const chatMatch =
          line.match(
            /^(User|SMATER CHAT AI|AI|Assistant)\s*:\s*(.*)$/i
          );

        if (chatMatch) {
          blocks.push({
            type: "chat",
            label: chatMatch[1],
            text: chatMatch[2]
          });
          continue;
        }

        // Markdown table
        if (line.startsWith("|") && line.endsWith("|")) {

          const cells =
            line
              .slice(1, -1)
              .split("|")
              .map(cell => cell.trim());

          // Ignore separator row
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

        // Empty visual spacing
        if (/^[-_* ]{3,}$/.test(line)) {
          blocks.push({
            type: "space"
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

    // ============================================================
    // PDF BUILDER START
    // ============================================================

    async function buildPdf(
      text,
      colourful
    ) {

      return new Promise((resolve, reject) => {

        try {

          const doc = new PDFDocument({
            size: "A4",
            margin: 50,
            bufferPages: true
          });

          const chunks = [];

          doc.on("data", chunk => {
            chunks.push(chunk);
          });

          doc.on("error", reject);

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

          const regular =
            unicodeFont || "Helvetica";

          const bold =
            unicodeBoldFont ||
            unicodeFont ||
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

          function checkSpace(height = 35) {

            if (doc.y + height > bottom) {
              doc.addPage();
            }
          }

          function writeText(
            value,
            size = 13,
            font = regular
          ) {

            checkSpace();

            doc
              .font(font)
              .fontSize(size)
              .fillColor("#111111")
              .text(
                String(value || ""),
                {
                  width,
                  lineGap: 4
                }
              );

            doc.moveDown(0.15);
          }
          // ============================================================
// api/file.js — PART 3/4
// PDF CONTENT RENDERING
// ============================================================

          function drawTable(rows) {

            if (!rows.length) return;

            const columns =
              Math.max(
                ...rows.map(row => row.length)
              );

            const cellWidth =
              width / columns;

            rows.forEach((row, rowIndex) => {

              const rowHeight = 32;

              checkSpace(rowHeight);

              const y = doc.y;

              for (
                let i = 0;
                i < columns;
                i++
              ) {

                const x =
                  left + i * cellWidth;

                doc
                  .save()
                  .fillColor(
                    rowIndex === 0
                      ? (
                          colourful
                            ? "#E8F0FF"
                            : "#F0F0F0"
                        )
                      : "#FFFFFF"
                  )
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

                doc
                  .font(
                    rowIndex === 0
                      ? bold
                      : regular
                  )
                  .fontSize(9.5)
                  .fillColor("#111111")
                  .text(
                    String(row[i] || ""),
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
            });

            doc.moveDown(0.5);
          }

          let tableRows = [];

          for (const block of blocks) {

            if (block.type === "table") {
              tableRows.push(block.cells);
              continue;
            }

            if (tableRows.length) {
              drawTable(tableRows);
              tableRows = [];
            }

            if (block.type === "space") {
              doc.moveDown(0.5);
              continue;
            }

            if (block.type === "h1") {

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
                  { width }
                );

              doc.moveDown(0.5);
              continue;
            }

            if (block.type === "h2") {
              writeText(
                block.text,
                18,
                bold
              );
              continue;
            }

            if (block.type === "h3") {
              writeText(
                block.text,
                15,
                bold
              );
              continue;
            }

            if (block.type === "bullet") {
              writeText(
                "•  " + block.text
              );
              continue;
            }

            if (block.type === "number") {
              writeText(
                `${block.number}. ${block.text}`
              );
              continue;
            }

            if (block.type === "chat") {

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

            if (block.type === "paragraph") {
              writeText(
                block.text
              );
            }
          }

          if (tableRows.length) {
            drawTable(tableRows);
          }
          // ============================================================
// api/file.js — PART 4/4
// FOOTER + FINAL RESPONSE
// ============================================================

          const range =
            doc.bufferedPageRange();

          for (
            let i = 0;
            i < range.count;
            i++
          ) {

            doc.switchToPage(i);

            doc
              .font(regular)
              .fontSize(8)
              .fillColor("#555555")
              .text(
                `Prepared by: SMATER CHAT AI     Page ${i + 1} of ${range.count}`,
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
      });
    }

    // ==========================================================
    // CREATE FILE
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

        // Frontend compatibility
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
        encodeURIComponent(documentText);

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
    `<p>${line}</p>`
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
