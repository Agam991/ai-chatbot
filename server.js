const dns = require('dns'); 
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express')
const app = express()

const dotenv = require('dotenv')
const mongoose = require('mongoose')
dotenv.config();   // dotenv.config() -> to load secretly from .env file into process.env

app.use(express.json())  //lets the server read JSON request
app.use(express.static("public")) //serves the files in public/ folder to the browser.

const PORT = process.env.PORT
const { GoogleGenAI } = require("@google/genai");

const connectDB = require('./db')
const Chat = require('./models/Chat')
connectDB()

app.post("/api/chat", async(req,res)=>{
    const {chatId} = req.body

    // const content = req.body.messages.at(-1).content  //this sends very last msg
    const content = req.body.messages.map(m => {
        return {
            role: m.role === "assistant" ? "model" : "user",   
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

    // history + the new reply, this is what gets saved
    const allMessages = [...req.body.messages, { role: "assistant", content: response.text }]

    let chat
    if (chatId) {
        // existing chat -> overwrite its messages
        chat = await Chat.findByIdAndUpdate(chatId, { messages: allMessages }, { new: true })
    } else {
        // first message of a new chat -> create it, title = start of first message
        chat = await Chat.create({ title: req.body.messages[0].content.slice(0, 40), messages: allMessages })
    }

    return res.json({        //make it into objects
        result: response.text, chatId: chat._id     
    })
})

// list of all chats for the sidebar (only title + date, newest first)
app.get("/api/chats", async(req,res)=>{
    const chats = await Chat.find({}, "title updatedAt").sort({ updatedAt: -1 })
    res.json(chats)
})

// one full chat, to reopen it
app.get("/api/chats/:id", async(req,res)=>{
    const chat = await Chat.findById(req.params.id)
    res.json(chat)
})

app.use((err, req, res, next) => {    //error handling (must stay after all routes)
    console.error(err);
    res.status(500).json({ error: "Failed to get reply" });
});

app.listen(PORT, ()=> console.log(`Server runnning at Port ${process.env.PORT}`))