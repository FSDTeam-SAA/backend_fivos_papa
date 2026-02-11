import cron from "node-cron";
import { User } from "../model/user.model.js";
import { ARVTarget } from "../model/arvTarget.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import { CompletedTargets } from "../model/completedTargets.model.js";
import { Notification } from "../model/notification.model.js";
import {
  emitGlobalNotification,
  emitNotification,
} from "../jobs/notificationJob.js";
import { startNextGameFromCron } from "../services/ARVTMCServices/ARVTMCServices.js";
import { UserSubmission } from "../model/userSubmission.model.js";
import { GameQueue } from "../model/gameQueue.model.js";
import { checkTierUpdate } from "./../controller/userSubmission.controller.js";
import { getCycleStats } from "./cycle.util.js";

const addMinutes = (start, minutes) => {
  if (!start || isNaN(start.getTime())) {
    return new Date();
  }
  return new Date(start.getTime() + minutes * 60000);
};

const checkInactiveUsers = async (io) => {
  const inactiveThreshold = 10 * 60 * 1000;
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
  } catch (error) {}
};

// const checkAllUsersForCycleRenewal = async (io) => {
//   try {
//     const userSubmissions = await UserSubmission.find({});
//     for (const us of userSubmissions) {
//       const cycleStartDate = us.lastChallengeDate || us.createdAt;
//       const daysInCycle = Math.floor(
//         (new Date() - cycleStartDate) / (1000 * 60 * 60 * 24)
//       );

//       const daysInactive = Math.floor(
//         (new Date() - us.lastChallengeDate) / (1000 * 60 * 60 * 24)
//       );

//       if (
//         (daysInactive >= 10 && us.completedChallenges < 10) ||
//         daysInCycle >= 15
//       ) {
//         await checkTierUpdate(us.userId, io);
//       }
//     }
//   } catch (error) {
//     console.error("Error in checkAllUsersForCycleRenewal:", error);
//   }
// };

const checkAllUsersForCycleRenewal = async (io) => {
  try {
    const userSubmissions = await UserSubmission.find({});
    for (const us of userSubmissions) {
      const { gamesCompleted, daysInCycle } = getCycleStats(us);
      const shouldEndCycle = gamesCompleted >= 10 || daysInCycle >= 15;

      if (shouldEndCycle) {
        await checkTierUpdate(us.userId, io);
      }
    }
  } catch (error) {
    console.error("Error in checkAllUsersForCycleRenewal:", error);
  }
};

const manageGameLifecycle = async (io, model, gameName) => {
  const now = new Date();

  try {
    // Check for active games
    const activeGames = await model
      .find({
        $or: [{ isActive: true }, { isPartiallyActive: true }],
        isCompleted: false,
      })
      .lean();

    for (const game of activeGames) {
      const {
        _id,
        code,
        gameTime,
        startTime,
        revealTime,
        outcomeTime,
        bufferTime,
        status,
        startNotified,
        revealNotified,
        outcomeNotified,
        bufferNotified,
        targetImage,
        gameDuration,
        revealDuration,
        bufferDuration,
      } = game;

      const baseTime = gameName === "TMC" ? startTime : gameTime;
      if (
        !baseTime ||
        isNaN(baseTime.getTime()) ||
        (gameName === "ARV" && (!revealTime || !outcomeTime))
      ) {
        await model.findByIdAndUpdate(_id, {
          isCompleted: true,
          isActive: false,
          isPartiallyActive: false,
          status: "expired",
          outcomeTime: now, // Use outcomeTime for ARV consistency
        });

        await CompletedTargets.findOneAndUpdate(
          { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
          {
            $push: { [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: _id },
          },
          { upsert: true },
        );

        await Notification.deleteMany({ targetCode: code });
        await emitGlobalNotification(io, {
          message:
            gameName === "ARV"
              ? `The ARV game with target code ${code} has now ended! Wait for the result.`
              : `The ${gameName} game with target code ${code} has now ended.`,
          targetCode: code,
        });

        const nextGame = await startNextGameFromCron(
          model,
          io,
          console.error,
          gameName,
        );
        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New ${gameName} game ${nextGame.code} has started!`,
            targetCode: nextGame.code,
          });
        }
        continue;
      }

      // Define transition times
      let gameEnd, revealEnd, outcomeEnd;
      if (gameName === "TMC") {
        gameEnd = addMinutes(new Date(baseTime), game.gameDuration);
        revealEnd = addMinutes(gameEnd, game.revealDuration);
        outcomeEnd = addMinutes(revealEnd, game.bufferDuration);
      } else if (gameName === "ARV") {
        gameEnd = new Date(revealTime);
        revealEnd = new Date(outcomeTime);
        outcomeEnd = new Date(outcomeTime);
      }

      // Start Notification (ARV only, if missed)
      if (gameName === "ARV" && status === "active" && !startNotified) {
        await model.findByIdAndUpdate(_id, { startNotified: true });
        await emitGlobalNotification(io, {
          message: `ARV game ${code} has started!`,
          targetCode: code,
        });
      }

      // Reveal Logic
      if (status === "active" && now.getTime() >= gameEnd.getTime()) {
        await model.findByIdAndUpdate(_id, {
          isActive: false,
          isPartiallyActive: true,
          status: "revealed",
          revealNotified: true,
        });

        if (gameName === "TMC") {
          const submissions = await UserSubmission.find({
            "participatedTMCTargets.TMCId": _id,
          });

          if (submissions.length > 0) {
            for (const submission of submissions) {
              const entryIndex = submission.participatedTMCTargets.findIndex(
                (e) => e.TMCId.toString() === _id.toString(),
              );
              if (
                entryIndex === -1 ||
                submission.participatedTMCTargets[entryIndex].points !== null
              )
                continue;

              const entry = submission.participatedTMCTargets[entryIndex];
              let points = 0;
              if (targetImage === entry.firstChoiceImage) {
                points = 25;
              } else if (targetImage === entry.secondChoiceImage) {
                points = 15;
              } else {
                points = -10;
              }

              const newTotal = submission.totalPoints + points;
              submission.totalPoints = newTotal;
              entry.points = points;

              await submission.save();

              const user = await User.findById(submission.userId);
              user.totalPoints = submission.totalPoints;
              await user.save();

              await checkTierUpdate(submission.userId, io);

              const visiblePoints = Math.max(0, points);
              const message =
                points > 0
                  ? `Your TMC game ${code} has been revealed! You earned ${visiblePoints} points.`
                  : `Your TMC game ${code} has been revealed! You earned 0 points.`;

              await emitNotification(io, {
                userId: submission.userId,
                targetCode: code,
                message,
              });
            }
          }
        } else if (gameName === "ARV") {
          const submissions = await UserSubmission.find({
            "participatedARVTargets.ARVId": _id,
          });

          if (submissions.length > 0) {
            for (const submission of submissions) {
              const entry = submission.participatedARVTargets.find(
                (e) => e.ARVId.toString() === _id.toString(),
              );
              if (entry) {
                await emitNotification(io, {
                  userId: submission.userId,
                  targetCode: code,
                  message: `Your ARV game ${code} has been revealed!`,
                });
              }
            }
          }
        }
      }

      // ARV Outcome
      if (
        gameName === "ARV" &&
        status === "revealed" &&
        now.getTime() >= revealEnd.getTime() &&
        !outcomeNotified
      ) {
        await model.findByIdAndUpdate(_id, {
          isActive: false,
          isPartiallyActive: true,
          status: "completed",
          outcomeNotified: true,
        });

        const submissions = await UserSubmission.find({
          "participatedARVTargets.ARVId": _id,
        });
        if (submissions.length > 0) {
          for (const submission of submissions) {
            const entry = submission.participatedARVTargets.find(
              (e) => e.ARVId.toString() === _id.toString(),
            );
            if (entry) {
              await emitNotification(io, {
                userId: submission.userId,
                targetCode: code,
                message: `ARV game ${code} has reached outcome! Wait for the result.`,
              });
            }
          }
        }
      }

      // Expire Logic (TMC after buffer, ARV after outcome)
      if (
        (gameName === "ARV" &&
          status === "completed" &&
          now.getTime() >= outcomeEnd.getTime()) ||
        (gameName === "TMC" &&
          status === "revealed" &&
          now.getTime() >= outcomeEnd.getTime() &&
          bufferNotified)
      ) {
        await model.findByIdAndUpdate(_id, {
          isCompleted: true,
          isActive: false,
          isPartiallyActive: false,
          status: "expired",
          outcomeTime: now,
        });

        await CompletedTargets.findOneAndUpdate(
          { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
          {
            $push: { [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: _id },
          },
          { upsert: true },
        );

        await Notification.deleteMany({ targetCode: code });

        await emitGlobalNotification(io, {
          message:
            gameName === "ARV"
              ? `The ARV game with target code ${code} has now ended! Wait for the result.`
              : `The ${gameName} game with target code ${code} has now ended.`,
          targetCode: code,
        });

        const nextGame = await startNextGameFromCron(
          model,
          io,
          console.error,
          gameName,
        );
        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New ${gameName} game ${nextGame.code} has started!`,
            targetCode: nextGame.code,
          });
        }
      }

      // Buffer Notification (TMC only)
      if (
        gameName === "TMC" &&
        status === "revealed" &&
        now.getTime() >= revealEnd.getTime() &&
        !bufferNotified
      ) {
        await model.findByIdAndUpdate(_id, { bufferNotified: true });

        await emitGlobalNotification(io, {
          message: `TMC game ${code} is in buffer stage.`,
          targetCode: code,
        });
      }
    }

    // Start queued ARV games if no active games
    if (!activeGames.length && gameName === "ARV") {
      const queue = await GameQueue.findById("67da824e62d5a1b8cfece4c8");
      if (queue && queue.isARVQueueActive && queue.ARVTargets.length) {
        const nextGame = await startNextGameFromCron(
          model,
          io,
          console.error,
          gameName,
        );
        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New ARV game ${nextGame.code} has started!`,
            targetCode: nextGame.code,
          });
        }
      }
    }

    // Force Expire Old Stuck Games
    if (!activeGames.length) {
      const stuckGames = await model
        .find({
          $or: [
            { status: "revealed", isCompleted: false },
            { status: "completed", isCompleted: false },
          ],
        })
        .lean();

      for (const game of stuckGames) {
        let outcomeEnd;
        if (gameName === "TMC") {
          const baseTime = game.startTime;
          const revealEnd = baseTime
            ? addMinutes(
                new Date(baseTime),
                game.gameDuration + game.revealDuration,
              )
            : null;
          outcomeEnd =
            game.bufferTime ||
            (revealEnd ? addMinutes(revealEnd, game.bufferDuration) : null);
        } else if (gameName === "ARV") {
          outcomeEnd = game.outcomeTime ? new Date(game.outcomeTime) : null;
        }

        if (!outcomeEnd || now.getTime() >= outcomeEnd.getTime()) {
          await model.findByIdAndUpdate(game._id, {
            isCompleted: true,
            isActive: false,
            isPartiallyActive: false,
            status: "expired",
            outcomeTime: outcomeEnd || now,
          });

          await CompletedTargets.findOneAndUpdate(
            { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
            {
              $push: {
                [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: game._id,
              },
            },
            { upsert: true },
          );

          await Notification.deleteMany({ targetCode: game.code });

          await emitGlobalNotification(io, {
            message:
              gameName === "ARV"
                ? `The ARV game with target code ${game.code} has now ended! Wait for the result.`
                : ` The ${gameName} game with target code ${game.code} has now ended.`,
            targetCode: game.code,
          });
        }
      }

      // Start new ARV game if none are active/stuck
      if (!stuckGames.length && gameName === "ARV") {
        const nextGame = await startNextGameFromCron(
          model,
          io,
          console.error,
          gameName,
        );
        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New ARV game ${nextGame.code} has started!`,
            targetCode: nextGame.code,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error in manageGameLifecycle (${gameName}):`, error);
  }
};

const initCronJobs = (io) => {
  cron.schedule("*/5 * * * *", () => {
    checkInactiveUsers(io);
  });

  cron.schedule("*/10 * * * * *", () => {
    manageGameLifecycle(io, ARVTarget, "ARV");
    manageGameLifecycle(io, TMCTarget, "TMC");
  });

  cron.schedule("0 0 * * *", () => {
    checkAllUsersForCycleRenewal(io);
  });
};

export { initCronJobs };
