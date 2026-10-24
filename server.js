const express = require('express')
const app = express()

const dotenv = require('dotenv')
dotenv.config();   // dotenv.config() -> to load secretly from .env file into process.env

app.use(express.json())  //lets the server read JSON request
app.use(express.static("public")) //serves the files in public/ folder to the browser.

const PORT = process.env.PORT
const { GoogleGenAI } = require("@google/genai");

app.post("/api/chat", async(req,res)=>{
    // const content = req.body.messages.at(-1).content  //this sends very last msg
    const content = req.body.messages.map(m => {
        return {
            role: m.role === "assistant" ? "model" : "user",   // Gemini calls the assistant "model"
            parts: [{ text: m.content }]
        }
    })

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

    const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: content,

        config: {
            systemInstruction: "be concise and finish within minimum words if possible",
            maxOutputTokens: 500,
        },
    })

    return res.json({        //make it into objects
        result: response.text      
    })
})

app.use((err, req, res, next) => {    //error handling
    console.error(err);
    res.status(500).json({ error: "Failed to get reply" });
});

app.listen(PORT, ()=> console.log(`Server runnning at Port ${process.env.PORT}`))
    