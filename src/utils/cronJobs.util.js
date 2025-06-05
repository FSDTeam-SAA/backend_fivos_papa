import { User } from "../model/user.model.js";
import { ARVTarget } from "../model/arvTarget.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import { CompletedTargets } from "../model/completedTargets.model.js";
import { Notification } from "../model/notification.model.js";
import cron from "node-cron";

const checkInactiveUsers = async () => {
  const inactiveThreshold = 10 * 60 * 1000; // 10 minutes
  try {
    const inactiveUsers = await User.find({
      lastActive: { $lt: new Date(Date.now() - inactiveThreshold) },
      "sessions.sessionEndTime": { $exists: false },
    });

    const bulkOps = inactiveUsers.map((user) => ({
      updateOne: {
        filter: {
          _id: user._id,
          "sessions.sessionEndTime": { $exists: false },
        },
        update: {
          $set: {
            "sessions.$[elem].sessionEndTime": new Date(),
            "sessions.$[elem].duration":
              new Date() -
              user.sessions.find((s) => !s.sessionEndTime).sessionStartTime,
          },
        },
        arrayFilters: [{ "elem.sessionEndTime": { $exists: false } }],
      },
    }));

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }
  } catch (error) {
    console.error("Error checking inactive users:", error);
  }
};

const checkARVGames = async () => {
  // console.log(
  //   `[${new Date().toISOString()}] ARV cron: Checking for games to complete...`
  // );
  try {
    const gamesToComplete = await ARVTarget.find({
      isCompleted: false,
      bufferTime: { $lte: new Date() },
    });

    // console.log(
    //   `[${new Date().toISOString()}] ARV cron: Found ${
    //     gamesToComplete.length
    //   } games to complete.`
    // );

    for (const game of gamesToComplete) {
      console.log(
        `[${new Date().toISOString()}] ARV cron: Completing game ${game.code}`
      );
      await ARVTarget.findByIdAndUpdate(game._id, {
        isCompleted: true,
        isPartiallyActive: false,
        isActive: false,
      });

      await CompletedTargets.findByIdAndUpdate(
        process.env.COMPLETED_TARGETS_DOCUMENT_ID,
        { $push: { ARVTargets: game._id } }
      );

      await Notification.deleteMany({ targetCode: game.code });

      const nextGame = await ARVTarget.findOneAndUpdate(
        { isCompleted: false, isQueued: true },
        { isQueued: false, isActive: true, isPartiallyActive: true },
        { new: true }
      );
      if (nextGame) {
        console.log(
          `[${new Date().toISOString()}] ARV cron: Started next game ${
            nextGame.code
          }`
        );
        await Notification.create({
          message: `New ARV game has started`,
          targetCode: nextGame.code,
        });
      }
    }
  } catch (error) {
    console.error("Error in ARV game cron:", error);
  }
};

const checkTMCGames = async () => {
  // console.log(
  //   `[${new Date().toISOString()}] TMC cron: Checking for games to complete...`
  // );
  try {
    const gamesToComplete = await TMCTarget.find({
      isCompleted: false,
      bufferTime: { $lte: new Date() },
    });

    // console.log(
    //   `[${new Date().toISOString()}] TMC cron: Found ${
    //     gamesToComplete.length
    //   } games to complete.`
    // );

    for (const game of gamesToComplete) {
      console.log(
        `[${new Date().toISOString()}] TMC cron: Completing game ${game.code}`
      );
      await TMCTarget.findByIdAndUpdate(game._id, {
        isCompleted: true,
        isPartiallyActive: false,
        isActive: false,
      });

      await CompletedTargets.findByIdAndUpdate(
        process.env.COMPLETED_TARGETS_DOCUMENT_ID,
        { $push: { TMCTargets: game._id } }
      );

      await Notification.deleteMany({ targetCode: game.code });

      const nextGame = await TMCTarget.findOneAndUpdate(
        { isCompleted: false, isQueued: true },
        { isQueued: false, isActive: true, isPartiallyActive: true },
        { new: true }
      );
      if (nextGame) {
        console.log(
          `[${new Date().toISOString()}] TMC cron: Started next game ${
            nextGame.code
          }`
        );
        await Notification.create({
          message: `New TMC game has started`,
          targetCode: nextGame.code,
        });
      }
    }
  } catch (error) {
    console.error("Error in TMC game cron:", error);
  }
};

const initCronJobs = () => {
  cron.schedule("*/5 * * * *", () => {
    console.log(
      `[${new Date().toISOString()}] Running inactive users check...`
    );
    checkInactiveUsers();
  });

  cron.schedule("* * * * *", () => {
    console.log(
      `[${new Date().toISOString()}] Running ARV and TMC cron jobs...`
    );
    checkARVGames();
    checkTMCGames();
  });
};

export { initCronJobs };
