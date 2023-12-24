import dotenv from "dotenv";
import { modelfusion, ollama, useTool } from "modelfusion";
import { mistralSingleToolCallPromptTemplate } from "../../tool/prompts/mistral";
import { calculator } from "../../tool/tools/calculator-tool";

dotenv.config();

modelfusion.setLogFormat("detailed-object");

async function main() {
  const { tool, args, toolCall, result } = await useTool(
    ollama
      .CompletionTextGenerator({
        model: "mistral",
        format: "json",
        temperature: 0,
        raw: true,
      })
      .withTextPrompt()
      .asToolCallGenerationModel(mistralSingleToolCallPromptTemplate),

    calculator,
    "What's fourteen times twelve?"
  );

  console.log(`Tool call`, toolCall);
  console.log(`Tool: ${tool}`);
  console.log(`Arguments: ${JSON.stringify(args)}`);
  console.log(`Result: ${result}`);
}

main().catch(console.error);
