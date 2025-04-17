#!/usr/bin/env node

// Script to check if environment variables are properly loaded
require("dotenv").config();

console.log("Environment Check Tool for Codex CLI");
console.log("====================================");

// Check OpenAI API Key
const openai_key = process.env.OPENAI_API_KEY;
console.log(
  "OpenAI API Key:",
  openai_key
    ? `Found (${openai_key.substring(0, 5)}...${openai_key.substring(
        openai_key.length - 4,
      )})`
    : "❌ Not found",
);

// Check Google/Gemini API Key
const google_key = process.env.GOOGLE_API_KEY;
console.log(
  "Google API Key:",
  google_key
    ? `Found (${google_key.substring(0, 5)}...${google_key.substring(
        google_key.length - 4,
      )})`
    : "❌ Not found",
);

// Show all available environment variables related to Codex
console.log("\nAll Environment Variables:");
console.log("-------------------------");
Object.keys(process.env)
  .filter(
    (key) =>
      key.includes("OPENAI") ||
      key.includes("GOOGLE") ||
      key.includes("GEMINI") ||
      key.includes("CODEX"),
  )
  .forEach((key) => {
    const value = process.env[key];
    if (key.includes("KEY") || key.includes("SECRET")) {
      // Mask sensitive values
      console.log(
        `${key}: ${value.substring(0, 3)}...${value.substring(
          value.length - 3,
        )}`,
      );
    } else {
      console.log(`${key}: ${value}`);
    }
  });

console.log("\nDotenv Loading Test");
console.log("-----------------");
try {
  const fs = require("fs");
  const path = require("path");
  const dotenv = require("dotenv");

  // Try to load from .env file in the current directory
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    console.log(`.env file found at: ${envPath}`);
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    console.log("Contents (keys only):", Object.keys(envConfig).join(", "));

    if (envConfig["GEMINI_API_KEY"]) {
      console.log(
        "GEMINI_API_KEY in .env file:",
        `${envConfig["GEMINI_API_KEY"].substring(0, 5)}...${envConfig[
          "GEMINI_API_KEY"
        ].substring(envConfig["GEMINI_API_KEY"].length - 4)}`,
      );
    } else {
      console.log("GEMINI_API_KEY not found in .env file");
    }
  } else {
    console.log("❌ .env file not found!");
  }
} catch (error) {
  console.error("Error checking .env file:", error);
}

console.log("\nInstructions:");
console.log("--------------");
console.log("1. Make sure you have a .env file in your project root");
console.log("2. The .env file should contain GEMINI_API_KEY=your_api_key_here");
console.log("3. Run 'node check-env.js' to verify environment variables");
console.log(
  "4. When running codex, specify the model: codex --model gemini-2.5-pro-preview-03-25",
);
