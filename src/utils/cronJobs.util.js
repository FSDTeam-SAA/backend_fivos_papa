import { User } from "../model/user.model.js";
import { ARVTarget } from "../model/arvTarget.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import { CompletedTargets } from "../model/completedTargets.model.js";
import { Notification } from "../model/notification.model.js";
import cron from "node-cron";
import {
  emitNotification,
  emitGlobalNotification,
} from "../jobs/notificationJob.js";
import { startNextGameFromCron } from "../services/ARVTMCServices/ARVTMCServices.js";

const checkInactiveUsers = async (io) => {
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

const checkARVGames = async (io) => {
  const now = new Date();

  try {
    const gamesToReveal = await ARVTarget.find({
      revealTime: { $lte: now },
      status: "active",
    });

    for (const game of gamesToReveal) {
      await ARVTarget.findByIdAndUpdate(game._id, {
        status: "revealed",
        isActive: false,
        isPartiallyActive: true,
      });

      await emitGlobalNotification(io, {
        message: `ARV game ${game.code} has been revealed!`,
        targetCode: game.code,
      });
    }

    const toComplete = await ARVTarget.find({
      bufferTime: { $lte: now },
      isCompleted: false,
    });

    for (const game of toComplete) {
      await ARVTarget.findByIdAndUpdate(game._id, {
        status: "completed",
        isCompleted: true,
        isActive: false,
        isPartiallyActive: false,
      });

      await CompletedTargets.findByIdAndUpdate(
        process.env.COMPLETED_TARGETS_DOCUMENT_ID,
        { $push: { ARVTargets: game._id } }
      );

      await Notification.deleteMany({ targetCode: game.code });

      await emitGlobalNotification(io, {
        message: `ARV game ${game.code} is completed.`,
        targetCode: game.code,
      });

      // const nextGame = await ARVTarget.findOneAndUpdate(
      //   { isQueued: true, isCompleted: false },
      //   {
      //     isQueued: false,
      //     isActive: true,
      //     isPartiallyActive: true,
      //     status: "active",
      //   },
      //   { new: true }
      // );

      await startNextGameFromCron(ARVTarget, io, console.error, "ARV");

      if (nextGame) {
        await emitGlobalNotification(io, {
          message: `New ARV game ${nextGame.code} has started!`,
          targetCode: nextGame.code,
        });
      }
    }
  } catch (error) {
    console.error("Error in ARV game cron:", error);
  }
};

const checkTMCGames = async (io) => {
  try {
    const now = new Date();
    const activeGame = await TMCTarget.findOne({ isActive: true });

    if (activeGame) {
      const {
        _id,
        code,
        startTime,
        gameDuration,
        revealDuration,
        bufferDuration,
        status,
      } = activeGame;

      const gameStart = new Date(startTime).getTime();
      const gameEnd = gameStart + gameDuration * 60000;
      const revealEnd = gameEnd + revealDuration * 60000;
      const bufferEnd = gameStart + bufferDuration * 60000;

      if (now.getTime() >= bufferEnd) {
        await TMCTarget.findByIdAndUpdate(_id, {
          isCompleted: true,
          isActive: false,
          isPartiallyActive: false,
          status: "expired",
        });

        await CompletedTargets.findByIdAndUpdate(
          process.env.COMPLETED_TARGETS_DOCUMENT_ID,
          { $push: { TMCTargets: _id } }
        );

        await Notification.deleteMany({ targetCode: code });

        await emitGlobalNotification(io, {
          message: `TMC game ${code} has ended. Final results are now available!`,
          targetCode: code,
        });

        // const nextGame = await TMCTarget.findOneAndUpdate(
        //   { isQueued: true, isCompleted: false },
        //   {
        //     isQueued: false,
        //     isActive: true,
        //     isPartiallyActive: true,
        //     startTime: now,
        //     status: "active",
        //   },
        //   { new: true }
        // );

        await startNextGameFromCron(TMCTarget, io, console.error, "TMC");

        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New TMC game ${nextGame.code} has started! Join now!`,
            targetCode: nextGame.code,
          });
        }
      } else if (now.getTime() >= gameEnd && status === "active") {
        await TMCTarget.findByIdAndUpdate(_id, {
          status: "revealed",
        });

        await emitGlobalNotification(io, {
          message: `TMC game ${code} results have been revealed! Check your predictions!`,
          targetCode: code,
        });
      } else if (now.getTime() >= revealEnd && status === "revealed") {
        await emitGlobalNotification(io, {
          message: `TMC game ${code} final scores are now locked in!`,
          targetCode: code,
        });
      } else if (status === "active") {
        const timeLeft = Math.ceil((gameEnd - now.getTime()) / 60000);
        if (timeLeft % 15 === 0) {
          // Every 15 minutes
          await emitGlobalNotification(io, {
            message: `TMC game ${code} is active! ${timeLeft} minutes remaining!`,
            targetCode: code,
          });
        }
      }
    }
  } catch (err) {
    console.error("Error in TMC Cron:", err);
  }
};

const initCronJobs = (io) => {
  // Check inactive users every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    checkInactiveUsers(io);
  });

  // Check ARV and TMC games every minute
  cron.schedule("* * * * *", () => {
    checkARVGames(io);
    checkTMCGames(io);
  });
};

export { initCronJobs };
