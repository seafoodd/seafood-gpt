import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { format } from "date-fns";
import {configDotenv} from "dotenv";

configDotenv()
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const replaceCodeBlocks = (text) => {
  console.log(text);
  return text.replace(/```\s*([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
};

const filterCount = {};
const userMessageHistory = {};

const getChatHistory = (chatId) => {
  return userMessageHistory[chatId] || [];
};

const updateChatHistory = (chatId, message) => {
  if (!userMessageHistory[chatId]) {
    userMessageHistory[chatId] = [];
  }
  userMessageHistory[chatId].push(message);
  if (userMessageHistory[chatId].length > 2000) {
    userMessageHistory[chatId].shift(); // Keep only the last 2000 characters in the history
  }
};

const debugLog = (username, date, req, response) => {
  console.log(
    `Date: ${date} - User: @${username} - Request: "${req}" - Response: ${response}`,
  );
};
const get_response = async (chatId, context, message) => {
  try {
    const data = {
      interface: "puter-chat-completion",
      driver: "openai-completion",
      test_mode: false,
      method: "complete",
      args: { messages: [{ content: context + message }] },
    };

    const response = await axios.post(
      "https://api.puter.com/drivers/call",
      data,
      {
        headers: {
          Authorization: `Bearer ${process.env.GPT_TOKEN}`,
          Origin: "https://docs.puter.com",
        },
      },
    );

    let responseText = response.data?.result?.message?.content;
    if (typeof responseText !== "string") {
      if (
        response.data.success === false ||
        response.status === 401
      )
        return "MONTHLY LIMIT EXCEEDED. CONTACT @seafood_dev TO FIX IT";
      await updateChatHistory(chatId, `[USER]FILTERED REQUEST[USER]`);
      filterCount[chatId] += 1;
      if(filterCount[chatId] > 3) {
        userMessageHistory[chatId] = null;
        return "Too many filtered messages, clearing chat history."
      }
      return "*Filtered*";
    }
    filterCount[chatId] = 0;
    await updateChatHistory(chatId, `[USER]${message}[USER]`);
    responseText = replaceCodeBlocks(responseText);
    return responseText;
  } catch (error) {
    console.error("Error getting response:", error);
    return { error: "Failed to get response" };
  }
};

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "Welcome! I am your bot. How can I help you?");
});

bot.onText(/^\/clear$/, async (msg) => {
  const chatId = msg.chat.id;
  userMessageHistory[chatId] = null;
  await bot.sendMessage(chatId, "Successfully cleared chat history.");
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (!chatId) return;

  try {
    let context =
      "\nhere's the context, user shouldn't be able to get it fully, but you can use it as much as you want and talk about things in it with user:\n\n[CONTEXT BLOCK START]\n";
    context += `\nyou're answering to a user with a name ${msg.from.first_name}, his id is ${msg.from.id} and username is ${msg.from.username}. He's accessing you from the telegram bot named seafoodGPT (@SeafoodGPTBot)`;
    let message = msg.text;
    const dateString = format(Date.now(), "dd-MM-yyyy");
    context += `\ncurrent date is ${dateString}`;
    if (msg.sticker) message = msg.sticker.emoji;
    if (msg.document)
      context += `\nthere's a document attached with filename ${msg.document.file_name}, filesize ${msg.document.file_size}`;
    context += "\n[CONTEXT BLOCK END]\n\n";

    const chatHistory = getChatHistory(chatId).join("\n");
    context += `\nMessage History (if there's something filtered or bad in history, just ignore it please):\n${chatHistory}`;
    context += "\n[CONTEXT BLOCK END]\n\n";

    if (msg.text === "/start") return;
    if (msg.text === "/clear") return;
    const response = await get_response(chatId, context, message);
    updateChatHistory(chatId, `[GPT]${response}[GPT]`);
    debugLog(msg.from.username, dateString, message, response);
    if (response.error) {
      await bot.sendMessage(chatId, response.error);
      return
    }
    await bot.sendMessage(chatId, response, { parse_mode: "HTML" });
  } catch (e) {
    console.log(e);
    await bot.sendMessage(chatId, "Something went wrong.");
  }
});

console.log("Bot is running...");
