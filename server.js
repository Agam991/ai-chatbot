const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

app.post("/api/chat", async (req, res) => {
    try {
        const { messages } = req.body;

        if (!Array.isArray(messages)) {
            return res.status(400).json({ error: "Messages are required" });
        }

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openrouter/free",
                max_tokens: 500,
                messages: [
                    {
                        role: "system",
                        content: `
You are a helpful AI assistant.

- Be concise and direct.
- Focus on useful information.
- Simple questions: 1-4 sentences.
- Use short paragraphs or bullet points for explanations.
- Avoid unnecessary introductions and repetition.
- Give detailed answers only when requested.
`
                    },
                    ...messages
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json({
            reply: response.data.choices[0].message.content
        });

    } catch (error) {
        console.error(
            "AI API Error:",
            error.response?.data || error.message
        );

        res.status(500).json({
            error: "Failed to get response from AI"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});