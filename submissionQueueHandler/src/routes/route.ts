import { Router } from "express";
import { getBatchTaskStatus, getLanguages, getTaskStatus, submitBatchTask, submitTask } from "../controller/taskController";
const router = Router();

router.get("/languages", getLanguages);
router.post("/submit-task", submitTask);
router.post("/submit-batch-task", submitBatchTask);
router.get("/task-status/:id", getTaskStatus);
router.get("/batch-task-status/:id", getBatchTaskStatus);

export default router;
