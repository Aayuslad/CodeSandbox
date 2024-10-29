import { Router } from "express";
import { getBatchTaskStatus, getLanguages, submitBatchTask } from "../controller/taskController";
const router = Router();

router.get("/languages", getLanguages);
router.post("/submit-batch-task", submitBatchTask);
router.get("/batch-task-status/:id", getBatchTaskStatus);

export default router;
