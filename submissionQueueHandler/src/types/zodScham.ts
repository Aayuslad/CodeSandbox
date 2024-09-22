import zod from "zod";

export const taskSchema = zod.object({
	languageId: zod.number(),
	code: zod.string(),
	input: zod.string().optional(),
	expectedOutput: zod.string().optional(),
	callbackUrl: zod.string().optional(),
});

export const batchTaskSchema = zod.object({
	id: zod.number(),
	stdin: zod.string().base64(),
	inputs: zod.string().optional(),
	expectedOutput: zod.string().optional(),
});

export const BatchSubmissionSchema = zod.object({
	submissionId: zod.string(),
	languageId: zod.number(),
	code: zod.string().base64(),
	callbackUrl: zod.string().optional(),
	tasks: zod.array(batchTaskSchema),
});
