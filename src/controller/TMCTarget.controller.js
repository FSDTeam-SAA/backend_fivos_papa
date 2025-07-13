import { ARVTarget } from "../model/arvTarget.model.js";
import { CategoryImage } from "../model/categoryImage.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import {
  startNextGameService,
  updateAddToQueueService,
  updateGameTimeService,
  updateMakeCompleteService,
  updateMakeInActiveService,
  updateRemoveFromQueueService,
} from "../services/ARVTMCServices/ARVTMCServices.js";
import { generateCode } from "../utils/generateCode.js";

export const markImageAsUsed = async (image) => {
  const imageUrl = typeof image === "string" ? image : image?.url;

  if (!imageUrl) return;

  await CategoryImage.updateOne(
    {
      "subCategories.images.imageUrl": imageUrl,
    },
    {
      $set: {
        "subCategories.$[sub].images.$[img].isUsed": true,
        "subCategories.$[sub].images.$[img].status": "used",
        "subCategories.$[sub].images.$[img].usedAt": new Date(),
      },
    },
    {
      arrayFilters: [
        { "sub.images.imageUrl": imageUrl },
        { "img.imageUrl": imageUrl },
      ],
    }
  );
};

function getDurationInMinutesToTargetTime(targetDateTime) {
  const nowUTC = new Date(new Date().toISOString());
  const target = new Date(targetDateTime);
  const diffMs = target.getTime() - nowUTC.getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

export const createTMCTarget = async (req, res, next) => {
  const { targetImage, controlImages, gameStart, revealTime, bufferTime } =
    req.body;

  try {
    const gameDuration = getDurationInMinutesToTargetTime(gameStart);
    const revealDuration = getDurationInMinutesToTargetTime(revealTime);
    const bufferDuration = getDurationInMinutesToTargetTime(bufferTime);

    let code, arvCode, tmcCode;

    do {
      code = generateCode();
      arvCode = await ARVTarget.findOne({ code });
      tmcCode = await TMCTarget.findOne({ code });
    } while (arvCode || tmcCode);

    const newTMCTarget = new TMCTarget({
      code,
      targetImage,
      controlImages,
      startTime: new Date(gameStart),
      gameDuration,
      revealDuration,
      bufferDuration,
      status: "inactive",
    });

    await newTMCTarget.save();

    await markImageAsUsed(targetImage);
    for (const image of controlImages) {
      await markImageAsUsed(image);
    }

    return res.status(201).json({
      status: true,
      message: "TMC Game created successfully",
      data: newTMCTarget,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllTMCTargets = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [totalItems, TMCTargets] = await Promise.all([
      TMCTarget.countDocuments(),
      TMCTarget.find().skip(skip).limit(limit),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      data: TMCTargets,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
      message: "All TMCTargets fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllQueuedTMCTargets = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [totalItems, TMCTargets] = await Promise.all([
      TMCTarget.countDocuments({
        isQueued: true,
        isActive: false,
        isPartiallyActive: false,
      }),
      TMCTarget.find({
        isQueued: true,
        isActive: false,
        isPartiallyActive: false,
      })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      data: TMCTargets,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
      message: "All queued TMCTargets fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUnQueuedTMCTargets = async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const sort = req.query.sort || "-createdAt"; // Default sort by newest

  try {
    const [totalItems, TMCTargets] = await Promise.all([
      TMCTarget.countDocuments({ isQueued: false, isActive: false }),
      TMCTarget.find({ isQueued: false, isActive: false })
        .sort(sort) // Add sorting
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      data: TMCTargets,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
      message: "All unqueued TMC Targets fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveTMCTarget = async (_, res, next) => {
  try {
    const activeTMCTarget = await TMCTarget.findOne({
      $or: [{ isActive: true }, { isPartiallyActive: true }],
    }).lean();

    return res.status(200).json({
      status: true,
      data: activeTMCTarget,
      message: "Active TMCTarget fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const startNextGame = async (_, res, next) => {
  try {
    await startNextGameService(TMCTarget, res, next, "TMC");
  } catch (error) {
    next(error);
  }
};

export const updateAddToQueue = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { gameDuration } = await TMCTarget.findById(id).select(
      "gameDuration"
    );
    await updateAddToQueueService(id, TMCTarget, res, next, gameDuration);
  } catch (error) {
    next(error);
  }
};

export const updateRemoveFromQueue = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateRemoveFromQueueService(id, TMCTarget, res, next);
  } catch (error) {
    next(error);
  }
};

export const updateBufferTime = async (req, res, next) => {
  const { id } = req.params;
  const { bufferTime } = req.body;

  try {
    const { revealTime } = await TMCTarget.findById(id).select("revealTime");

    if (new Date(revealTime).getTime() > new Date(bufferTime).getTime()) {
      return res.status(400).json({
        status: false,
        message: "Buffer time should be in the future or equal to reveal time",
      });
    }

    await TMCTarget.findByIdAndUpdate(id, { bufferTime }, { new: true });
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
    await updateGameTimeService(id, gameTime, TMCTarget, res, next);
  } catch (error) {
    next(error);
  }
};

// once game time is over then only isActive gets false
export const updateMakeInactive = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateMakeInActiveService(id, TMCTarget, res, next);
  } catch (error) {
    next(error);
  }
};

export const updateMakeComplete = async (req, res, next) => {
  const { id } = req.params;

  try {
    await updateMakeCompleteService(id, TMCTarget, "TMCTargets", res, next);
  } catch (error) {
    next(error);
  }
};
