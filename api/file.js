export default async function handler(req, res) {

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
        : "txt";

    if (!prompt) {
      return res.status(400).json({
        error: "File content is required."
      });
    }

    if (!["pdf", "txt", "html"].includes(type)) {
      return res.status(400).json({
        error: "Unsupported file type."
      });
    }

    const safeText =
      prompt
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const title =
      "SMATER CHAT AI Document";

    if (type === "txt") {

      const content =
        `SMATER CHAT AI\n\n${prompt}`;

      const file =
        "data:text/plain;charset=utf-8," +
        encodeURIComponent(content);

      return res.status(200).json({
        file: file,
        filename:
          "smater-chat-ai-document.txt"
      });
    }

    if (type === "html") {

      const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
body{
  font-family:Arial,sans-serif;
  max-width:800px;
  margin:40px auto;
  padding:20px;
  line-height:1.6;
}
h1{
  margin-bottom:25px;
}
</style>
</head>
<body>
<h1>${title}</h1>
<p>${safeText.replace(/\n/g,"<br>")}</p>
</body>
</html>`;

      const file =
        "data:text/html;charset=utf-8," +
        encodeURIComponent(html);

      return res.status(200).json({
        file: file,
        filename:
          "smater-chat-ai-document.html"
      });
    }

    /*
      PDF:
      Return a print-ready HTML document.
      The browser can print/save it as PDF
      without requiring a paid API.
    */

    const pdfHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
@page{
  size:A4;
  margin:20mm;
}
body{
  font-family:Arial,sans-serif;
  line-height:1.6;
  color:#111;
}
h1{
  font-size:24px;
  margin-bottom:25px;
}
.content{
  white-space:pre-wrap;
}
</style>
</head>
<body>
<h1>${title}</h1>
<div class="content">${safeText}</div>
</body>
</html>`;

    const file =
      "data:text/html;charset=utf-8," +
      encodeURIComponent(pdfHtml);

    return res.status(200).json({
      file: file,
      filename:
        "smater-chat-ai-document.html",
      pdfReady: true
    });

  } catch (error) {

    console.error(
      "File API error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Something went wrong while creating the file."
    });
  }
}
