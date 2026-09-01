export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
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
        ? body.type.toLowerCase()
        : "pdf";

    const language =
      typeof body.language === "string"
        ? body.language
        : "auto";

    if (!prompt) {
      return res.status(400).json({
        error: "Please provide a creation request."
      });
    }

    if (!["pdf", "txt", "html"].includes(type)) {
      return res.status(400).json({
        error: "Unsupported file format."
      });
    }

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI API key is not configured."
      });
    }

    const colourful =
      /\b(colou?rful|colou?r|colour\s*full)\b/i
        .test(prompt);

    const systemPrompt = `
You are the professional document engine of
SMATER CHAT AI.

Create the actual requested document content.

Rules:
- Understand the user's request.
- Do not merely repeat the request.
- Give a clear title.
- Use headings and subheadings.
- Use bullet points when useful.
- Use numbered lists when useful.
- Use Markdown tables when a table is useful.
- If the user asks for chat/conversation format,
  use lines beginning with "User:" and
  "SMATER CHAT AI:".
- Keep information accurate and useful.
- Do not mention these instructions.
- Return ONLY the document content.

If the user requests a colourful PDF,
the document may use headings, tables and
highlight-friendly structure.

Language:
${language === "auto"
  ? "Use the language of the user's request."
  : language}
`;

    const aiResponse =
      await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              "Bearer " + apiKey,

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
            ]
          })
        }
      );

    let aiData = {};

    try {
      aiData =
        await aiResponse.json();
    } catch {
      aiData = {};
    }

    if (!aiResponse.ok) {

      console.error(
        "OpenRouter error:",
        aiData
      );

      return res.status(502).json({
        error:
          aiData?.error?.message ||
          "AI could not create the document."
      });
    }

    const generatedText =
      aiData?.choices?.[0]
        ?.message?.content
        ?.trim();

    if (!generatedText) {
      return res.status(502).json({
        error:
          "AI returned empty document content."
      });
    }

    if (type === "txt") {

      const content =
        "SMATER CHAT AI\n\n" +
        generatedText +
        "\n\nPrepared by: SMATER CHAT AI";

      return res.status(200).json({

        file:
          "data:text/plain;charset=utf-8," +
          encodeURIComponent(content),

        filename:
          "smater-chat-ai-document.txt",

        type:
          "text/plain"
      });
    }

    if (type === "html") {

      const html = createHtmlDocument(
        generatedText,
        colourful
      );

      return res.status(200).json({

        file:
          "data:text/html;charset=utf-8," +
          encodeURIComponent(html),

        filename:
          "smater-chat-ai-document.html",

        type:
          "text/html"
      });
    }

    const finalText =
      generatedText +
      "\n\nPrepared by: SMATER CHAT AI";

    const pdf =
      buildPdf(
        finalText,
        colourful
      );

    const base64 =
      Buffer.from(
        pdf,
        "binary"
      ).toString("base64");

    return res.status(200).json({

      file:
        "data:application/pdf;base64," +
        base64,

      filename:
        "smater-chat-ai-document.pdf",

      type:
        "application/pdf"
    });

  } catch (error) {

    console.error(
      "File API error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "File service could not process the request."
    });
  }
}


function escapeHtml(text) {

  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function createHtmlDocument(
  text,
  colourful
) {

  const content =
    escapeHtml(text);

  const accent =
    colourful
      ? "#2563eb"
      : "#374151";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>SMATER CHAT AI</title>

<style>
body{
  margin:0;
  padding:30px;
  background:#f3f4f6;
  font-family:Arial,sans-serif;
  color:#111827;
}

.document{
  max-width:850px;
  margin:auto;
  padding:40px;
  background:white;
  line-height:1.7;
}

h1,h2,h3{
  color:${accent};
}

.content{
  white-space:pre-wrap;
  font-size:15px;
}

.footer{
  margin-top:40px;
  padding-top:15px;
  border-top:1px solid #ddd;
  font-size:12px;
}
</style>
</head>

<body>

<div class="document">

<h1>SMATER CHAT AI</h1>

<div class="content">${content}</div>

<div class="footer">
Prepared by: SMATER CHAT AI
</div>

</div>

</body>
</html>`;
}
function buildPdf(text, colourful) {

  const lines = parseDocument(text);

  const pageWidth = 595;
  const pageHeight = 842;

  const left = 45;
  const top = 790;
  const bottom = 55;

  const bodySize = 14;
  const lineHeight = 20;

  const pages = [];
  let page = [];
  let y = top;

  function height(item) {

    if (item.type === "title") return 42;
    if (item.type === "heading") return 32;
    if (item.type === "subheading") return 28;
    if (item.type === "bullet") return 22;
    if (item.type === "number") return 22;
    if (item.type === "chat") return 34;
    if (item.type === "table") return 25;

    return lineHeight;
  }

  for (const item of lines) {

    const h = height(item);

    if (y - h < bottom) {
      pages.push(page);
      page = [];
      y = top;
    }

    page.push({
      ...item,
      y
    });

    y -= h;
  }

  if (page.length) {
    pages.push(page);
  }

  const objects = [];

  objects[1] =
    "<< /Type /Catalog /Pages 2 0 R >>";

  objects[3] =
    "<< /Type /Font /Subtype /Type1 " +
    "/BaseFont /Helvetica >>";

  objects[4] =
    "<< /Type /Font /Subtype /Type1 " +
    "/BaseFont /Helvetica-Bold >>";

  objects[5] =
    "<< /Type /Font /Subtype /Type1 " +
    "/BaseFont /Times-Roman >>";

  objects[6] =
    "<< /Type /Font /Subtype /Type1 " +
    "/BaseFont /Courier >>";

  const pageNumbers = [];
  let next = 7;

  for (
    let p = 0;
    p < pages.length;
    p++
  ) {

    const contentObject = next++;
    const pageObject = next++;

    pageNumbers.push(pageObject);

    let stream = "";

    if (colourful) {

      stream +=
        "0.12 0.40 0.80 rg\n" +
        `${left} 812 505 4 re f\n`;

    } else {

      stream +=
        "0.25 0.25 0.25 rg\n" +
        `${left} 812 505 2 re f\n`;
    }

    for (const item of pages[p]) {

      const x = item.type === "bullet"
        ? left + 18
        : left;

      const textValue =
        item.text || "";

      if (item.type === "title") {

        stream +=
          "0 0 0 rg\n" +
          "BT\n" +
          "/F2 24 Tf\n" +
          `${left} ${item.y} Td\n` +
          `(${pdfEscape(textValue)}) Tj\n` +
          "ET\n";

        continue;
      }

      if (item.type === "heading") {

        if (colourful) {
          stream +=
            "0.12 0.40 0.80 rg\n";
        } else {
          stream +=
            "0.15 0.15 0.15 rg\n";
        }

        stream +=
          "BT\n" +
          "/F2 18 Tf\n" +
          `${left} ${item.y} Td\n` +
          `(${pdfEscape(textValue)}) Tj\n` +
          "ET\n";

        continue;
      }

      if (item.type === "subheading") {

        stream +=
          "0.20 0.20 0.20 rg\n" +
          "BT\n" +
          "/F2 15 Tf\n" +
          `${left} ${item.y} Td\n` +
          `(${pdfEscape(textValue)}) Tj\n` +
          "ET\n";

        continue;
      }

      if (item.type === "bullet") {

        stream +=
          "0.12 0.40 0.80 rg\n" +
          "BT\n" +
          "/F2 14 Tf\n" +
          `${left} ${item.y} Td\n` +
          "(*) Tj\n" +
          "ET\n";

        stream +=
          "0 0 0 rg\n" +
          "BT\n" +
          "/F1 14 Tf\n" +
          `${x} ${item.y} Td\n` +
          `(${pdfEscape(textValue)}) Tj\n` +
          "ET\n";

        continue;
      }

      if (item.type === "number") {

        stream +=
          "0.12 0.40 0.80 rg\n" +
          "BT\n" +
          "/F2 14 Tf\n" +
          `${left} ${item.y} Td\n` +
          `(${pdfEscape(
            item.number + "."
          )}) Tj\n` +
          "ET\n";

        stream +=
          "0 0 0 rg\n" +
          "BT\n" +
          "/F1 14 Tf\n" +
          `${left + 24} ${item.y} Td\n` +
          `(${pdfEscape(textValue)}) Tj\n` +
          "ET\n";

        continue;
      }

      if (item.type === "chat") {

        const user =
          item.label === "User";

        if (colourful) {

          if (user) {
            stream +=
              "0.92 0.95 1 rg\n";
          } else {
            stream +=
              "0.93 0.97 0.93 rg\n";
          }

        } else {

          stream +=
            "0.96 0.96 0.96 rg\n";
        }

        stream +=
          `${left} ${item.y - 10} 505 25 re f\n`;

        stream +=
          "0 0 0 rg\n" +
          "BT\n" +
          "/F2 11 Tf\n" +
          `${left + 8} ${item.y} Td\n` +
          `(${pdfEscape(
            item.label + ":"
          )}) Tj\n` +
          "ET\n";

        stream +=
          "BT\n" +
          "/F1 13 Tf\n" +
          `${left + 100} ${item.y} Td\n` +
          `(${pdfEscape(textValue)}) Tj\n` +
          "ET\n";

        continue;
      }

      if (item.type === "table") {

        const cells =
          textValue
            .split("|")
            .map(x => x.trim())
            .filter(Boolean);

        const count =
          Math.max(cells.length, 1);

        const cellWidth =
          505 / count;

        const tableY =
          item.y - 12;

        if (colourful) {

          stream +=
            "0.88 0.93 0.99 rg\n";

        } else {

          stream +=
            "0.93 0.93 0.93 rg\n";
        }

        stream +=
          `${left} ${tableY} 505 22 re f\n`;

        stream +=
          "0.55 0.55 0.55 RG\n" +
          "0.6 w\n" +
          `${left} ${tableY} 505 22 re S\n`;

        for (
          let c = 1;
          c < count;
          c++
        ) {

          const lineX =
            left + c * cellWidth;

          stream +=
            `${lineX} ${tableY} m ` +
            `${lineX} ${tableY + 22} l S\n`;
        }

        cells.forEach(
          (cell, index) => {

            const cellX =
              left +
              index * cellWidth +
              5;

            stream +=
              "0 0 0 rg\n" +
              "BT\n" +
              "/F1 10 Tf\n" +
              `${cellX} ${item.y - 3} Td\n` +
              `(${pdfEscape(cell)}) Tj\n` +
              "ET\n";
          }
        );

        continue;
      }

      stream +=
        "0 0 0 rg\n" +
        "BT\n" +
        "/F1 14 Tf\n" +
        `${left} ${item.y} Td\n` +
        `(${pdfEscape(textValue)}) Tj\n` +
        "ET\n";
    }

   stream +=
  "0.45 0.45 0.45 rg\n" +
  "BT\n" +
  "/F5 9 Tf\n" +
  `${left} 30 Td\n` +
  "(Prepared by: SMATER CHAT AI) Tj\n" +
  "ET\n";

    stream +=
      "BT\n" +
      "/F1 9 Tf\n" +
      `${pageWidth - 90} 30 Td\n` +
      `(${pdfEscape(
        "Page " +
        (p + 1) +
        " of " +
        pages.length
      )}) Tj\n` +
      "ET\n";

    const length =
      Buffer.byteLength(
        stream,
        "binary"
      );

    objects[contentObject] =
      `<< /Length ${length} >>\n` +
      "stream\n" +
      stream +
      "\nendstream";

    objects[pageObject] =
      "<< /Type /Page " +
      "/Parent 2 0 R " +
      "/MediaBox [0 0 595 842] " +
      "/Resources << /Font << " +
      "/F1 3 0 R " +
      "/F2 4 0 R " +
      "/F5 5 0 R " +
      "/F6 6 0 R " +
      ">> >> " +
      `/Contents ${contentObject} 0 R >>`;
  }

  objects[2] =
    "<< /Type /Pages " +
    `/Kids [${pageNumbers
      .map(n => `${n} 0 R`)
      .join(" ")}] ` +
    `/Count ${pageNumbers.length} >>`;

  let pdf =
    "%PDF-1.4\n";

  const offsets = [];

  for (
    let i = 1;
    i < objects.length;
    i++
  ) {

    if (!objects[i]) continue;

    offsets[i] =
      Buffer.byteLength(
        pdf,
        "binary"
      );

    pdf +=
      `${i} 0 obj\n` +
      objects[i] +
      "\nendobj\n";
  }

  const xref =
    Buffer.byteLength(
      pdf,
      "binary"
    );

  const max =
    objects.length - 1;

  pdf +=
    `xref\n0 ${max + 1}\n`;

  pdf +=
    "0000000000 65535 f \n";

  for (
    let i = 1;
    i <= max;
    i++
  ) {

    pdf +=
      String(offsets[i] || 0)
        .padStart(10, "0") +
      " 00000 n \n";
  }

  pdf +=
    "trailer\n" +
    `<< /Size ${max + 1} /Root 1 0 R >>\n` +
    "startxref\n" +
    xref +
    "\n%%EOF";

  return pdf;
      }
function parseDocument(text) {

  const raw =
    String(text)
      .replace(/\r/g, "")
      .split("\n");

  const result = [];

  let number = 0;

  for (const original of raw) {

    const line =
      original.trim();

    if (!line) {
      result.push({
        type: "blank",
        text: ""
      });
      continue;
    }

    /*
      Markdown table row
    */
    if (
      line.startsWith("|") &&
      line.endsWith("|")
    ) {

      const cells =
        line
          .split("|")
          .map(x => x.trim());

      const separator =
        cells.every(
          x =>
            !x ||
            /^[-:]+$/.test(x)
        );

      if (!separator) {

        result.push({
          type: "table",
          text: cells.join("|")
        });

      }

      continue;
    }

    /*
      Main title
    */
    if (
      line.startsWith("# ")
    ) {

      result.push({
        type: "title",
        text:
          line
            .replace(/^# /, "")
            .trim()
      });

      continue;
    }

    /*
      Heading
    */
    if (
      line.startsWith("## ")
    ) {

      result.push({
        type: "heading",
        text:
          line
            .replace(/^## /, "")
            .trim()
      });

      continue;
    }

    /*
      Sub-heading
    */
    if (
      line.startsWith("### ")
    ) {

      result.push({
        type: "subheading",
        text:
          line
            .replace(/^### /, "")
            .trim()
      });

      continue;
    }

    /*
      Bullet point
    */
    if (
      /^[-*•]\s+/.test(line)
    ) {

      result.push({
        type: "bullet",
        text:
          line
            .replace(/^[-*•]\s+/, "")
            .trim()
      });

      continue;
    }

    /*
      Numbered list
    */
    const numbered =
      line.match(/^(\d+)[.)]\s+(.*)$/);

    if (numbered) {

      number =
        parseInt(
          numbered[1],
          10
        );

      result.push({
        type: "number",
        number,
        text:
          numbered[2].trim()
      });

      continue;
    }

    /*
      Chat format
    */
    const chat =
      line.match(
        /^(User|SMATER CHAT AI|AI|Assistant)\s*:\s*(.*)$/i
      );

    if (chat) {

      let label =
        chat[1];

      if (
        label.toLowerCase() ===
        "ai" ||
        label.toLowerCase() ===
        "assistant"
      ) {
        label =
          "SMATER CHAT AI";
      }

      result.push({
        type: "chat",
        label,
        text:
          chat[2].trim()
      });

      continue;
    }

    /*
      Normal paragraph
    */
    const words =
      line.split(/\s+/);

    let current = "";

    for (const word of words) {

      if (
        (current + " " + word)
          .trim()
          .length > 72
      ) {

        if (current) {

          result.push({
            type: "text",
            text: current
          });

        }

        current = word;

      } else {

        current =
          current
            ? current + " " + word
            : word;

      }
    }

    if (current) {

      result.push({
        type: "text",
        text: current
      });

    }
  }

  return result;
}


function pdfEscape(text) {

  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
