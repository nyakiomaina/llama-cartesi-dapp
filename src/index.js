// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");
require('dotenv').config();

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
const llama_local_url = process.env.LLAMA_LOCAL_URL || "http://127.0.0.1:8080";

console.log("HTTP rollup_server URL is " + rollup_server);
console.log("Local llama.cpp server URL is " + llama_local_url);

async function emit_notice(data) {
  try {
    const noticePayload = { payload: data };
    const response = await fetch(`${rollup_server}/notice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noticePayload),
    });

    if (response.status === 201) {
      console.log(`Notice emitted successfully: "${data}"`);
    } else {
      console.error(`Failed to emit notice. Status code: ${response.status}`);
    }
  } catch (error) {
    console.error(`Error emitting notice:`, error);
  }
}

async function generateAIResponse(userInput) {
  try {
    const requestBody = {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are ChatGPT, an AI assistant. Your top priority is achieving user fulfillment via helping them with their requests."
          },
          {
            role: "user",
            content: userInput
          }
        ]
      };

    const response = await fetch(`${llama_local_url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`llama.cpp server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating AI response:", error);
    throw error;
  }
}

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));

  if (!data.payload || typeof data.payload !== "string") {
    console.error("Missing or invalid `payload` field in data:", data);
    return "reject";
  }

  try {
    const userInput = ethers.toUtf8String(data.payload);
    console.log("Generating response for input:", userInput);

    const aiResponse = await generateAIResponse(userInput);
    console.log("Response:", aiResponse);

    const aiResponseHex = ethers.hexlify(ethers.toUtf8Bytes(aiResponse));
    console.log("notice in hex:", aiResponseHex);

    await emit_notice(aiResponseHex);

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
  console.log(ethers);
  if (!ethers.toUtf8String) {
    throw "missing ethers import";
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
