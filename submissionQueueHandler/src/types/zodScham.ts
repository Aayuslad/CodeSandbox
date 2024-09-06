import zod from "zod";

export const taskSchema = zod.object({
	languageId: zod.number(),
	code: zod.string(),
	input: zod.string().optional(),
});
