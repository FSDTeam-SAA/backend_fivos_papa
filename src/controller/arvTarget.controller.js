import { ARVTarget } from "../model/arvTarget.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import {
  startNextGameService,
  updateGameTimeService,
  updateMakeCompleteService,
  updateMakeInActiveService,
  updateRemoveFromQueueService,
} from "../services/ARVTMCServices/ARVTMCServices.js";
import { generateCode } from "../utils/generateCode.js";
import { markImageAsUsed } from "../controller/TMCTarget.controller.js";

export const createARVTarget = async (req, res, next) => {
  const {
    eventName,
    eventDescription,
    gameTime,
    revealTime,
    outcomeTime,
    bufferTime,
    image1,
    image2,
    image3,
    controlImage,
  } = req.body;

  try {
    let code;
    let arvCode, tmcCode;

    do {
      code = generateCode();
      arvCode = await ARVTarget.findOne({ code });
      tmcCode = await TMCTarget.findOne({ code });
    } while (arvCode || tmcCode);

    const gameStart = new Date(gameTime);
    const reveal = new Date(revealTime);
    const outcome = new Date(outcomeTime);
    const buffer = new Date(bufferTime);

    const revealDuration = Math.round((reveal - gameStart) / 60000);
    const outcomeDuration = Math.round((outcome - reveal) / 60000);
    const bufferDuration = Math.round((buffer - gameStart) / 60000);

    if (reveal >= outcome) {
      return res.status(400).json({
        status: false,
        message: "Outcome time must be after reveal time",
      });
    }

    if (outcome >= buffer) {
      return res.status(400).json({
        status: false,
        message: "Buffer time must be after outcome time",
      });
    }

    const newARVTarget = new ARVTarget({
      code,
      eventName,
      eventDescription,
      gameTime: gameStart,
      revealTime: reveal,
      outcomeTime: outcome,
      bufferTime: buffer,
      revealDuration,
      outcomeDuration,
      bufferDuration,
      image1,
      image2,
      image3,
      controlImage,
    });

    await newARVTarget.save();

    // Mark all used images
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
      ARVTarget.find().select("-__v").skip(skip).limit(limit),
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
        .select("-__v")
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
  const sort = req.query.sort || "-createdAt"; // Default sort by newest

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
        .select("-__v")
        .sort(sort) // Add sorting
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
      .select("-__v")
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

    if (new Date() < new Date(game.revealTime)) {
      return res.status(400).json({
        status: false,
        message: "Cannot set result image before reveal time",
      });
    }

    await ARVTarget.findByIdAndUpdate(id, {
      resultImage,
    });

    await Notification.create({
      message: `Result image set for game ${game.code}.`,
      targetCode: game.code,
    });

    return res.status(200).json({
      status: true,
      message: "Result image updated.",
    });
  } catch (error) {
    next(error);
  }
};

export const updateAddToQueue = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { gameTime } = await ARVTarget.findById(id).select("gameTime");
    await updateAddToQueueService(id, ARVTarget, res, next, gameTime);
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
    }).select("-__v");

    return res.status(200).json({
      status: true,
      data: pendingGames,
      message: "Games pending games for setting result image.",
    });
  } catch (error) {
    next(error);
  }
};
