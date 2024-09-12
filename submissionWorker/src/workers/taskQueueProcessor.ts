import { redisClient } from "../database/redisClient";
import { dockerCommands } from "../config/dockerCommands";
import { exec } from "child_process";
import { promisify } from "util";
import { taskSchema } from "../types/zodSchemas";
import axios from "axios";

const execPromise = promisify(exec);

export async function taskProcessQueue() {
	while (redisClient.isOpen) {
		const taskData = await redisClient.blPop("task-execution-queue", 0);
		if (!taskData) continue;
		const parcedTaskData = JSON.parse(taskData.element);
		const parced = taskSchema.safeParse(parcedTaskData);
		if (!parced.success) {
			console.error("Invalid task data:", parced.error);
			continue;
		}

		const { id, languageId, code, expectedOutput, callbackUrl } = parced.data;

		const command = dockerCommands[languageId]?.replace(/_CODE/, code);
		if (!command) {
			console.error(`No command found for language ID ${languageId}`);
			await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: "languageId not found" }));
			continue;
		}

		try {
			const { stdout, stderr } = await execPromise(command);

			if (stderr) {
				await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: stderr, accepted: false }));

				if (callbackUrl)
					await axios.post(callbackUrl, {
						output: stderr,
						accepted: false,
					});
			} else {
				await redisClient.set(
					`result:${id}`,
					JSON.stringify({ status: "success", output: stdout, accepted: stdout == expectedOutput }),
				);

				if (callbackUrl)
					await axios.post(callbackUrl, {
						output: stdout,
						accepted: stdout == expectedOutput,
					});
			}
		} catch (error) {
			//@ts-ignore
			if (error.stderr) {
				//@ts-ignore
				await redisClient.set(`result:${id}`, JSON.stringify({ status: "error", output: error.stderr, accepted: false }));

				if (callbackUrl)
					await axios.post(callbackUrl, {
						//@ts-ignore
						output: error.stderr,
						accepted: false,
					});
			} else {
				await redisClient.set(
					`result:${id}`,
					JSON.stringify({ status: "error", output: "Internal Server Error", accepted: false }),
				);

				if (callbackUrl)
					await axios.post(callbackUrl, {
						output: "Internal Server Error",
						accepted: false,
					});
			}
		}
	}
}
