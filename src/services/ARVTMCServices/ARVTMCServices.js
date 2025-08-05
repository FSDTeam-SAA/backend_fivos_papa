import { emitGlobalNotification } from "../../jobs/notificationJob.js";
import { CompletedTargets } from "../../model/completedTargets.model.js";
import { GameQueue } from "../../model/gameQueue.model.js";
import { Notification } from "../../model/notification.model.js";

const addMinutes = (start, minutes) =>
  new Date(start.getTime() + minutes * 60000);

export const updateAddToQueueService = async (
  id,
  model,
  gameName,
  res,
  next
) => {
  try {
    const game = await model
      .findById(id)
      .select("isActive isPartiallyActive isCompleted isQueued status");

    if (!game) {
      return res.status(404).json({ status: false, message: "Game not found" });
    }

    if (game.isActive || game.isPartiallyActive) {
      return res
        .status(403)
        .json({ status: false, message: "Cannot queue an active game" });
    }

    if (game.isCompleted) {
      return res
        .status(403)
        .json({ status: false, message: "Cannot queue a completed game" });
    }

    if (game.isQueued) {
      return res
        .status(400)
        .json({ status: false, message: "Game is already queued" });
    }

    await model.findByIdAndUpdate(
      id,
      { isQueued: true, status: "queued" },
      { new: true }
    );

    const queueField = gameName === "TMC" ? "TMCTargets" : "ARVTargets";
    if (gameName === "TMC") {
      await GameQueue.findOneAndUpdate(
        { _id: "67da824e62d5a1b8cfece4c8" },
        { $push: { [queueField]: id } },
        { upsert: true }
      );
    } else if (gameName === "ARV") {
      await GameQueue.findOneAndUpdate(
        { _id: "67da824e62d5a1b8cfece4c8" },
        {
          $push: { [queueField]: id },
          $set: { isARVQueueActive: true },
        },
        { upsert: true }
      );
    }

    return res
      .status(200)
      .json({ status: true, message: "Added to queue successfully" });
  } catch (error) {
    next(error);
  }
};

export const startNextGameService = async (model, res, next, gameName) => {
  try {
    if (gameName === "ARV") {
      return res.status(403).json({
        status: false,
        message: "ARV games start automatically based on scheduled gameTime",
      });
    }

    // TMC logic remains unchanged
    const activeGame = await model.findOne({
      $or: [{ isActive: true }, { isPartiallyActive: true }],
    });
    if (activeGame) {
      return res
        .status(403)
        .json({ status: false, message: "Currently a game is running" });
    }

    const queueField = "TMCTargets";
    const queueActiveField = "isTMCQueueActive";
    const queue = await GameQueue.findById("67da824e62d5a1b8cfece4c8");
    if (!queue || !queue[queueField].length) {
      return res
        .status(404)
        .json({ status: false, message: "No game is queued right now" });
    }

    const nextGameId = queue[queueField][0];
    const nextGame = await model.findById(nextGameId).lean();
    if (!nextGame) {
      await GameQueue.findByIdAndUpdate("67da824e62d5a1b8cfece4c8", {
        $pull: { [queueField]: nextGameId },
      });
      return res
        .status(404)
        .json({ status: false, message: "Queued game not found" });
    }

    const now = new Date();
    let updateFields = {
      isActive: true,
      isPartiallyActive: true,
      status: "active",
      isQueued: false,
      startNotified: true,
      activeTMCGameTime: new Date(),
    };

    updateFields.startTime = now;
    updateFields.revealTime = addMinutes(now, nextGame.gameDuration);
    updateFields.bufferTime = addMinutes(
      updateFields.revealTime,
      nextGame.revealDuration
    );

    const startedGame = await model
      .findByIdAndUpdate(nextGameId, updateFields, { new: true })
      .select("-__v")
      .lean();

    await GameQueue.findByIdAndUpdate("67da824e62d5a1b8cfece4c8", {
      $pull: { [queueField]: nextGameId },
      $set: { [queueActiveField]: true },
    });

    await Notification.create({
      message: `New TMC game has started`,
      targetCode: startedGame.code,
    });

    return res.status(200).json({
      status: true,
      message: "Next game started successfully",
      data: startedGame,
    });
  } catch (error) {
    next(error);
  }
};

export const startNextGameFromCron = async (model, io, log, gameName) => {
  try {
    const queueField = gameName === "TMC" ? "TMCTargets" : "ARVTargets";
    const queueActiveField =
      gameName === "TMC" ? "isTMCQueueActive" : "isARVQueueActive";
    const queue = await GameQueue.findById("67da824e62d5a1b8cfece4c8");
    if (!queue || !queue[queueActiveField] || !queue[queueField].length) {
      return null;
    }

    const activeGame = await model
      .findOne({
        $or: [{ isActive: true }, { isPartiallyActive: true }],
        isCompleted: false,
      })
      .lean();
    if (activeGame) {
      return null;
    }

    const nextGameId = queue[queueField][0];
    const nextGame = await model.findById(nextGameId).lean();
    if (!nextGame) {
      await GameQueue.findByIdAndUpdate("67da824e62d5a1b8cfece4c8", {
        $pull: { [queueField]: nextGameId },
      });
      return null;
    }

    const now = new Date();
    let updateFields = {
      isActive: true,
      isPartiallyActive: true,
      status: "active",
      isQueued: false,
      startNotified: true,
    };

    if (gameName === "TMC") {
      updateFields.startTime = now;
      updateFields.activeTMCGameTime = new Date();
      updateFields.revealTime = addMinutes(now, nextGame.gameDuration);
      updateFields.bufferTime = addMinutes(
        updateFields.revealTime,
        nextGame.revealDuration
      );
    } else if (gameName === "ARV") {
      if (!nextGame.gameTime || !nextGame.revealTime || !nextGame.outcomeTime) {
        await GameQueue.findByIdAndUpdate("67da824e62d5a1b8cfece4c8", {
          $pull: { [queueField]: nextGameId },
        });
        return null;
      }
      if (new Date(nextGame.gameTime) > now) {
        return null; // Game is scheduled for the future
      }
      updateFields.gameTime = nextGame.gameTime;
      updateFields.revealTime = nextGame.revealTime;
      updateFields.outcomeTime = nextGame.outcomeTime;
      updateFields.activeARVGameTime = new Date();
    }

    const startedGame = await model
      .findByIdAndUpdate(nextGameId, updateFields, { new: true })
      .lean();

    await GameQueue.findByIdAndUpdate("67da824e62d5a1b8cfece4c8", {
      $pull: { [queueField]: nextGameId },
    });

    return startedGame;
  } catch (error) {
    log(`Error in startNextGameFromCron (${gameName}):`, error);
    return null;
  }
};

export const updateRemoveFromQueueService = async (
  id,
  model,
  gameName,
  res,
  next
) => {
  try {
    const game = await model.findById(id).lean();
    if (!game) {
      return res.status(404).json({ status: false, message: "Game not found" });
    }

    await model.findByIdAndUpdate(
      id,
      { isQueued: false, status: "inactive" },
      { new: true }
    );

    const queueField = gameName === "TMC" ? "TMCTargets" : "ARVTargets";
    await GameQueue.findByIdAndUpdate("67da824e62d5a1b8cfece4c8", {
      $pull: { [queueField]: id },
    });

    console.log(res);

    return res
      .status(200)
      .json({ status: true, message: "Removed from queue successfully" });
  } catch (error) {
    console.error("Error in updateRemoveFromQueueService:", error);
    next();
  }
};

export const updateGameTimeService = async (id, gameTime, model, res, next) => {
  try {
    const doc = await model
      .findById(id)
      .select("gameDuration revealDuration outcomeDuration bufferDuration");
    const now = new Date();
    const gameStart = new Date(gameTime);

    if (gameStart.getTime() < now.getTime()) {
      return res.status(400).json({
        status: false,
        message: "Game time cannot be in the past",
      });
    }

    let updateFields = { gameTime };
    if (model.modelName === "ARVTarget") {
      updateFields.revealTime = addMinutes(gameTime, doc.gameDuration);
      updateFields.outcomeTime = addMinutes(
        updateFields.revealTime,
        doc.revealDuration
      );
      updateFields.bufferTime = addMinutes(
        updateFields.outcomeTime,
        doc.outcomeDuration
      );
    } else if (model.modelName === "TMCTarget") {
      updateFields.startTime = gameTime;
      updateFields.revealTime = addMinutes(gameTime, doc.gameDuration);
      updateFields.bufferTime = addMinutes(
        updateFields.revealTime,
        doc.revealDuration
      );
    }

    await model.findByIdAndUpdate(id, updateFields, { new: true });
    return res
      .status(200)
      .json({ status: true, message: "Game time updated successfully" });
  } catch (error) {
    next(error);
  }
};

export const updateMakeInActiveService = async (id, model, res, next) => {
  try {
    const doc = await model
      .findById(id)
      .select("startTime gameTime gameDuration");
    const baseTime =
      model.modelName === "TMCTarget" ? doc.startTime : doc.gameTime;
    const gameEnd = addMinutes(new Date(baseTime), doc.gameDuration);

    if (Date.now() < gameEnd.getTime()) {
      return res.status(403).json({
        status: false,
        message: "Cannot make inactive before game end time",
      });
    }

    await model.findByIdAndUpdate(
      id,
      { isActive: false, isPartiallyActive: true, status: "revealed" },
      { new: true }
    );
    return res
      .status(200)
      .json({ status: true, message: "Game moved to revealed phase" });
  } catch (error) {
    next(error);
  }
};

export const updateMakeCompleteService = async (
  id,
  model,
  targetName,
  res,
  next
) => {
  try {
    const doc = await model.findById(id).lean();
    if (!doc) {
      return res.status(404).json({
        status: false,
        message: "Game not found",
      });
    }

    const baseTime =
      model.modelName === "TMCTarget" ? doc.startTime : doc.gameTime;
    const totalMinutes =
      model.modelName === "TMCTarget"
        ? doc.gameDuration + doc.revealDuration + doc.bufferDuration
        : doc.gameDuration +
          doc.revealDuration +
          doc.outcomeDuration +
          doc.bufferDuration;
    const bufferEnd = addMinutes(new Date(baseTime), totalMinutes);

    if (Date.now() < bufferEnd.getTime()) {
      return res.status(403).json({
        status: false,
        message: "Cannot complete game before buffer time ends",
      });
    }

    const updatedGame = await model
      .findByIdAndUpdate(
        id,
        {
          isCompleted: true,
          isActive: false,
          isPartiallyActive: false,
          status: "expired",
          bufferTime: new Date(),
        },
        { new: true }
      )
      .lean();

    await CompletedTargets.findOneAndUpdate(
      { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
      { $push: { [targetName]: id } },
      { upsert: true }
    );

    await Notification.deleteMany({ targetCode: doc.code });

    return res.status(200).json({
      status: true,
      message: "Target expired successfully",
      data: updatedGame,
    });
  } catch (error) {
    next(error);
  }
};

export const stopQueueService = async (res, next) => {
  try {
    const queue = await GameQueue.findById("67da824e62d5a1b8cfece4c8");
    if (!queue) {
      return res.status(404).json({
        status: false,
        message: "Game queue not found",
      });
    }

    queue.isTMCQueueActive = false;
    await queue.save();

    return res.status(200).json({
      status: true,
      message: "Game queue stopped successfully",
    });
  } catch (error) {
    next(error);
  }
};
