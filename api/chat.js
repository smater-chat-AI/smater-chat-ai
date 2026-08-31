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

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI service is not configured."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const language =
      typeof body.language === "string"
        ? body.language
        : "auto";

    const mode =
      typeof body.mode === "string"
        ? body.mode
        : "normal";

    const file = body.file || null;

    const systemPrompt = `
You are SMATER CHAT AI, a helpful general-purpose multilingual AI assistant.

Project tagline:
"Think smarter. Ask anything. Get more done."

Respond naturally in the user's language.
Support Hindi, Hinglish and English.

Be accurate, useful and honest.
Do not claim to have read or analyzed a file unless its actual contents
are present in the request.

Selected language: ${language}
Selected mode: ${mode}
`;

    const requestMessages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...messages
    ];

    /*
      File handling
    */

    if (file && file.data) {

      const fileType =
        String(file.type || "").toLowerCase();

      const fileName =
        String(file.name || "attached file");

      /*
        Images:
        Send the image as multimodal input.
      */

      if (fileType.startsWith("image/")) {

        const lastUserIndex =
          findLastUserMessage(requestMessages);

        if (lastUserIndex !== -1) {

          requestMessages[lastUserIndex] = {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `${requestMessages[lastUserIndex].content || ""}

The user attached an image named "${fileName}".
Analyze the image and answer the user's request about it.`
              },
              {
                type: "image_url",
                image_url: {
                  url: file.data
                }
              }
            ]
          };

        }

      } else {

        /*
          Text-based files:
          Decode data URL and put actual text into the prompt.
        */

        const extractedText =
          extractTextFromDataUrl(file.data);

        if (extractedText) {

          const lastUserIndex =
            findLastUserMessage(requestMessages);

          if (lastUserIndex !== -1) {

            requestMessages[lastUserIndex] = {
              role: "user",
              content:
                `${requestMessages[lastUserIndex].content || ""}

Attached file: ${fileName}

FILE CONTENT:
${extractedText}

Use the actual file content above when answering.`
            };

          }

        } else {

          /*
            Do not pretend that an unsupported binary
            file was successfully read.
          */

          const lastUserIndex =
            findLastUserMessage(requestMessages);

          if (lastUserIndex !== -1) {

            requestMessages[lastUserIndex] = {
              role: "user",
              content:
                `${requestMessages[lastUserIndex].content || ""}

The user attached "${fileName}", but its contents
could not be extracted by the current file reader.
Do not invent its contents.`
            };

          }

        }

      }

    }

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
              "https://smater-chat-ai.vercel.app",

            "X-Title":
              "SMATER CHAT AI"
          },

          body: JSON.stringify({

            model:
              "openrouter/free",

            messages:
              requestMessages,

            temperature:
              mode === "thinking"
                ? 0.2
                : mode === "creative"
                  ? 0.8
                  : 0.5

          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      console.error(
        "OpenRouter error:",
        response.status
      );

      return res.status(502).json({
        error:
          "AI service request failed."
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {

      return res.status(502).json({
        error:
          "AI returned an empty response."
      });
    }

    return res.status(200).json({
      text: answer.trim()
    });

  } catch (error) {

    console.error(
      "Chat API error:",
      error?.message || error
    );

    return res.status(500).json({
      error:
        "Something went wrong while processing your request."
    });
  }
}


/* ---------------- HELPERS ---------------- */

function findLastUserMessage(messages) {

  for (let i = messages.length - 1; i >= 0; i--) {

    if (messages[i]?.role === "user") {
      return i;
    }

  }

  return -1;
}


function extractTextFromDataUrl(dataUrl) {

  if (typeof dataUrl !== "string") {
    return "";
  }

  /*
    Expected format:

    data:text/plain;base64,SGVsbG8=
  */

  const comma =
    dataUrl.indexOf(",");

  if (comma === -1) {
    return "";
  }

  const metadata =
    dataUrl.slice(0, comma);

  const encoded =
    dataUrl.slice(comma + 1);

  if (
    !metadata.includes("base64") ||
    !(
      metadata.includes("text/") ||
      metadata.includes("application/json") ||
      metadata.includes("text/csv")
    )
  ) {
    return "";
  }

  try {

    return Buffer
      .from(encoded, "base64")
      .toString("utf8")
      .slice(0, 50000);

  } catch (error) {

    console.error(
      "File decode error:",
      error?.message || error
    );

    return "";
  }
}
