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

    const nextGame = await model
      .findOneAndUpdate(
        { isCompleted: false, isQueued: true },
        { isQueued: false, isActive: true, isPartiallyActive: true },
        { new: true }
      )
      .select("-createdAt -updatedAt -__v")
      .lean();

    if (nextGame) {
      await Notification.create({
        message: `New ${gameName} game has started`,
        targetCode: nextGame.code,
      });

      return res.status(200).json({
        status: true,
        message: "Next game started successfully",
        data: nextGame,
      });
    }

    return res.status(404).json({
      status: false,
      message: "No game is queued right now",
    });
  } catch (error) {
    next(error);
  }
};
export const updateAddToQueueService = async (
  id,
  model,
  res,
  next,
  gameTime
) => {
  if (new Date(gameTime).getTime() < new Date().getTime()) {
    return res.status(403).json({
      status: false,
      message: "Current time exceeds game time",
    });
  }

  try {
    await model.findByIdAndUpdate(id, { isQueued: true }, { new: true }).lean();
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
      .findByIdAndUpdate(id, { isQueued: false }, { new: true })
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
    const { gameTime } = await model.findById(id).select("gameTime");

    if (new Date(gameTime).getTime() > new Date().getTime()) {
      return res.status(403).json({
        status: false,
        message: "You cannot make a game inactive unless the game time is over",
      });
    }

    await model.findByIdAndUpdate(id, { isActive: false }, { new: true });
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
    const { bufferTime } = await model.findById(id).select("bufferTime");

    if (new Date(bufferTime).getTime() > new Date().getTime()) {
      return res.status(403).json({
        status: false,
        message:
          "You cannot make a game complete unless the buffer time is over",
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
