import zod from "zod";

export const taskSchema = zod.object({
    id: zod.string(),
	languageId: zod.number(),
	code: zod.string(),
	input: zod.string().optional(),
});