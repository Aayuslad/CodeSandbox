import zod from "zod";

export const batchTaskSchema = zod.object({
	id: zod.number(),
	stdin: zod.string(),
	inputs: zod.string().optional(),
	expectedOutput: zod.string().optional(),
});

export const BatchSubmissionSchema = zod.object({
	submissionId: zod.string(),
	languageId: zod.number(),
	code: zod.string().base64(),
	callbackUrl: zod.string().optional(),
	functionStructure: zod.string(),
	testCaseURL: zod.string(),
});
	