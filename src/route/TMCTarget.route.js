import express from "express";
import {
  createTMCTarget,
  getAllQueuedTMCTargets,
  getAllTMCTargets,
  getAllUnQueuedTMCTargets,
  updateAddToQueue,
  updateBufferTime,
  updateGameTime,
  updateRemoveFromQueue,
  updateMakeInactive,
  updateMakeComplete,
  startNextGame,
  getActiveTMCTarget,
} from "../controller/TMCTarget.controller.js";

const router = express.Router();

//admin
router.post("/create-TMCTarget", createTMCTarget);
router.get("/get-allTMCTargets", getAllTMCTargets);
router.get("/get-allQueuedTMCTargets", getAllQueuedTMCTargets);
router.get("/get-allUnQueuedTMCTargets", getAllUnQueuedTMCTargets);
router.get("/get-activeTMCTarget", getActiveTMCTarget);
router.patch("/update-TMCTarget-addToQueue/:id", updateAddToQueue);
router.patch("/update-TMCTarget-removeFromQueue/:id", updateRemoveFromQueue);
router.patch("/update-TMCTarget-bufferTime/:id", updateBufferTime);
router.patch("/update-TMCTarget-gameTime/:id", updateGameTime);
router.patch("/update-startNextGame", startNextGame);
router.patch("/update-TMCTarget-makeInactive/:id", updateMakeInactive);
router.patch("/update-TMCTarget-makeComplete/:id", updateMakeComplete);

export default router;
