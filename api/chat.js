export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content: "You are SMATER CHAT AI, a helpful, clear and friendly general-purpose AI assistant."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "AI request failed"
      });
    }

    return res.status(200).json({
      reply: data?.choices?.[0]?.message?.content || "No response received."
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error"
    });
  }
}
