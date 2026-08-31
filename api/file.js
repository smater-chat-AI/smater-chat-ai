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
        : "txt";

    if (!prompt) {
      return res.status(400).json({
        error: "Please provide file content."
      });
    }

    if (!["txt", "html"].includes(type)) {
      return res.status(400).json({
        error:
          "This endpoint currently supports TXT and HTML files."
      });
    }

    if (type === "txt") {

      const content =
        "SMATER CHAT AI\n\n" + prompt;

      const file =
        "data:text/plain;charset=utf-8," +
        encodeURIComponent(content);

      return res.status(200).json({
        file,
        filename:
          "smater-chat-ai-document.txt",
        type: "text/plain"
      });
    }

    const escaped =
      prompt
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const html = `
<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<title>SMATER CHAT AI</title>
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
.content{
  white-space:pre-wrap;
}
</style>
</head>
<body>
<h1>SMATER CHAT AI</h1>
<div class="content">${escaped}</div>
</body>
</html>`;

    const file =
      "data:text/html;charset=utf-8," +
      encodeURIComponent(html);

    return res.status(200).json({
      file,
      filename:
        "smater-chat-ai-document.html",
      type: "text/html"
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
