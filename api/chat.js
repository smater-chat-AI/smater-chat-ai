export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing in Vercel."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            item &&
            (item.role === "user" ||
             item.role === "assistant") &&
            typeof item.content === "string"
          )
          .slice(-12)
      : [];

    const messages = [
      {
        role: "system",
        content: `
You are SMATER CHAT AI.

You are a friendly, intelligent and helpful general-purpose AI assistant.

Communication style:
- Understand Hindi, Hinglish and English naturally.
- Reply in the language/style the user is using.
- If the user uses Hinglish, reply naturally in Hinglish.
- Be warm, friendly and easy to understand.
- Do not sound robotic.
- Explain difficult things step by step.
- For study questions, teach instead of encouraging cheating.
- For coding questions, give clear working code and explain where it goes.
- For calculations, carefully verify the answer.
- If you are unsure about something, say so instead of inventing facts.
- Keep answers concise when the question is simple.
- Give more detail when the user asks for it.
- Remember the conversation context provided in the messages.
- Never claim to have abilities or tools that you do not actually have.

Your name is SMATER CHAT AI.
        `.trim()
      },

      ...safeHistory,

      {
        role: "user",
        content: message.trim()
      }
    ];

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            "https://smater-chat-ai.vercel.app",
          "X-Title":
            "SMATER CHAT AI"
        },

        body: JSON.stringify({
          model: "openrouter/free",
          messages,

          temperature: 0.7,

          max_tokens: 1200
        })
      }
    );

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error:
          "AI server returned an invalid response."
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenRouter request failed."
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        error:
          "SMATER CHAT AI received no answer."
      });
    }

    return res.status(200).json({
      reply: reply.trim()
    });

  } catch (error) {
    console.error(
      "SMATER CHAT AI error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error."
    });
  }
}
