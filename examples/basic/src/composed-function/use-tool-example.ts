import {
  OpenAIChatFunctionPrompt,
  OpenAIChatMessage,
  OpenAIChatModel,
  Tool,
  useTool,
} from "ai-utils.js";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

(async () => {
  const multiplyTool = new Tool({
    name: "multiply" as const,
    description: "Multiply two numbers",

    inputSchema: z.object({
      a: z.number().describe("The first number."),
      b: z.number().describe("The second number."),
    }),

    execute: async ({ a, b }) => a * b,
  });

  const { tool, parameters, result } = await useTool(
    new OpenAIChatModel({ model: "gpt-3.5-turbo" }),
    multiplyTool,
    OpenAIChatFunctionPrompt.forToolCurried([
      OpenAIChatMessage.user("What's fourteen to the power of two?"),
    ])
  );

  console.log(`Tool: ${tool}`);
  console.log(`Parameters: ${JSON.stringify(parameters)}`);
  console.log(`Result: ${result}`);
})();
