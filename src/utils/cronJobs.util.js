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

const addMinutes = (start, minutes) => {
  if (!start || isNaN(start.getTime())) {
    return new Date();
  }
  return new Date(start.getTime() + minutes * 60000);
};

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
  } catch (error) {}
};

const manageGameLifecycle = async (io, model, gameName) => {
  const now = new Date();

  try {
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
        gameDuration,
        revealDuration,
        outcomeDuration,
        bufferDuration,
        status,
        startNotified,
        revealNotified,
        outcomeNotified,
        bufferNotified,
      } = game;

      const baseTime = gameName === "TMC" ? startTime : gameTime;
      if (!baseTime || isNaN(baseTime.getTime())) {
        await model.findByIdAndUpdate(_id, {
          isCompleted: true,
          isActive: false,
          isPartiallyActive: false,
          status: "expired",
          bufferTime: now,
        });

        await CompletedTargets.findOneAndUpdate(
          { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
          {
            $push: { [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: _id },
          },
          { upsert: true }
        );

        await Notification.deleteMany({ targetCode: code });
        await emitGlobalNotification(io, {
          message: `${gameName} game ${code} has expired (forced due to invalid baseTime).`,
          targetCode: code,
        });

        const nextGame = await startNextGameFromCron(
          model,
          io,
          console.error,
          gameName
        );
        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New ${gameName} game ${nextGame.code} has started!`,
            targetCode: nextGame.code,
          });
        }
        continue;
      }

      const gameEnd = addMinutes(new Date(baseTime), gameDuration);
      const revealEnd = addMinutes(gameEnd, revealDuration);
      const outcomeEnd =
        gameName === "ARV" ? addMinutes(revealEnd, outcomeDuration || 0) : null;
      const bufferEnd = addMinutes(
        gameName === "TMC" ? revealEnd : outcomeEnd,
        bufferDuration
      );

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

          if (submissions.length === 0) {
            await emitGlobalNotification(io, {
              message: `TMC game ${code} has been revealed!`,
              targetCode: code,
            });
          } else {
            for (const submission of submissions) {
              const entry = submission.participatedTMCTargets.find(
                (e) => e.TMCId.toString() === _id.toString()
              );
              if (entry) {
                await emitNotification(io, {
                  userId: submission.userId,
                  targetCode: code,
                  message: `Your TMC game ${code} has been revealed! You earned ${entry.points} points.`,
                });
              }
            }

            await emitGlobalNotification(io, {
              message: `TMC game ${code} has been revealed!`,
              targetCode: code,
            });
          }
        } else {
          // ARV Reveal
          if (!revealNotified) {
            await emitGlobalNotification(io, {
              message: `${gameName} game ${code} has been revealed!`,
              targetCode: code,
            });
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

        await emitGlobalNotification(io, {
          message: `${gameName} game ${code} has reached outcome time!`,
          targetCode: code,
        });
      }

      // Buffer Notification (Both TMC & ARV)
      if (
        ((gameName === "ARV" &&
          status === "completed" &&
          now.getTime() >= outcomeEnd.getTime()) ||
          (gameName === "TMC" &&
            status === "revealed" &&
            now.getTime() >= revealEnd.getTime())) &&
        !bufferNotified
      ) {
        await model.findByIdAndUpdate(game._id, { bufferNotified: true });

        await emitGlobalNotification(io, {
          message: `${gameName} game ${code} is in buffer stage.`,
          targetCode: code,
        });
      }

      // Expire after Buffer
      if (now.getTime() >= bufferEnd.getTime()) {
        if (
          status === "active" ||
          status === "revealed" ||
          (gameName === "ARV" && status === "completed")
        ) {
          await model.findByIdAndUpdate(_id, {
            isCompleted: true,
            isActive: false,
            isPartiallyActive: false,
            status: "expired",
            bufferTime: now,
          });

          await CompletedTargets.findOneAndUpdate(
            { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
            {
              $push: {
                [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: _id,
              },
            },
            { upsert: true }
          );

          await Notification.deleteMany({ targetCode: code });

          await emitGlobalNotification(io, {
            message: `${gameName} game ${code} has expired.`,
            targetCode: code,
          });

          const nextGame = await startNextGameFromCron(
            model,
            io,
            console.error,
            gameName
          );
          if (nextGame) {
            await emitGlobalNotification(io, {
              message: `New ${gameName} game ${nextGame.code} has started!`,
              targetCode: nextGame.code,
            });
          }
        }
      }
    }

    // 🔁 Force Expire Old Stuck Games
    if (!activeGames.length) {
      const stuckGames = await model
        .find({
          $or: [
            { status: "revealed", isCompleted: false },
            { status: "completed", isCompleted: false }, // For ARV
          ],
        })
        .lean();

      for (const game of stuckGames) {
        const baseTime = gameName === "TMC" ? game.startTime : game.gameTime;
        const revealEnd = baseTime
          ? addMinutes(
              new Date(baseTime),
              game.gameDuration + game.revealDuration
            )
          : null;
        const outcomeEnd =
          gameName === "ARV" && revealEnd
            ? addMinutes(revealEnd, game.outcomeDuration || 0)
            : null;
        const bufferEnd =
          game.bufferTime ||
          (gameName === "TMC"
            ? addMinutes(revealEnd, game.bufferDuration)
            : addMinutes(outcomeEnd, game.bufferDuration));

        if (!bufferEnd || now.getTime() >= bufferEnd.getTime()) {
          await model.findByIdAndUpdate(game._id, {
            isCompleted: true,
            isActive: false,
            isPartiallyActive: false,
            status: "expired",
            bufferTime: bufferEnd || now,
          });

          await CompletedTargets.findOneAndUpdate(
            { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
            {
              $push: {
                [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: game._id,
              },
            },
            { upsert: true }
          );

          await Notification.deleteMany({ targetCode: game.code });

          await emitGlobalNotification(io, {
            message: `${gameName} game ${game.code} has expired (forced).`,
            targetCode: game.code,
          });
        }
      }

      // Start new game if none are active/stuck
      if (!stuckGames.length) {
        const nextGame = await startNextGameFromCron(
          model,
          io,
          console.error,
          gameName
        );
        if (nextGame) {
          await emitGlobalNotification(io, {
            message: `New ${gameName} game ${nextGame.code} has started!`,
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
};

export { initCronJobs };
