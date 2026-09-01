// SMATER CHAT AI
// File & PDF Generator API
// Part 1 of 3

export default async function handler(req, res) {
  // Allow browser preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  // Only POST is allowed
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

    const allowedTypes = ["pdf", "txt", "html"];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported file type."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENROUTER_API_KEY is not configured."
      });
    }

    // Colour is OFF by default.
    // It turns ON only when the user specifically asks for
    // colourful / colorful / colour full formatting.
    const colourful =
      /\b(colou?rful|colou?r\s*full)\b/i.test(prompt);

    const systemPrompt = `
You are the professional document-generation engine of SMATER CHAT AI.

Create a clean, useful, well-structured document from the user's request.

Important rules:

1. Follow the user's requested language.
2. Hindi, English and Hinglish requests are allowed.
3. Do not invent unnecessary information.
4. Use clear titles and logical sections.
5. Use proper Markdown formatting.
6. Use headings with #, ## and ### where appropriate.
7. Use bullets with "-".
8. Use numbered lists with "1.", "2.", etc.
9. When a table is useful, ALWAYS use proper Markdown table syntax.

Example table format:

| Column 1 | Column 2 | Column 3 |
|---|---|---|
| Value | Value | Value |

10. Never create decorative separator lines such as:
---
***
* * * * *
___

11. Never add repeated footers.
12. Never add "Prepared by: SMATER CHAT AI" yourself.
   The application will add the official footer automatically.
13. Do not put the document inside a code block.
14. Do not add explanations outside the requested document.
15. Do not add unnecessary emojis unless the user asks for them.
16. Keep paragraphs readable and properly spaced.
17. If the request is a report/project, use a professional report structure.
18. If the request is a chat/conversation document, clearly distinguish User and SMATER CHAT AI.
19. Avoid strange control characters or corrupted symbols.
20. Do not use decorative Markdown that could create unwanted characters in a PDF.

The founder of SMATER CHAT AI is Damini Singh Bhadauria.
Only mention this when relevant to the user's request.

The document will be rendered by SMATER CHAT AI's own file engine.
Return ONLY the document content.

Requested language:
${language}

Colourful formatting requested:
${colourful ? "YES" : "NO"}
`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://smater-chat-ai.vercel.app/",
          "X-Title": "SMATER CHAT AI"
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
          temperature: 0.35
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "OpenRouter file generation error:",
        response.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        error: "The AI could not generate the document."
      });
    }

    const data = await response.json();

    const generatedText =
      data?.choices?.[0]?.message?.content;

    if (
      typeof generatedText !== "string" ||
      !generatedText.trim()
    ) {
      return res.status(502).json({
        success: false,
        error: "The AI returned an empty document."
      });
    }

    // Continue in Part 2...
      // Clean AI output before sending it to the file builders.
    // This removes repeated footers, decorative separators,
    // code fences and other unwanted Markdown noise.

    function cleanDocumentText(text) {
      let value = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

      // Remove code fences
      value = value
        .replace(/^```(?:markdown|md|text|html)?\s*/i, "")
        .replace(/\s*```$/i, "");

      const lines = value.split("\n");
      const cleaned = [];

      for (let line of lines) {
        const trimmed = line.trim();

        // Remove generated footer because the application
        // adds the official footer itself.
        if (
          /^prepared\s+by\s*:\s*smater\s+chat\s+ai\s*$/i.test(trimmed)
        ) {
          continue;
        }

        // Remove decorative separators.
        if (
          /^[-_*=\s]{3,}$/.test(trimmed) ||
          /^(\*\s*){3,}$/.test(trimmed)
        ) {
          continue;
        }

        // Remove accidental control characters,
        // while keeping normal Unicode text.
        line = line.replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
          ""
        );

        // Clean excessive Markdown emphasis markers.
        line = line.replace(/\*\*(.*?)\*\*/g, "$1");
        line = line.replace(/__(.*?)__/g, "$1");

        cleaned.push(line);
      }

      // Reduce excessive blank lines.
      return cleaned
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    const documentText = cleanDocumentText(generatedText);

    if (!documentText) {
      return res.status(502).json({
        success: false,
        error: "The generated document was empty after cleanup."
      });
    }

    // TXT file
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
        filename: "smater-chat-ai-document.txt",
        url: txtUrl
      });
    }

    // HTML file
    if (type === "html") {
      const escaped = documentText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SMATER CHAT AI Document</title>
<style>
  body {
    font-family: Arial, sans-serif;
    line-height: 1.7;
    max-width: 900px;
    margin: 40px auto;
    padding: 0 22px;
  }

  h1 {
    font-size: 30px;
    margin-bottom: 20px;
  }

  h2 {
    font-size: 23px;
    margin-top: 28px;
  }

  h3 {
    font-size: 19px;
    margin-top: 22px;
  }

  pre {
    white-space: pre-wrap;
    font-family: Arial, sans-serif;
  }

  .footer {
    margin-top: 45px;
    padding-top: 12px;
    border-top: 1px solid #aaa;
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
        encodeURIComponent(htmlContent);

      return res.status(200).json({
        success: true,
        type: "html",
        filename: "smater-chat-ai-document.html",
        url: htmlUrl
      });
    }

    // PDF generation continues in Part 3.
      // ------------------------------------------------------------
    // PDF BUILDER
    // ------------------------------------------------------------

    function escapePdfText(text) {
      return String(text || "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
    }

    function pdfText(font, size, x, y, text) {
      return [
        "BT",
        `/${font} ${size} Tf`,
        `${x} ${y} Td`,
        `(${escapePdfText(text)}) Tj`,
        "ET"
      ].join("\n");
    }

    function wrapText(text, maxChars) {
      const words = String(text || "").split(/\s+/);
      const lines = [];
      let current = "";

      for (const word of words) {
        if (!word) continue;

        const test =
          current ? `${current} ${word}` : word;

        if (test.length <= maxChars) {
          current = test;
        } else {
          if (current) lines.push(current);

          // Very long words are split safely.
          if (word.length > maxChars) {
            let remaining = word;

            while (remaining.length > maxChars) {
              lines.push(remaining.slice(0, maxChars));
              remaining = remaining.slice(maxChars);
            }

            current = remaining;
          } else {
            current = word;
          }
        }
      }

      if (current) lines.push(current);

      return lines.length ? lines : [""];
    }

    function parseDocument(text) {
      const rawLines = String(text || "")
        .replace(/\r/g, "")
        .split("\n");

      const blocks = [];

      for (let raw of rawLines) {
        let line = raw.trim();

        if (!line) {
          blocks.push({
            type: "space"
          });
          continue;
        }

        // Remove Markdown table separator rows.
        if (
          /^\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?$/.test(line)
        ) {
          continue;
        }

        // Markdown headings
        if (/^###\s+/.test(line)) {
          blocks.push({
            type: "h3",
            text: line.replace(/^###\s+/, "").trim()
          });
          continue;
        }

        if (/^##\s+/.test(line)) {
          blocks.push({
            type: "h2",
            text: line.replace(/^##\s+/, "").trim()
          });
          continue;
        }

        if (/^#\s+/.test(line)) {
          blocks.push({
            type: "h1",
            text: line.replace(/^#\s+/, "").trim()
          });
          continue;
        }

        // User / AI chat format
        const chatMatch = line.match(
          /^(User|AI|Assistant|SMATER CHAT AI)\s*:\s*(.*)$/i
        );

        if (chatMatch) {
          blocks.push({
            type: "chat",
            label: chatMatch[1],
            text: chatMatch[2]
          });
          continue;
        }

        // Markdown bullet
        if (/^[-*•]\s+/.test(line)) {
          blocks.push({
            type: "bullet",
            text: line.replace(/^[-*•]\s+/, "").trim()
          });
          continue;
        }

        // Numbered list
        const numberMatch = line.match(/^(\d+)[.)]\s+(.*)$/);

        if (numberMatch) {
          blocks.push({
            type: "number",
            number: numberMatch[1],
            text: numberMatch[2].trim()
          });
          continue;
        }

        // Markdown table row
        if (
          line.startsWith("|") &&
          line.endsWith("|") &&
          line.split("|").length >= 3
        ) {
          const cells = line
            .split("|")
            .slice(1, -1)
            .map(cell =>
              cell
                .replace(/\*\*/g, "")
                .trim()
            );

          blocks.push({
            type: "table",
            cells
          });
          continue;
        }

        // Clean stray Markdown symbols
        line = line
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/__(.*?)__/g, "$1")
          .replace(/^>\s*/, "")
          .trim();

        blocks.push({
          type: "paragraph",
          text: line
        });
      }

      return blocks;
    }

    function buildPdf(text, colourful) {
      const PAGE_WIDTH = 595;
      const PAGE_HEIGHT = 842;

      const marginLeft = 50;
      const marginRight = 50;
      const top = 790;
      const bottom = 65;

      const bodySize = 14;
      const bodyLeading = 20;

      const headingSize = 18;
      const subHeadingSize = 15;
      const titleSize = 24;

      const blocks = parseDocument(text);

      const pages = [];
      let current = [];
      let y = top;

      function newPage() {
        if (current.length) {
          pages.push(current);
        }

        current = [];
        y = top;
      }

      function ensureSpace(height) {
        if (y - height < bottom) {
          newPage();
        }
      }

      function addLine(font, size, x, text, leading = bodyLeading) {
        ensureSpace(leading + 4);

        current.push(
          pdfText(
            font,
            size,
            x,
            y,
            text
          )
        );

        y -= leading;
      }

      for (const block of blocks) {
        if (block.type === "space") {
          y -= 10;

          if (y < bottom) {
            newPage();
          }

          continue;
        }

        if (block.type === "h1") {
          ensureSpace(45);

          addLine(
            "F2",
            titleSize,
            marginLeft,
            block.text,
            30
          );

          y -= 8;
          continue;
        }

        if (block.type === "h2") {
          ensureSpace(35);

          addLine(
            "F2",
            headingSize,
            marginLeft,
            block.text,
            24
          );

          y -= 5;
          continue;
        }

        if (block.type === "h3") {
          ensureSpace(30);

          addLine(
            "F2",
            subHeadingSize,
            marginLeft,
            block.text,
            21
          );

          y -= 3;
          continue;
        }

        if (block.type === "bullet") {
          const lines = wrapText(
            block.text,
            70
          );

          lines.forEach((line, index) => {
            addLine(
              "F1",
              bodySize,
              marginLeft + (index === 0 ? 0 : 18),
              `${index === 0 ? "• " : "  "}${line}`
            );
          });

          continue;
        }

        if (block.type === "number") {
          const prefix = `${block.number}. `;
          const lines = wrapText(
            block.text,
            67
          );

          lines.forEach((line, index) => {
            addLine(
              "F1",
              bodySize,
              marginLeft,
              `${index === 0 ? prefix : "   "}${line}`
            );
          });

          continue;
        }

        if (block.type === "chat") {
          ensureSpace(35);

          addLine(
            "F2",
            subHeadingSize,
            marginLeft,
            block.label,
            21
          );

          const lines = wrapText(
            block.text,
            68
          );

          lines.forEach(line => {
            addLine(
              "F1",
              bodySize,
              marginLeft + 12,
              line
            );
          });

          y -= 5;
          continue;
        }

        if (block.type === "table") {
          const cells = block.cells;

          // Simple clean table rendering.
          // Each cell is separated visually by spaces.
          const tableText = cells.join("    ");

          const lines = wrapText(
            tableText,
            68
          );

          lines.forEach((line, index) => {
            addLine(
              "F1",
              bodySize,
              marginLeft,
              line,
              19
            );
          });

          y -= 3;
          continue;
        }

        if (block.type === "paragraph") {
          const lines = wrapText(
            block.text,
            72
          );

          lines.forEach(line => {
            addLine(
              "F1",
              bodySize,
              marginLeft,
              line
            );
          });

          y -= 5;
        }
      }

      if (current.length) {
        pages.push(current);
      }

      // ------------------------------------------------------------
      // PDF OBJECT CREATION
      // ------------------------------------------------------------

      const objects = [];

      function addObject(content) {
        objects.push(content);
        return objects.length;
      }

      const catalogId = addObject("");
      const pagesId = addObject("");

      const fontRegularId = addObject(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
      );

      const fontBoldId = addObject(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
      );

      const fontFooterId = addObject(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"
      );

      const pageIds = [];

      for (let i = 0; i < pages.length; i++) {
        const pageBlocks = pages[i].slice();

        // Clean footer: added exactly once to every page.
        pageBlocks.push(
          pdfText(
            "F3",
            9,
            marginLeft,
            35,
            `Prepared by: SMATER CHAT AI     Page ${i + 1} of ${pages.length}`
          )
        );

        const stream = pageBlocks.join("\n");

        const streamId = addObject(
          `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
        );

        const pageId = addObject(
          `<<
/Type /Page
/Parent ${pagesId} 0 R
/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]
/Resources <<
  /Font <<
    /F1 ${fontRegularId} 0 R
    /F2 ${fontBoldId} 0 R
    /F3 ${fontFooterId} 0 R
  >>
>>
/Contents ${streamId} 0 R
>>`
        );

        pageIds.push(pageId);
      }

      objects[catalogId - 1] =
        `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

      objects[pagesId - 1] =
        `<<
/Type /Pages
/Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}]
/Count ${pageIds.length}
>>`;

      // ------------------------------------------------------------
      // PDF HEADER + XREF
      // ------------------------------------------------------------

      let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";

      const offsets = [0];

      for (let i = 0; i < objects.length; i++) {
        offsets.push(pdf.length);

        pdf += `${i + 1} 0 obj\n`;
        pdf += `${objects[i]}\n`;
        pdf += "endobj\n";
      }

      const xrefOffset = pdf.length;

      pdf += "xref\n";
      pdf += `0 ${objects.length + 1}\n`;
      pdf += "0000000000 65535 f \n";

      for (let i = 1; i < offsets.length; i++) {
        pdf += String(offsets[i]).padStart(10, "0");
        pdf += " 00000 n \n";
      }

      pdf += "trailer\n";
      pdf += `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
      pdf += "startxref\n";
      pdf += `${xrefOffset}\n`;
      pdf += "%%EOF";

      const base64 = Buffer
        .from(pdf, "binary")
        .toString("base64");

      return {
        base64,
        pages: pages.length,
        colourful
      };
    }

    // ------------------------------------------------------------
    // BUILD PDF
    // ------------------------------------------------------------

    const pdf = buildPdf(
      documentText,
      colourful
    );

    return res.status(200).json({
      success: true,
      type: "pdf",
      filename: "smater-chat-ai-document.pdf",
      url: `data:application/pdf;base64,${pdf.base64}`,
      pages: pdf.pages
    });

  } catch (error) {
    console.error(
      "SMATER CHAT AI file generation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "I couldn't create that file right now. Please try again."
    });
  }
                                             }
