import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

function cleanText(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .trim();
}

function safeFileName(name = "smater-chat-ai") {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80) || "smater-chat-ai"
  );
}

/*
 * ---------------------------------------------------------
 * LANGUAGE DETECTION
 * ---------------------------------------------------------
 *
 * Default:
 * English
 *
 * "Hindi PDF":
 * Hindi
 *
 * "Hindi + English PDF":
 * Both
 */

function detectLanguage(prompt = "") {
  const text = String(prompt).toLowerCase();

  const hindi =
    text.includes("hindi") ||
    text.includes("हिंदी") ||
    text.includes("हिन्दी") ||
    text.includes("देवनागरी");

  const english =
    text.includes("english") ||
    text.includes("अंग्रेजी") ||
    text.includes("अंग्रेज़ी");

  if (hindi && english) {
    return "both";
  }

  if (hindi) {
    return "hindi";
  }

  return "english";
}

/*
 * ---------------------------------------------------------
 * COLOUR DETECTION
 * ---------------------------------------------------------
 *
 * PDF stays normal black/white unless the user explicitly
 * asks for colour.
 */

function isColourfulRequest(prompt = "") {
  const text = String(prompt).toLowerCase();

  return (
    text.includes("colourful") ||
    text.includes("colorful") ||
    text.includes("colour pdf") ||
    text.includes("color pdf") ||
    text.includes("colour document") ||
    text.includes("color document") ||
    text.includes("colourful pdf") ||
    text.includes("colorful pdf") ||
    text.includes("professional colourful") ||
    text.includes("professional colorful")
  );
}

/*
 * ---------------------------------------------------------
 * FONT RESOLUTION
 * ---------------------------------------------------------
 *
 * We use Node's package resolver instead of hard-coding
 * /var/task/node_modules paths.
 */

function resolveFont(packageName, fileName) {
  try {
    return require.resolve(
      `${packageName}/files/${fileName}`
    );
  } catch (error) {
    return null;
  }
}

function findFonts() {
  const englishRegular =
    resolveFont(
      "@fontsource/noto-sans",
      "noto-sans-latin-400-normal.woff2"
    );

  const englishBold =
    resolveFont(
      "@fontsource/noto-sans",
      "noto-sans-latin-700-normal.woff2"
    );

  const hindiRegular =
    resolveFont(
      "@fontsource/noto-sans-devanagari",
      "noto-sans-devanagari-400-normal.woff2"
    );

  const hindiBold =
    resolveFont(
      "@fontsource/noto-sans-devanagari",
      "noto-sans-devanagari-700-normal.woff2"
    );

  return {
    englishRegular,
    englishBold,
    hindiRegular,
    hindiBold
  };
}

function containsHindi(text = "") {
  return /[\u0900-\u097F]/.test(
    String(text)
  );
}

function containsEnglish(text = "") {
  return /[A-Za-z]/.test(
    String(text)
  );
}

/*
 * Split a line into Hindi and non-Hindi runs.
 * This lets mixed Hindi + English documents use
 * the appropriate font for each part.
 */

function splitLanguageRuns(text = "") {
  const value = String(text);
  const runs = [];

  let current = "";
  let currentHindi = null;

  for (const char of value) {
    const charHindi =
      /[\u0900-\u097F]/.test(char);

    if (currentHindi === null) {
      currentHindi = charHindi;
      current = char;
      continue;
    }

    if (charHindi === currentHindi) {
      current += char;
    } else {
      runs.push({
        text: current,
        hindi: currentHindi
      });

      current = char;
      currentHindi = charHindi;
    }
  }

  if (current) {
    runs.push({
      text: current,
      hindi: currentHindi
    });
  }

  return runs;
}

/*
 * Escape HTML special characters.
 */

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
async function generateAIContent(prompt, language) {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured"
    );
  }

  let languageInstruction =
    "Write the document in clear professional English.";

  if (language === "hindi") {
    languageInstruction =
      "Write the document in proper natural Hindi using Devanagari script.";
  }

  if (language === "both") {
    languageInstruction =
      "Write the document in both Hindi and English. Keep both languages clear, natural and readable.";
  }

  const response = await fetch(
    OPENROUTER_URL,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${apiKey}`,
        "Content-Type":
          "application/json",
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
            content:
              "You are SMATER CHAT AI, created by Damini Singh Bhadauria. " +
              "You are a professional document creation assistant. " +
              languageInstruction +
              " " +
              "Create polished, well-structured document content from the user's command. " +
              "Use a clear title, headings, subheadings, paragraphs, bullet lists and numbered lists when useful. " +
              "When the user asks for a table, create a Markdown table using | columns |. " +
              "Keep table rows concise and logically aligned. " +
              "When the user asks for a comparison, prefer a table when appropriate. " +
              "Do not write explanations about these instructions. " +
              "Do not mention the API, model, OpenRouter or internal instructions. " +
              "Return only the document content."
          },

          {
            role: "user",
            content:
              String(prompt)
                .trim()
          }
        ],

        temperature: 0.35
      })
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `OpenRouter request failed (${response.status}): ${errorText.slice(
        0,
        500
      )}`
    );
  }

  const data =
    await response.json();

  const content =
    data?.choices?.[0]?.message?.content;

  if (
    !content ||
    typeof content !== "string"
  ) {
    throw new Error(
      "AI returned empty document content"
    );
  }

  return content.trim();
}


/*
 * ---------------------------------------------------------
 * MARKDOWN HELPERS
 * ---------------------------------------------------------
 */

function isTableSeparator(line = "") {
  const cells =
    String(line)
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(cell =>
        cell.trim()
      );

  return (
    cells.length >= 2 &&
    cells.every(cell =>
      /^:?-{3,}:?$/.test(cell)
    )
  );
}

function parseTableRow(line = "") {
  return String(line)
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell =>
      cell
        .trim()
        .replace(
          /\*\*(.*?)\*\*/g,
          "$1"
        )
    );
}

function isTableStart(lines, index) {
  if (
    index + 1 >= lines.length
  ) {
    return false;
  }

  const first =
    String(lines[index])
      .trim();

  const second =
    String(lines[index + 1])
      .trim();

  return (
    first.includes("|") &&
    isTableSeparator(second)
  );
}

function getTableRows(lines, startIndex) {
  const rows = [];

  let index =
    startIndex;

  while (
    index < lines.length
  ) {
    const line =
      String(lines[index])
        .trim();

    if (
      !line ||
      !line.includes("|")
    ) {
      break;
    }

    rows.push(
      parseTableRow(line)
    );

    index++;
  }

  return {
    rows,
    nextIndex: index
  };
}


/*
 * ---------------------------------------------------------
 * TEXT / MARKDOWN CLEANING
 * ---------------------------------------------------------
 */

function removeMarkdownFormatting(
  text = ""
) {
  return String(text)
    .replace(
      /\*\*(.*?)\*\*/g,
      "$1"
    )
    .replace(
      /__(.*?)__/g,
      "$1"
    )
    .replace(
      /^`(.*?)`$/g,
      "$1"
    )
    .trim();
}


/*
 * Convert common Markdown heading
 * syntax into clean heading text.
 */

function getHeadingInfo(
  line = ""
) {
  const match =
    String(line)
      .trim()
      .match(
        /^(#{1,3})\s+(.+)$/
      );

  if (!match) {
    return null;
  }

  return {
    level:
      match[1].length,

    text:
      removeMarkdownFormatting(
        match[2]
      )
  };
}


/*
 * Detect bullet lines.
 */

function getBulletText(
  line = ""
) {
  const match =
    String(line)
      .trim()
      .match(
        /^[-*•]\s+(.+)$/
      );

  return match
    ? removeMarkdownFormatting(
        match[1]
      )
    : null;
}


/*
 * Detect numbered list lines.
 */

function getNumberedText(
  line = ""
) {
  const match =
    String(line)
      .trim()
      .match(
        /^(\d+)[.)]\s+(.+)$/
      );

  if (!match) {
    return null;
  }

  return {
    number: match[1],
    text:
      removeMarkdownFormatting(
        match[2]
      )
  };
}
function buildPdf(
  content,
  title,
  language,
  colourful
) {
  return new Promise(
    (resolve, reject) => {
      try {
        const fonts =
          findFonts();

        if (!fonts.englishRegular) {
          throw new Error(
            "English PDF font not found"
          );
        }

        if (
          (language === "hindi" ||
            language === "both") &&
          !fonts.hindiRegular
        ) {
          throw new Error(
            "Hindi PDF font not found"
          );
        }

        const doc =
          new PDFDocument({
            size: "A4",
            margins: {
              top: 60,
              bottom: 60,
              left: 50,
              right: 50
            },
            bufferPages: true
          });

        const chunks = [];

        doc.on(
          "data",
          chunk => {
            chunks.push(chunk);
          }
        );

        doc.on(
          "error",
          reject
        );

        doc.on(
          "end",
          () => {
            try {
              resolve(
                Buffer.concat(
                  chunks
                )
              );
            } catch (error) {
              reject(error);
            }
          }
        );

        /*
         * Register fonts
         */
        doc.registerFont(
          "SMATER_EN",
          fonts.englishRegular
        );

        if (fonts.englishBold) {
          doc.registerFont(
            "SMATER_EN_BOLD",
            fonts.englishBold
          );
        }

        if (fonts.hindiRegular) {
          doc.registerFont(
            "SMATER_HI",
            fonts.hindiRegular
          );
        }

        if (fonts.hindiBold) {
          doc.registerFont(
            "SMATER_HI_BOLD",
            fonts.hindiBold
          );
        }

        const pageWidth =
          doc.page.width -
          doc.page.margins.left -
          doc.page.margins.right;

        const normalColor =
          "#111111";

        const accentColor =
          colourful
            ? "#1f4e79"
            : "#111111";

        const tableHeaderColor =
          colourful
            ? "#dbeafe"
            : "#eeeeee";

        const tableBorderColor =
          colourful
            ? "#7aa7d9"
            : "#999999";


        function setFont(
          text = "",
          bold = false
        ) {
          const hindi =
            containsHindi(text);

          if (
            hindi &&
            fonts.hindiRegular
          ) {
            if (
              bold &&
              fonts.hindiBold
            ) {
              doc.font(
                "SMATER_HI_BOLD"
              );
            } else {
              doc.font(
                "SMATER_HI"
              );
            }

            return;
          }

          if (
            bold &&
            fonts.englishBold
          ) {
            doc.font(
              "SMATER_EN_BOLD"
            );
          } else {
            doc.font(
              "SMATER_EN"
            );
          }
        }


        function writeMixed(
          text,
          options = {}
        ) {
          const {
            fontSize = 11,
            bold = false,
            color = normalColor,
            align = "left",
            lineGap = 4
          } = options;

          const value =
            String(text || "");

          const runs =
            splitLanguageRuns(
              value
            );

          if (
            runs.length === 1
          ) {
            setFont(
              value,
              bold
            );

            doc
              .fontSize(fontSize)
              .fillColor(color)
              .text(
                value,
                {
                  width:
                    pageWidth,
                  align,
                  lineGap
                }
              );

            return;
          }

          for (
            let i = 0;
            i < runs.length;
            i++
          ) {
            const run =
              runs[i];

            setFont(
              run.text,
              bold
            );

            doc
              .fontSize(fontSize)
              .fillColor(color)
              .text(
                run.text,
                {
                  width:
                    pageWidth,
                  align,
                  lineGap,
                  continued:
                    i <
                    runs.length - 1
                }
              );
          }

          doc.text("");
        }


        function drawHeading(
          text,
          level = 2
        ) {
          const size =
            level === 1
              ? 20
              : level === 2
                ? 16
                : 13;

          doc.moveDown(
            0.35
          );

          writeMixed(
            text,
            {
              fontSize:
                size,
              bold: true,
              color:
                accentColor,
              lineGap: 5
            }
          );

          doc.moveDown(
            0.2
          );
        }


        function drawParagraph(
          text
        ) {
          writeMixed(
            text,
            {
              fontSize: 11,
              color:
                normalColor,
              lineGap: 4
            }
          );

          doc.moveDown(
            0.12
          );
        }


        function drawBullet(
          text
        ) {
          const x =
            doc.page.margins.left;

          const bulletWidth =
            18;

          const textWidth =
            pageWidth -
            bulletWidth;

          setFont(
            text,
            false
          );

          doc
            .fontSize(11)
            .fillColor(
              normalColor
            );

          doc.text(
            "•",
            x,
            doc.y,
            {
              width:
                bulletWidth
            }
          );

          const currentY =
            doc.y;

          doc.text(
            text,
            x +
              bulletWidth,
            currentY,
            {
              width:
                textWidth,
              lineGap: 3
            }
          );

          doc.moveDown(
            0.08
          );
        }


        function drawNumbered(
          number,
          text
        ) {
          const x =
            doc.page.margins.left;

          const numberWidth =
            25;

          setFont(
            text,
            false
          );

          doc
            .fontSize(11)
            .fillColor(
              normalColor
            );

          doc.text(
            `${number}.`,
            x,
            doc.y,
            {
              width:
                numberWidth
            }
          );

          const currentY =
            doc.y;

          doc.text(
            text,
            x +
              numberWidth,
            currentY,
            {
              width:
                pageWidth -
                numberWidth,
              lineGap: 3
            }
          );

          doc.moveDown(
            0.08
          );
        }


        /*
         * Professional table renderer
         */
        function drawTable(
          rows
        ) {
          if (
            !rows ||
            rows.length < 2
          ) {
            return;
          }

          const columnCount =
            Math.max(
              ...rows.map(
                row =>
                  row.length
              )
            );

          const normalized =
            rows.map(row => {
              const copy =
                row.slice();

              while (
                copy.length <
                columnCount
              ) {
                copy.push("");
              }

              return copy;
            });

          const tableWidth =
            pageWidth;

          const columnWidth =
            tableWidth /
            columnCount;

          const cellPadding =
            6;

          const fontSize = 9;

          for (
            let r = 0;
            r < normalized.length;
            r++
          ) {
            const row =
              normalized[r];

            const isHeader =
              r === 0;

            let rowHeight = 28;

            for (
              let c = 0;
              c < columnCount;
              c++
            ) {
              const value =
                removeMarkdownFormatting(
                  row[c] || ""
                );

              setFont(
                value,
                isHeader
              );

              const height =
                doc.heightOfString(
                  value,
                  {
                    width:
                      Math.max(
                        20,
                        columnWidth -
                          cellPadding *
                            2
                      ),
                    fontSize,
                    lineGap: 2
                  }
                ) +
                cellPadding *
                  2;

              rowHeight =
                Math.max(
                  rowHeight,
                  height
                );
            }

            /*
             * Start a new page if the row
             * will not fit.
             */
            if (
              doc.y +
                rowHeight >
              doc.page.height -
                doc.page.margins.bottom
            ) {
              doc.addPage();
            }

            const startY =
              doc.y;

            for (
              let c = 0;
              c < columnCount;
              c++
            ) {
              const value =
                removeMarkdownFormatting(
                  row[c] || ""
                );

              const startX =
                doc.page.margins.left +
                c *
                  columnWidth;

              doc
                .save()
                .lineWidth(0.6)
                .strokeColor(
                  tableBorderColor
                );

              if (
                isHeader
              ) {
                doc
                  .rect(
                    startX,
                    startY,
                    columnWidth,
                    rowHeight
                  )
                  .fill(
                    tableHeaderColor
                  );

                doc
                  .rect(
                    startX,
                    startY,
                    columnWidth,
                    rowHeight
                  )
                  .stroke();
              } else {
                doc
                  .rect(
                    startX,
                    startY,
                    columnWidth,
                    rowHeight
                  )
                  .stroke();
              }

              setFont(
                value,
                isHeader
              );

              doc
                .fontSize(
                  fontSize
                )
                .fillColor(
                  isHeader
                    ? accentColor
                    : normalColor
                )
                .text(
                  value,
                  startX +
                    cellPadding,
                  startY +
                    cellPadding,
                  {
                    width:
                      Math.max(
                        20,
                        columnWidth -
                          cellPadding *
                            2
                      ),
                    height:
                      rowHeight -
                      cellPadding *
                        2,
                    align:
                      "left",
                    lineGap: 2
                  }
                );

              doc.restore();
            }

            doc.y =
              startY +
              rowHeight;
          }

          doc.moveDown(
            0.45
          );
        }


        /*
         * TITLE
         */
        writeMixed(
          title ||
            "SMATER CHAT AI",
          {
            fontSize: 21,
            bold: true,
            color:
              accentColor,
            align:
              "center",
            lineGap: 5
          }
        );

        doc.moveDown(
          0.8
        );


        /*
         * CONTENT
         */
        const lines =
          cleanText(
            content
          ).split("\n");

        for (
          let i = 0;
          i < lines.length;
        ) {
          const raw =
            lines[i];

          const line =
            raw.trim();

          if (!line) {
            doc.moveDown(
              0.35
            );

            i++;
            continue;
          }


          /*
           * TABLE
           */
          if (
            isTableStart(
              lines,
              i
            )
          ) {
            const table =
              getTableRows(
                lines,
                i
              );

            drawTable(
              table.rows
            );

            i =
              table.nextIndex;

            continue;
          }


          /*
           * HEADING
           */
          const heading =
            getHeadingInfo(
              line
            );

          if (heading) {
            drawHeading(
              heading.text,
              heading.level
            );

            i++;
            continue;
          }


          /*
           * BULLET
           */
          const bullet =
            getBulletText(
              line
            );

          if (bullet) {
            drawBullet(
              bullet
            );

            i++;
            continue;
          }


          /*
           * NUMBERED LIST
           */
          const numbered =
            getNumberedText(
              line
            );

          if (numbered) {
            drawNumbered(
              numbered.number,
              numbered.text
            );

            i++;
            continue;
          }


          /*
           * NORMAL PARAGRAPH
           */
          drawParagraph(
            removeMarkdownFormatting(
              line
            )
          );

          i++;
        }
                /*
         * Prepared by line
         */
        doc.moveDown(0.8);

        writeMixed(
          "Prepared by: SMATER CHAT AI",
          {
            fontSize: 9,
            bold: false,
            color: "#666666",
            align: "center",
            lineGap: 2
          }
        );


        /*
         * PAGE NUMBERS
         */
        const pageRange =
          doc.bufferedPageRange();

        for (
          let pageIndex = 0;
          pageIndex < pageRange.count;
          pageIndex++
        ) {
          doc.switchToPage(
            pageRange.start +
              pageIndex
          );

          setFont(
            "Page",
            false
          );

          doc
            .fontSize(8)
            .fillColor("#666666")
            .text(
              `Page ${pageIndex + 1}`,
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


/*
 * ---------------------------------------------------------
 * TEXT FILE
 * ---------------------------------------------------------
 */

function makeTextFile(
  content,
  title
) {
  const safeTitle =
    safeFileName(
      title ||
        "smater-chat-ai"
    );

  const text = [
    title ||
      "SMATER CHAT AI",
    "",
    cleanText(content),
    "",
    "Prepared by: SMATER CHAT AI"
  ].join("\n");

  return {
    fileName:
      `${safeTitle}.txt`,

    mimeType:
      "text/plain;charset=utf-8",

    buffer:
      Buffer.from(
        text,
        "utf8"
      )
  };
}


/*
 * ---------------------------------------------------------
 * HTML FILE
 * ---------------------------------------------------------
 */

function makeHtmlFile(
  content,
  title,
  colourful = false
) {
  const safeTitle =
    escapeHtml(
      title ||
        "SMATER CHAT AI"
    );

  const accent =
    colourful
      ? "#1f4e79"
      : "#111111";

  const lines =
    cleanText(
      content
    ).split("\n");

  const htmlParts = [];

  for (
    let i = 0;
    i < lines.length;
  ) {
    const line =
      lines[i].trim();

    if (!line) {
      htmlParts.push(
        '<div class="space"></div>'
      );

      i++;
      continue;
    }


    /*
     * TABLE
     */
    if (
      isTableStart(
        lines,
        i
      )
    ) {
      const table =
        getTableRows(
          lines,
          i
        );

      const rows =
        table.rows;

      let html =
        '<table><tbody>';

      for (
        let r = 0;
        r < rows.length;
        r++
      ) {
        const cells =
          rows[r];

        html += "<tr>";

        for (
          const cell of cells
        ) {
          const tag =
            r === 0
              ? "th"
              : "td";

          html +=
            `<${tag}>${escapeHtml(
              removeMarkdownFormatting(
                cell
              )
            )}</${tag}>`;
        }

        html += "</tr>";
      }

      html +=
        "</tbody></table>";

      htmlParts.push(
        html
      );

      i =
        table.nextIndex;

      continue;
    }


    /*
     * HEADING
     */
    const heading =
      getHeadingInfo(
        line
      );

    if (heading) {
      const tag =
        `h${heading.level}`;

      htmlParts.push(
        `<${tag}>${escapeHtml(
          heading.text
        )}</${tag}>`
      );

      i++;
      continue;
    }


    /*
     * BULLET
     */
    const bullet =
      getBulletText(
        line
      );

    if (bullet) {
      htmlParts.push(
        `<div class="bullet">• ${escapeHtml(
          bullet
        )}</div>`
      );

      i++;
      continue;
    }


    /*
     * NUMBERED LIST
     */
    const numbered =
      getNumberedText(
        line
      );

    if (numbered) {
      htmlParts.push(
        `<div class="number">${escapeHtml(
          numbered.number
        )}. ${escapeHtml(
          numbered.text
        )}</div>`
      );

      i++;
      continue;
    }


    /*
     * NORMAL PARAGRAPH
     */
    htmlParts.push(
      `<p>${escapeHtml(
        removeMarkdownFormatting(
          line
        )
      )}</p>`
    );

    i++;
  }

  const body =
    htmlParts.join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>${safeTitle}</title>

<style>
body{
  font-family:Arial,sans-serif;
  margin:40px;
  color:#111;
  line-height:1.6;
}

h1{
  text-align:center;
  color:${accent};
  font-size:28px;
  margin-bottom:30px;
}

h2{
  color:${accent};
  font-size:21px;
  margin-top:24px;
}

h3{
  color:${accent};
  font-size:17px;
  margin-top:20px;
}

p{
  font-size:15px;
}

.bullet,
.number{
  margin:7px 0;
  font-size:15px;
}

.space{
  height:10px;
}

table{
  width:100%;
  border-collapse:collapse;
  margin:18px 0;
}

th,
td{
  border:1px solid #999;
  padding:8px;
  text-align:left;
}

th{
  background:${colourful
    ? "#dbeafe"
    : "#eeeeee"};
  color:${accent};
}

.footer{
  margin-top:35px;
  text-align:center;
  color:#666;
  font-size:12px;
}
</style>
</head>

<body>

<h1>${safeTitle}</h1>

${body}

<div class="footer">
Prepared by: SMATER CHAT AI
</div>

</body>
</html>`;

  return html;
}


/*
 * ---------------------------------------------------------
 * API HANDLER
 * ---------------------------------------------------------
 */

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error:
        "Method not allowed"
    });
  }

  try {
    const body =
      req.body || {};

    const prompt =
      String(
        body.prompt ||
        body.description ||
        body.text ||
        ""
      ).trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error:
          "Please provide a document description."
      });
    }


    /*
     * Language is controlled by the command.
     */
    const language =
      detectLanguage(
        prompt
      );


    /*
     * Colour is only enabled when explicitly requested.
     */
    const colourful =
      isColourfulRequest(
        prompt
      );


    /*
     * Requested format.
     * Default = PDF.
     */
    const format =
      String(
        body.format ||
        "pdf"
      ).toLowerCase();


    /*
     * Optional title from frontend.
     */
    const title =
      String(
        body.title ||
        "SMATER CHAT AI"
      ).trim() ||
      "SMATER CHAT AI";


    /*
     * Generate professional AI content.
     */
    const content =
      await generateAIContent(
        prompt,
        language
      );


    /*
     * TEXT
     */
    if (
      format === "txt" ||
      format === "text"
    ) {
      const file =
        makeTextFile(
          content,
          title
        );

      return res.status(200).json({
        success: true,
        fileName:
          file.fileName,
        mimeType:
          file.mimeType,
        data:
          file.buffer.toString(
            "base64"
          )
      });
    }


    /*
     * HTML
     */
    if (
      format === "html" ||
      format === "htm"
    ) {
      const html =
        makeHtmlFile(
          content,
          title,
          colourful
        );

      return res.status(200).json({
        success: true,
        fileName:
          `${safeFileName(
            title
          )}.html`,
        mimeType:
          "text/html;charset=utf-8",
        data:
          Buffer.from(
            html,
            "utf8"
          ).toString(
            "base64"
          )
      });
    }


    /*
     * PDF
     */
    const pdf =
      await buildPdf(
        content,
        title,
        language,
        colourful
      );

    return res.status(200).json({
      success: true,
      fileName:
        `${safeFileName(
          title
        )}.pdf`,
      mimeType:
        "application/pdf",
      data:
        pdf.toString(
          "base64"
        )
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
// ============================================================
// FINAL FONT RESOLUTION FIX
// Paste this block at the VERY END of api/file.js
// ============================================================

try {
  const __fontFs = await import("node:fs");
  const __fontPath = await import("node:path");
  const __fontModule = await import("node:module");

  const __fs = __fontFs.default || __fontFs;
  const __path = __fontPath.default || __fontPath;
  const __createRequire = __fontModule.createRequire;

  const __require = __createRequire(import.meta.url);

  function __findFont(packageName, fileName) {
    const candidates = [];

    // 1. Resolve package itself, then go to /files
    try {
      const packageEntry = __require.resolve(packageName);
      const packageDir = __path.dirname(packageEntry);

      candidates.push(
        __path.join(packageDir, "files", fileName)
      );

      candidates.push(
        __path.join(
          __path.dirname(packageDir),
          packageName,
          "files",
          fileName
        )
      );
    } catch (_) {}

    // 2. Vercel / Node common locations
    candidates.push(
      __path.join(
        process.cwd(),
        "node_modules",
        packageName,
        "files",
        fileName
      )
    );

    candidates.push(
      __path.join(
        "/var/task/node_modules",
        packageName,
        "files",
        fileName
      )
    );

    for (const file of candidates) {
      try {
        if (__fs.existsSync(file)) {
          return file;
        }
      } catch (_) {}
    }

    return null;
  }

  // Override the old resolver safely.
  resolveFont = function (packageName, fileName) {
    return __findFont(packageName, fileName);
  };

  console.log("SMATER CHAT AI: final font resolver installed");

} catch (fontFixError) {
  console.error(
    "SMATER CHAT AI: final font resolver setup failed:",
    fontFixError
  );
}
// ============================================================
// SMATER CHAT AI - FINAL STATIC FONT PATH FIX
// PASTE AT THE VERY END OF api/file.js
// ============================================================

try {
  const __staticFont = (relativePath) => {
    try {
      const url = new URL(
        relativePath,
        import.meta.url
      );

      const filePath =
        url.pathname;

      if (fs.existsSync(filePath)) {
        return filePath;
      }
    } catch (_) {}

    return null;
  };

  const __fontMap = {
    "@fontsource/noto-sans": {
      "noto-sans-latin-400-normal.woff2":
        "../node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",

      "noto-sans-latin-700-normal.woff2":
        "../node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2"
    },

    "@fontsource/noto-sans-devanagari": {
      "noto-sans-devanagari-400-normal.woff2":
        "../node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-400-normal.woff2",

      "noto-sans-devanagari-700-normal.woff2":
        "../node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-700-normal.woff2"
    }
  };

  resolveFont = function (
    packageName,
    fileName
  ) {
    const relative =
      __fontMap?.[packageName]?.[fileName];

    if (relative) {
      const found =
        __staticFont(relative);

      if (found) {
        console.log(
          "SMATER CHAT AI: font found:",
          packageName,
          fileName
        );

        return found;
      }
    }

    return null;
  };

  console.log(
    "SMATER CHAT AI: static font resolver installed"
  );

} catch (error) {
  console.error(
    "SMATER CHAT AI: static font resolver failed:",
    error
  );
}
// ============================================================
// SMATER CHAT AI - PDF FONT FALLBACK FIX
// ============================================================

try {
  const __fs = await import("node:fs");
  const __path = await import("node:path");

  const fs = __fs.default || __fs;
  const path = __path.default || __path;

  function findSystemFont(names) {
    const locations = [
      "/usr/share/fonts/truetype/dejavu",
      "/usr/share/fonts/truetype/noto",
      "/usr/share/fonts/opentype/noto",
      "/usr/share/fonts"
    ];

    for (const location of locations) {
      for (const name of names) {
        const file = path.join(location, name);

        try {
          if (fs.existsSync(file)) {
            return file;
          }
        } catch (_) {}
      }
    }

    return null;
  }

  const systemEnglish =
    findSystemFont([
      "DejaVuSans.ttf",
      "DejaVuSans.ttf"
    ]);

  if (systemEnglish) {
    const originalFindFonts = findFonts;

    findFonts = function () {
      const fonts = originalFindFonts();

      return {
        ...fonts,
        englishRegular:
          fonts.englishRegular || systemEnglish,
        englishBold:
          fonts.englishBold || systemEnglish
      };
    };

    console.log(
      "SMATER CHAT AI: English PDF fallback font enabled"
    );
  } else {
    console.log(
      "SMATER CHAT AI: no system English fallback font found"
    );
  }

} catch (pdfFontFallbackError) {
  console.error(
    "SMATER CHAT AI: PDF fallback setup failed:",
    pdfFontFallbackError
  );
}
