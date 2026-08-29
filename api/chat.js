export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing in Vercel"
      });
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://smater-chat-ai.vercel.app",
          "X-Title": "SMATER CHAT AI"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            {
              role: "system",
              content:
                "You are SMATER CHAT AI, a helpful, clear and friendly general-purpose AI assistant."
            },
            {
              role: "user",
              content: message.trim()
            }
          ]
        })
      }
    );

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: `OpenRouter returned a non-JSON response: ${rawText.slice(0, 300)}`
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenRouter request failed"
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        error: "OpenRouter returned no AI message"
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("SMATER CHAT AI error:", error);

    return res.status(500).json({
      error: error?.message || "Server error"
    });
  }
}
