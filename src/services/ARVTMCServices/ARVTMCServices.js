import { CompletedTargets } from "../../model/completedTargets.model.js";
import { Notification } from "../../model/notification.model.js";

const addMinutes = (start, minutes) =>
  new Date(start.getTime() + minutes * 60000);

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
    let updateFields = {
      isQueued: false,
      isActive: true,
      isPartiallyActive: true,
      status: "active",
    };

    if (gameName === "TMC") {
      const gameEnd = addMinutes(now, nextGame.gameDuration);
      const revealEnd = addMinutes(gameEnd, nextGame.revealDuration);
      const bufferEnd = addMinutes(revealEnd, nextGame.bufferDuration);

      updateFields.startTime = now;
      updateFields.bufferTime = bufferEnd;
    } else if (gameName === "ARV") {
      const gameStart = now;
      const revealTime = addMinutes(gameStart, nextGame.revealDuration);
      const outcomeTime = addMinutes(revealTime, nextGame.outcomeDuration);
      const bufferTime = addMinutes(outcomeTime, nextGame.bufferDuration);

      updateFields.gameTime = gameStart;
      updateFields.revealTime = revealTime;
      updateFields.outcomeTime = outcomeTime;
      updateFields.bufferTime = bufferTime;
    }

    const startedGame = await model
      .findByIdAndUpdate(nextGame._id, updateFields, { new: true })
      .select("-__v")
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
    console.log(`🧪 [${gameName}] Cron trying to start next game`);

    const activeGame = await model.findOne({
      isActive: true,
      isCompleted: false,
    });

    if (activeGame) {
      console.log("❌ Active game already running, skipping");
      return null;
    }

    const nextGame = await model.findOne({
      isCompleted: false,
      isQueued: true,
      // Remove `status: "queued"` to avoid unnecessary filter
    });

    if (!nextGame) {
      console.log("❌ No queued game found");
      return null;
    }

    console.log("✅ Found queued game:", nextGame.code);

    const now = new Date();
    let updateFields = {
      isQueued: false,
      isActive: true,
      isPartiallyActive: true,
      status: "active",
    };

    if (gameName === "TMC") {
      const gameEnd = addMinutes(now, nextGame.gameDuration);
      const revealEnd = addMinutes(gameEnd, nextGame.revealDuration);
      const bufferEnd = addMinutes(revealEnd, nextGame.bufferDuration);

      updateFields.startTime = now;
      updateFields.bufferTime = bufferEnd;
    } else if (gameName === "ARV") {
      const revealTime = addMinutes(now, nextGame.revealDuration);
      const outcomeTime = addMinutes(revealTime, nextGame.outcomeDuration);
      const bufferTime = addMinutes(outcomeTime, nextGame.bufferDuration);

      updateFields.gameTime = now;
      updateFields.revealTime = revealTime;
      updateFields.outcomeTime = outcomeTime;
      updateFields.bufferTime = bufferTime;
    }

    const startedGame = await model
      .findByIdAndUpdate(nextGame._id, updateFields, { new: true })
      .lean();

    await Notification.create({
      message: `New ${gameName} game has started`,
      targetCode: startedGame.code,
    });

    io?.emit("notification", {
      message: `New ${gameName} game ${startedGame.code} has started!`,
      targetCode: startedGame.code,
    });

    console.log("🔥 Starting next queued game:", startedGame.code);

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
  gameName
) => {
  try {
    const field = gameName === "TMC" ? "startTime" : "gameTime";

    const doc = await model.findById(id).select(field);
    const startTime = new Date(doc[field]);

    const now = new Date();
    if (startTime.getTime() < now.getTime()) {
      return res.status(403).json({
        status: false,
        message: "Start time is in the past. Can't queue this game.",
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
    const doc = await model.findById(id).lean();

    let totalMinutes;

    if (targetName === "tmc") {
      totalMinutes = doc.gameDuration + doc.revealDuration + doc.bufferDuration;
    } else if (targetName === "arv") {
      totalMinutes =
        doc.revealDuration + doc.outcomeDuration + doc.bufferDuration;
    } else {
      return res.status(400).json({
        status: false,
        message: "Invalid target name",
      });
    }

    const baseTime = doc.startTime || doc.gameTime; // TMC: startTime | ARV: gameTime
    const bufferEnd = addMinutes(new Date(baseTime), totalMinutes);

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
