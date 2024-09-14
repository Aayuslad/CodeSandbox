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
	code: zod.string(),
	inputs: zod.string().optional(),
	expectedOutput: zod.string().optional(),
});

export const BatchSubmissionSchema = zod.object({
	submissionId: zod.string(),
	callbackUrl: zod.string().optional(),
	languageId: zod.number(),
	tasks: zod.array(batchTaskSchema),
});
