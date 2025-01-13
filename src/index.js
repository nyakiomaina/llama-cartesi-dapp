// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");
const fetch = require("node-fetch");
const path = require("path");
const { getLlama, LlamaChatSession } = require("node-llama-cpp");
require('dotenv').config();

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

const llama_model_path = process.env.LLAMA_MODEL_PATH || path.join(__dirname, "models", "model.gguf");

// init llama...
let llama, model, context, session;
async function initializeLlama() {
    try {
      llama = await getLlama();
      model = await llama.loadModel({
        modelPath: llama_model_path
      });
      context = await model.createContext();
      session = new LlamaChatSession({
        contextSequence: context.getSequence()
      });
      console.log("LLaMA model loaded successfully.");
    } catch (error) {
      console.error("Error initializing LLaMA:", error);
      process.exit(1);
    }
  }

  initializeLlama();

  async function generateAIResponse(prompt) {
    if (!session) {
      throw new Error("LLaMA session not initialized.");
    }
    try {
      const response = await session.prompt(prompt);
      return response;
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
    }
  }

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));

  try {
    const userInput = data.user_input || "Hello!";
    console.log("Generating response for input:", userInput);
    const aiResponse = await generateAIResponse(userInput);
    console.log("Response:", aiResponse);

    data.ai_response = aiResponse;

    return "accept";
  } catch (error) {
    console.error("Error in handle_advance:", error);
    return "reject";
  }
}

async function handle_inspect(data) {
  console.log("Received inspect request data " + JSON.stringify(data));
  return "accept";
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {

  while (!session) {
      console.log("Waiting for the model to initialize...");
      await new Promise(resolve => setTimeout(resolve, 1000));
  }

  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();
      var handler = handlers[rollup_req["request_type"]];
      finish["status"] = await handler(rollup_req["data"]);
    }
  }
})();
