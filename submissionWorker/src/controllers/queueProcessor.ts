import { redisClient } from "../database/redisClient";
import { dockerCommands } from "../config/dockerCommands";
import { exec } from "child_process";
import { promisify } from "util";
import { taskSchema } from "../types/zodSchemas";

const execPromise = promisify(exec);

export async function processQueue() {
	while (redisClient.isOpen) {
		const taskData = await redisClient.blPop("task-execution-queue", 0);
		if (!taskData) continue;
		const parcedTaskData = JSON.parse(taskData.element);
		const parced = taskSchema.safeParse(parcedTaskData);
		if (!parced.success) {
			console.error("Invalid task data:", parced.error);
			continue;
		}

		const { id, languageId, code, input } = parced.data;

		const base64Code = Buffer.from(code).toString("base64");

		const command = dockerCommands[languageId]?.replace(/_CODE/, base64Code);
		if (!command) {
			console.error(`No command found for language ID ${languageId}`);
			await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: "languageId not found" }));
			continue;
		}

		try {
			const { stdout, stderr } = await execPromise(command);

			if (stderr) {
				await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: stderr }));
			} else {
				await redisClient.set(`result:${id}`, JSON.stringify({ status: "success", output: stdout }));
			}
		} catch (error) {
			//@ts-ignore
			if (error.stderr) {
				//@ts-ignore
				await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: error.stderr }));
			} else {
				await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: "Internal Server Error" }));
			}
		}
	}
}
