import { CompletedTargets } from "../../model/completedTargets.model.js";
import { Notification } from "../../model/notification.model.js";

const checkIsGameActive = async (model, id, message, res, next) => {
  try {
    let isGameActive;

    if (id) {
      isGameActive = await model.findOne({
        _id: id,
        $or: [{ isActive: true }, { isPartiallyActive: true }],
      });
    } else {
      isGameActive = await model.findOne({
        $or: [{ isActive: true }, { isPartiallyActive: true }],
      });
    }

    if (isGameActive) {
      return res.status(403).json({
        status: false,
        message,
      });
    }
  } catch (error) {
    next(error);
  }
};

export const startNextGameService = async (model, res, next, gameName) => {
  try {
    await checkIsGameActive(
      model,
      null,
      "Currently a game is running",
      res,
      next
    );

    const nextGame = await model.findOne({
      isCompleted: false,
      isQueued: true,
    });

    if (!nextGame) {
      return res.status(404).json({
        status: false,
        message: "No game is queued right now",
      });
    }

    const now = new Date();

    // Update timing fields based on current time
    let updateFields;
    if (gameName === "TMC") {
      const gameEnd = new Date(now.getTime() + nextGame.gameDuration * 60000);
      const revealEnd = new Date(
        gameEnd.getTime() + nextGame.revealDuration * 60000
      );
      updateFields = {
        startTime: now,
        isQueued: false,
        isActive: true,
        isPartiallyActive: true,
        status: "active",
        bufferTime: revealEnd,
      };
    } else if (gameName === "ARV") {
      const reveal = new Date(now.getTime() + nextGame.revealDuration * 60000);
      const outcome = new Date(
        reveal.getTime() + nextGame.outcomeDuration * 60000
      );
      const buffer = new Date(
        outcome.getTime() + nextGame.bufferDuration * 60000
      );
      updateFields = {
        gameTime: now,
        revealTime: reveal,
        outcomeTime: outcome,
        bufferTime: buffer,
        isQueued: false,
        isActive: true,
        isPartiallyActive: true,
        status: "active",
      };
    }

    const startedGame = await model
      .findByIdAndUpdate(nextGame._id, updateFields, { new: true })
      .select("-createdAt -updatedAt -__v")
      .lean();

    await Notification.create({
      message: `New ${gameName} game has started`,
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

export const startNextGameFromCron = async (
  model,
  io,
  log = console.error,
  gameName
) => {
  try {
    const activeGame = await model.findOne({
      isActive: true,
      isCompleted: false,
    });
    if (activeGame) return null; // No game started

    const nextGame = await model.findOne({
      isCompleted: false,
      isQueued: true,
    });

    if (!nextGame) return null; // No game to start

    const now = new Date();
    let updateFields;

    if (gameName === "TMC") {
      const gameEnd = new Date(now.getTime() + nextGame.gameDuration * 60000);
      const revealEnd = new Date(
        gameEnd.getTime() + nextGame.revealDuration * 60000
      );
      updateFields = {
        startTime: now,
        isQueued: false,
        isActive: true,
        isPartiallyActive: true,
        status: "active",
        bufferTime: revealEnd,
      };
    } else if (gameName === "ARV") {
      const reveal = new Date(now.getTime() + nextGame.revealDuration * 60000);
      const outcome = new Date(
        reveal.getTime() + nextGame.outcomeDuration * 60000
      );
      const buffer = new Date(
        outcome.getTime() + nextGame.bufferDuration * 60000
      );
      updateFields = {
        gameTime: now,
        revealTime: reveal,
        outcomeTime: outcome,
        bufferTime: buffer,
        isQueued: false,
        isActive: true,
        isPartiallyActive: true,
        status: "active",
      };
    }

    const startedGame = await model
      .findByIdAndUpdate(nextGame._id, updateFields, { new: true })
      .lean();

    await Notification.create({
      message: `New ${gameName} game has started`,
      targetCode: startedGame.code,
    });

    if (io) {
      io.emit("notification", {
        message: `New ${gameName} game ${startedGame.code} has started!`,
        targetCode: startedGame.code,
      });
    }

    // Return started game so caller can use it
    return startedGame;
  } catch (error) {
    log("Cron Error in startNextGameFromCron:", error);
    return null;
  }
};

export const updateAddToQueueService = async (
  id,
  model,
  res,
  next,
  gameDuration
) => {
  try {
    const { startTime } = await model.findById(id).select("startTime");

    const gameStartTime = new Date(startTime);
    const gameEndTime = new Date(gameStartTime);
    gameEndTime.setMinutes(gameEndTime.getMinutes() + gameDuration);

    if (gameEndTime.getTime() < Date.now()) {
      return res.status(403).json({
        status: false,
        message: "Game duration already passed",
      });
    }

    await model.findByIdAndUpdate(
      id,
      { isQueued: true, status: "queued" },
      { new: true }
    );

    return res.status(200).json({
      status: true,
      message: "Added to queue successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateRemoveFromQueueService = async (id, model, res, next) => {
  try {
    await model
      .findByIdAndUpdate(
        id,
        { isQueued: false, status: "inactive" },
        { new: true }
      )
      .lean();
    return res.status(200).json({
      status: true,
      message: "Removed from queue successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateGameTimeService = async (id, gameTime, model, res, next) => {
  try {
    const { revealTime } = await model.findById(id).select("revealTime");

    if (new Date(revealTime).getTime() < new Date(gameTime).getTime()) {
      return res.status(400).json({
        status: false,
        message: "Reveal time should be in the future or equal to game time",
      });
    }

    await model.findByIdAndUpdate(id, { gameTime });
    return res.status(200).json({
      status: true,
      message: "Game time updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateMakeInActiveService = async (id, model, res, next) => {
  try {
    const doc = await model.findById(id).select("startTime gameDuration");

    const gameEnd = new Date(doc.startTime);
    gameEnd.setMinutes(gameEnd.getMinutes() + doc.gameDuration);

    if (Date.now() < gameEnd.getTime()) {
      return res.status(403).json({
        status: false,
        message: "Cannot make inactive before game end time",
      });
    }

    await model.findByIdAndUpdate(
      id,
      { isActive: false, isPartiallyActive: false },
      { new: true }
    );
    return res.status(200).json({
      status: true,
      message: "Game inactivated successfully",
    });
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
    const doc = await model
      .findById(id)
      .select("startTime gameDuration revealDuration bufferDuration");

    const totalMinutes =
      doc.gameDuration + doc.revealDuration + doc.bufferDuration;
    const bufferEnd = new Date(doc.startTime);
    bufferEnd.setMinutes(bufferEnd.getMinutes() + totalMinutes);

    if (Date.now() < bufferEnd.getTime()) {
      return res.status(403).json({
        status: false,
        message: "Cannot complete game before buffer time ends",
      });
    }

    await model.findByIdAndUpdate(id, {
      isCompleted: true,
      isPartiallyActive: false,
    });

    await CompletedTargets.findByIdAndUpdate(
      process.env.COMPLETED_TARGETS_DOCUMENT_ID,
      { $push: { [targetName]: id } }
    );

    return res.status(200).json({
      status: true,
      message: "Target completed successfully",
    });
  } catch (error) {
    next(error);
  }
};
