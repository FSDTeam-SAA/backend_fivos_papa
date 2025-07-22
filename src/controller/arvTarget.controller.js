import { ARVTarget } from "../model/arvTarget.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import {
  startNextGameService,
  stopQueueService,
  updateAddToQueueService,
  updateGameTimeService,
  updateMakeCompleteService,
  updateMakeInActiveService,
  updateRemoveFromQueueService,
} from "../services/ARVTMCServices/ARVTMCServices.js";
import { generateCode } from "../utils/generateCode.js";
import { markImageAsUsed } from "../controller/TMCTarget.controller.js";
import { Notification } from "../model/notification.model.js";
import { UserSubmission } from "../model/userSubmission.model.js";
import { GameQueue } from "../model/gameQueue.model.js";

export const createARVTarget = async (req, res, next) => {
  const {
    eventName,
    eventDescription,
    gameTime, // ISO string
    revealTime, // ISO string
    outcomeTime, // ISO string
    image1,
    image2,
    image3,
    controlImage,
  } = req.body;

  try {
    // Validate timestamps
    const now = new Date();
    const gameTimeDate = new Date(gameTime);
    const revealTimeDate = new Date(revealTime);
    const outcomeTimeDate = new Date(outcomeTime);

    if (gameTimeDate <= now) {
      return res.status(400).json({
        status: false,
        message: "Game time must be in the future",
      });
    }

    if (!(gameTimeDate < revealTimeDate < outcomeTimeDate)) {
      return res.status(400).json({
        status: false,
        message: "Times must be in order: gameTime < revealTime < outcomeTime",
      });
    }

    // Generate unique code
    let code, arvCode, tmcCode;
    do {
      code = generateCode();
      arvCode = await ARVTarget.findOne({ code });
      tmcCode = await TMCTarget.findOne({ code });
    } while (arvCode || tmcCode);

    const newARVTarget = new ARVTarget({
      code,
      eventName,
      eventDescription,
      gameTime: gameTimeDate,
      revealTime: revealTimeDate,
      outcomeTime: outcomeTimeDate,
      image1,
      image2,
      image3,
      controlImage,
      status: "inactive",
      isQueued: true,
    });

    await newARVTarget.save();

    await GameQueue.findOneAndUpdate(
      { _id: "67da824e62d5a1b8cfece4c8" },
      {
        $push: { ARVTargets: newARVTarget._id },
        $set: { isARVQueueActive: true },
      },
      { upsert: true }
    );

    await markImageAsUsed(image1);
    await markImageAsUsed(image2);
    await markImageAsUsed(image3);
    await markImageAsUsed(controlImage);

    return res.status(201).json({
      status: true,
      data: newARVTarget,
      message: "ARV Target created successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllARVTargets = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [totalItems, ARVTargets] = await Promise.all([
      ARVTarget.countDocuments(),
      ARVTarget.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      data: ARVTargets,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
      message: "All ARVTargets fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllQueuedARVTargets = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [totalItems, ARVTargets] = await Promise.all([
      ARVTarget.countDocuments({
        isQueued: true,
        isActive: false,
        isPartiallyActive: false,
      }),
      ARVTarget.find({
        isQueued: true,
        isActive: false,
        isPartiallyActive: false,
      })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      data: ARVTargets,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
      message: "All queued ARVTargets fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUnQueuedARVTargets = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [totalItems, ARVTargets] = await Promise.all([
      ARVTarget.countDocuments({
        isQueued: false,
        isActive: false,
        isPartiallyActive: false,
      }),
      ARVTarget.find({
        isQueued: false,
        isActive: false,
        isPartiallyActive: false,
      })
        .sort({ createdAt: -1 }) // Add sorting
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      data: ARVTargets,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
      message: "All unqueued ARVTargets fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveARVTarget = async (_, res, next) => {
  try {
    const activeARVTarget = await ARVTarget.findOne({
      $or: [{ isActive: true }, { isPartiallyActive: true }],
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: true,
      data: activeARVTarget,
      message: "Active ARVTarget fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const startNextGame = async (_, res, next) => {
  try {
    await startNextGameService(ARVTarget, res, next, "ARV");
  } catch (error) {
    next(error);
  }
};

export const updateResultImage = async (req, res, next) => {
  const { id } = req.params;
  const { resultImage } = req.body;

  try {
    const game = await ARVTarget.findById(id);

    if (!game) {
      return res.status(404).json({ status: false, message: "Game not found" });
    }

    if (game.isResultRevealed) {
      return res
        .status(403)
        .json({ status: false, message: "Result image already revealed" });
    }

    await ARVTarget.findByIdAndUpdate(id, {
      resultImage,
      isResultRevealed: true,
    });

    const io = req.app.get("io");

    // Find all users who submitted this ARV target
    const submissions = await UserSubmission.find({
      "participatedARVTargets.ARVId": id,
    }).populate("userId");

    for (const submission of submissions) {
      const target = submission.participatedARVTargets.find(
        (entry) => entry.ARVId.toString() === id.toString()
      );

      const userId = submission.userId._id;
      const points = target?.points || 0;

      // Emit to user
      io.to(`user_${userId}`).emit("notification", {
        message: `Result image revealed for game ${game.code}. You earned ${points} points.`,
        targetCode: game.code,
      });

      // Save to DB
      await Notification.create({
        userId,
        message: `Result image revealed for game ${game.code}. You earned ${points} points.`,
        targetCode: game.code,
      });
    }

    // Emit to game room
    io.to(`game_${game.code}`).emit("resultImageUpdated", {
      resultImage,
    });

    return res.status(200).json({
      status: true,
      message: "Result image updated and users notified.",
    });
  } catch (error) {
    next(error);
  }
};

export const updateAddToQueue = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateAddToQueueService(id, ARVTarget, "ARV", res, next);
  } catch (error) {
    next(error);
  }
};

export const updateRemoveFromQueue = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateRemoveFromQueueService(id, ARVTarget, res, next);
  } catch (error) {
    next(error);
  }
};

export const updateBufferTime = async (req, res, next) => {
  const { id } = req.params;
  const { bufferTime } = req.body;

  try {
    const { outcomeTime } = await ARVTarget.findById(id).select("outcomeTime");

    if (new Date(outcomeTime).getTime() > new Date(bufferTime).getTime()) {
      return res.status(400).json({
        status: false,
        message: "Buffer time should be in the future or equal to outcome time",
      });
    }

    await ARVTarget.findByIdAndUpdate(id, { bufferTime });
    return res.status(200).json({
      status: true,
      message: "Buffer time updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateGameTime = async (req, res, next) => {
  const { id } = req.params;
  const { gameTime } = req.body;

  try {
    await updateGameTimeService(id, gameTime, ARVTarget, res, next);
  } catch (error) {
    next(error);
  }
};

// once game time is over then only isActive gets false
export const updateMakeInactive = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateMakeInActiveService(id, ARVTarget, res, next);
  } catch (error) {
    next(error);
  }
};

export const updateMakeComplete = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateMakeCompleteService(id, ARVTarget, "ARVTargets", res, next);
  } catch (error) {
    next(error);
  }
};

export const getPendingOutcomeGames = async (req, res, next) => {
  try {
    const now = new Date();
    const pendingGames = await ARVTarget.find({
      outcomeTime: { $lte: now },
      resultImage: { $exists: false },
      isCompleted: false,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      data: pendingGames,
      message: "Games pending games for setting result image.",
    });
  } catch (error) {
    next(error);
  }
};

export const stopQueue = async (req, res, next) => {
  try {
    await stopQueueService(res, next);
  } catch (error) {
    next(error);
  }
};

// Get arv target when the resultImage is null or ""
export const getARVTargetWithNullResultImage = async (req, res, next) => {
  try {
    const arvTarget = await ARVTarget.find({ resultImage: "" });
    return res.status(200).json({ status: true, data: arvTarget });
  } catch (error) {
    next(error);
  }
};
