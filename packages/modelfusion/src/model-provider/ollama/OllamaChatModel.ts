import { z } from "zod";
import { FunctionCallOptions } from "../../core/FunctionOptions";
import { ApiCallError } from "../../core/api/ApiCallError";
import { ApiConfiguration } from "../../core/api/ApiConfiguration";
import { callWithRetryAndThrottle } from "../../core/api/callWithRetryAndThrottle";
import { ResponseHandler, postJsonToApi } from "../../core/api/postToApi";
import { zodSchema } from "../../core/schema/ZodSchema";
import { safeParseJSON } from "../../core/schema/parseJSON";
import { validateTypes } from "../../core/schema/validateTypes";
import { AbstractModel } from "../../model-function/AbstractModel";
import {
  FlexibleObjectFromTextPromptTemplate,
  ObjectFromTextPromptTemplate,
} from "../../model-function/generate-object/ObjectFromTextPromptTemplate";
import { ObjectFromTextStreamingModel } from "../../model-function/generate-object/ObjectFromTextStreamingModel";
import { PromptTemplateTextStreamingModel } from "../../model-function/generate-text/PromptTemplateTextStreamingModel";
import {
  TextStreamingBaseModel,
  TextStreamingModel,
  textGenerationModelProperties,
} from "../../model-function/generate-text/TextGenerationModel";
import { TextGenerationPromptTemplate } from "../../model-function/generate-text/TextGenerationPromptTemplate";
import {
  TextGenerationToolCallModel,
  ToolCallPromptTemplate,
} from "../../tool/generate-tool-call/TextGenerationToolCallModel";
import { TextGenerationToolCallsModel } from "../../tool/generate-tool-calls/TextGenerationToolCallsModel";
import { ToolCallsPromptTemplate } from "../../tool/generate-tool-calls/ToolCallsPromptTemplate";
import { createJsonStreamResponseHandler } from "../../util/streaming/createJsonStreamResponseHandler";
import { OllamaApiConfiguration } from "./OllamaApiConfiguration";
import { chat, instruction, text } from "./OllamaChatPromptTemplate";
import { failedOllamaCallResponseHandler } from "./OllamaError";
import { OllamaTextGenerationSettings } from "./OllamaTextGenerationSettings";

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;

  /**
   Images. Supports base64-encoded `png` and `jpeg` images up to 100MB in size.
   */
  images?: Array<string>;
};

export type OllamaChatPrompt = Array<OllamaChatMessage>;

export interface OllamaChatModelSettings extends OllamaTextGenerationSettings {
  api?: ApiConfiguration;
}

/**
 * Text generation model that uses the Ollama chat API.
 */
export class OllamaChatModel
  extends AbstractModel<OllamaChatModelSettings>
  implements TextStreamingBaseModel<OllamaChatPrompt, OllamaChatModelSettings>
{
  constructor(settings: OllamaChatModelSettings) {
    super({ settings });
  }

  readonly provider = "ollama";
  get modelName() {
    return this.settings.model;
  }

  readonly tokenizer = undefined;
  readonly countPromptTokens = undefined;
  readonly contextWindowSize = undefined;

  async callAPI<RESPONSE>(
    prompt: OllamaChatPrompt,
    callOptions: FunctionCallOptions,
    options: {
      responseFormat: OllamaChatResponseFormatType<RESPONSE>;
    }
  ): Promise<RESPONSE> {
    const { responseFormat } = options;
    const api = this.settings.api ?? new OllamaApiConfiguration();
    const abortSignal = callOptions.run?.abortSignal;

    return callWithRetryAndThrottle({
      retry: api.retry,
      throttle: api.throttle,
      call: async () =>
        postJsonToApi({
          url: api.assembleUrl(`/api/chat`),
          headers: api.headers({
            functionType: callOptions.functionType,
            functionId: callOptions.functionId,
            run: callOptions.run,
            callId: callOptions.callId,
          }),
          body: {
            stream: responseFormat.stream,
            model: this.settings.model,
            messages: prompt,
            format: this.settings.format,
            options: {
              mirostat: this.settings.mirostat,
              mirostat_eta: this.settings.mirostatEta,
              mirostat_tau: this.settings.mirostatTau,
              num_gpu: this.settings.numGpu,
              num_gqa: this.settings.numGqa,
              num_predict: this.settings.maxGenerationTokens,
              num_threads: this.settings.numThreads,
              repeat_last_n: this.settings.repeatLastN,
              repeat_penalty: this.settings.repeatPenalty,
              seed: this.settings.seed,
              stop: this.settings.stopSequences,
              temperature: this.settings.temperature,
              tfs_z: this.settings.tfsZ,
              top_k: this.settings.topK,
              top_p: this.settings.topP,
            },
            template: this.settings.template,
          },
          failedResponseHandler: failedOllamaCallResponseHandler,
          successfulResponseHandler: responseFormat.handler,
          abortSignal,
        }),
    });
  }

  get settingsForEvent(): Partial<OllamaChatModelSettings> {
    const eventSettingProperties: Array<string> = [
      ...textGenerationModelProperties,

      "temperature",
      "mirostat",
      "mirostatEta",
      "mirostatTau",
      "numGqa",
      "numGpu",
      "numThreads",
      "repeatLastN",
      "repeatPenalty",
      "seed",
      "tfsZ",
      "topK",
      "topP",
      "template",
      "format",
    ] satisfies (keyof OllamaChatModelSettings)[];

    return Object.fromEntries(
      Object.entries(this.settings).filter(([key]) =>
        eventSettingProperties.includes(key)
      )
    );
  }

  async doGenerateTexts(
    prompt: OllamaChatPrompt,
    options: FunctionCallOptions
  ) {
    return this.processTextGenerationResponse(
      await this.callAPI(prompt, options, {
        responseFormat: OllamaChatResponseFormat.json,
      })
    );
  }

  restoreGeneratedTexts(rawResponse: unknown) {
    return this.processTextGenerationResponse(
      validateTypes({
        value: rawResponse,
        schema: zodSchema(ollamaChatResponseSchema),
      })
    );
  }

  private processTextGenerationResponse(rawResponse: OllamaChatResponse) {
    return {
      rawResponse,
      textGenerationResults: [
        {
          text: rawResponse.message.content,
          finishReason: "unknown" as const,
        },
      ],
    };
  }

  doStreamText(prompt: OllamaChatPrompt, options: FunctionCallOptions) {
    return this.callAPI(prompt, options, {
      responseFormat: OllamaChatResponseFormat.deltaIterable,
    });
  }

  extractTextDelta(delta: unknown) {
    const chunk = delta as OllamaChatStreamChunk;
    return chunk.done === true ? undefined : chunk.message.content;
  }

  asToolCallGenerationModel<INPUT_PROMPT>(
    promptTemplate: ToolCallPromptTemplate<INPUT_PROMPT, OllamaChatPrompt>
  ) {
    return new TextGenerationToolCallModel({
      model: this,
      format: promptTemplate,
    });
  }

  asToolCallsOrTextGenerationModel<INPUT_PROMPT>(
    promptTemplate: ToolCallsPromptTemplate<INPUT_PROMPT, OllamaChatPrompt>
  ) {
    return new TextGenerationToolCallsModel({
      model: this,
      template: promptTemplate,
    });
  }

  asObjectGenerationModel<INPUT_PROMPT, OllamaChatPrompt>(
    promptTemplate:
      | ObjectFromTextPromptTemplate<INPUT_PROMPT, OllamaChatPrompt>
      | FlexibleObjectFromTextPromptTemplate<INPUT_PROMPT, unknown>
  ) {
    return "adaptModel" in promptTemplate
      ? new ObjectFromTextStreamingModel({
          model: promptTemplate.adaptModel(this),
          template: promptTemplate,
        })
      : new ObjectFromTextStreamingModel({
          model: this as TextStreamingModel<OllamaChatPrompt>,
          template: promptTemplate,
        });
  }

  withTextPrompt() {
    return this.withPromptTemplate(text());
  }

  withInstructionPrompt() {
    return this.withPromptTemplate(instruction());
  }

  withChatPrompt() {
    return this.withPromptTemplate(chat());
  }

  withPromptTemplate<INPUT_PROMPT>(
    promptTemplate: TextGenerationPromptTemplate<INPUT_PROMPT, OllamaChatPrompt>
  ): PromptTemplateTextStreamingModel<
    INPUT_PROMPT,
    OllamaChatPrompt,
    OllamaChatModelSettings,
    this
  > {
    return new PromptTemplateTextStreamingModel({
      model: this.withSettings({
        stopSequences: [
          ...(this.settings.stopSequences ?? []),
          ...promptTemplate.stopSequences,
        ],
      }),
      promptTemplate,
    });
  }

  withJsonOutput() {
    return this.withSettings({ format: "json" });
  }

  withSettings(additionalSettings: Partial<OllamaChatModelSettings>) {
    return new OllamaChatModel(
      Object.assign({}, this.settings, additionalSettings)
    ) as this;
  }
}

const ollamaChatResponseSchema = z.object({
  model: z.string(),
  created_at: z.string(),
  done: z.literal(true),
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
  total_duration: z.number(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number(),
  eval_duration: z.number(),
});

export type OllamaChatResponse = z.infer<typeof ollamaChatResponseSchema>;

const ollamaChatStreamChunkSchema = z.discriminatedUnion("done", [
  z.object({
    done: z.literal(false),
    model: z.string(),
    created_at: z.string(),
    message: z.object({
      role: z.string(),
      content: z.string(),
    }),
  }),
  z.object({
    done: z.literal(true),
    model: z.string(),
    created_at: z.string(),
    total_duration: z.number(),
    load_duration: z.number().optional(),
    prompt_eval_count: z.number().optional(),
    prompt_eval_duration: z.number().optional(),
    eval_count: z.number(),
    eval_duration: z.number(),
  }),
]);

export type OllamaChatStreamChunk = z.infer<typeof ollamaChatStreamChunkSchema>;

export type OllamaChatResponseFormatType<T> = {
  stream: boolean;
  handler: ResponseHandler<T>;
};

export const OllamaChatResponseFormat = {
  /**
   * Returns the response as a JSON object.
   */
  json: {
    stream: false,
    handler: (async ({ response, url, requestBodyValues }) => {
      const responseBody = await response.text();

      const parsedResult = safeParseJSON({
        text: responseBody,
        schema: zodSchema(
          z.union([
            ollamaChatResponseSchema,
            z.object({
              done: z.literal(false),
              model: z.string(),
              created_at: z.string(),
            }),
          ])
        ),
      });

      if (!parsedResult.success) {
        throw new ApiCallError({
          message: "Invalid JSON response",
          cause: parsedResult.error,
          statusCode: response.status,
          responseBody,
          url,
          requestBodyValues,
        });
      }

      if (parsedResult.value.done === false) {
        throw new ApiCallError({
          message: "Incomplete Ollama response received",
          statusCode: response.status,
          responseBody,
          url,
          requestBodyValues,
          isRetryable: true,
        });
      }

      return parsedResult.value;
    }) satisfies ResponseHandler<OllamaChatResponse>,
  } satisfies OllamaChatResponseFormatType<OllamaChatResponse>,

  /**
   * Returns an async iterable over the full deltas (all choices, including full current state at time of event)
   * of the response stream.
   */
  deltaIterable: {
    stream: true,
    handler: createJsonStreamResponseHandler(
      zodSchema(ollamaChatStreamChunkSchema)
    ),
  },
};
