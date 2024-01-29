import { FunctionOptions } from "../../core/FunctionOptions";
import { Model, ModelSettings } from "../../model-function/Model";
import { ToolDefinition } from "../ToolDefinition";

export interface ToolCallsGenerationModelSettings extends ModelSettings {}

export interface ToolCallsGenerationModel<
  PROMPT,
  SETTINGS extends ToolCallsGenerationModelSettings,
> extends Model<SETTINGS> {
  doGenerateToolCalls(
    tools: Array<ToolDefinition<string, unknown>>,
    prompt: PROMPT,
    options?: FunctionOptions
  ): PromiseLike<{
    rawResponse: unknown;
    text: string | null;
    toolCalls: Array<{ id: string; name: string; args: unknown }> | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
}
