import { z } from "zod";
import { createJsonErrorResponseHandler } from "../../core/api/postToApi";
import { zodSchema } from "../../core/schema/ZodSchema";

const llamaCppErrorDataSchema = z.object({
  error: z.string(),
});

export type LlamaCppErrorData = z.infer<typeof llamaCppErrorDataSchema>;

export const failedLlamaCppCallResponseHandler = createJsonErrorResponseHandler(
  {
    errorSchema: zodSchema(llamaCppErrorDataSchema),
    errorToMessage: (error) => error.error,
  }
);
