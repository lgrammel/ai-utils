import dotenv from "dotenv";
import {
  OpenAIChatMessage,
  OpenAIChatModel,
  setGlobalFunctionLogging,
  useToolsOrGenerateText,
} from "modelfusion";
import { calculator } from "./calculator-tool";

dotenv.config();

async function main() {
  setGlobalFunctionLogging("detailed-object");

  const { text, toolResults } = await useToolsOrGenerateText(
    new OpenAIChatModel({ model: "gpt-3.5-turbo" }),
    [calculator /* ... */],
    // Instead of using a curried function,
    // you can also work with the tools directly:
    (tools) => [
      OpenAIChatMessage.system(
        // Here the available tools are used to create
        // a more precise prompt that reduces errors:
        `You have ${tools.length} tools available (${tools
          .map((tool) => tool.name)
          .join(", ")}).`
      ),
      OpenAIChatMessage.user("What's fourteen times twelve?"),
      // OpenAIChatMessage.user("What's twelve plus 1234?"),
      // OpenAIChatMessage.user("Tell me about Berlin"),
    ]
  );

  if (text != null) {
    console.log(`TEXT: ${text}`);
    return;
  }

  for (const { tool, toolCall, result } of toolResults ?? []) {
    console.log(`Tool call`, toolCall);
    console.log(`Tool: ${tool}`);
    console.log(`Result: ${result}`);
  }
}

main().catch(console.error);