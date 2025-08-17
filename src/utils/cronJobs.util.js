import mongoose from "mongoose";
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
import { checkTierUpdate } from "../controller/userSubmission.controller.js";

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
  } catch (error) {
    console.error("Error in checkInactiveUsers:", error);
  }
};

const manageGameLifecycle = async (io, model, gameName) => {
  const now = new Date();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Check for active games
      const activeGames = await model
        .find({
          $or: [{ isActive: true }, { isPartiallyActive: true }],
          isCompleted: false,
        })
        .session(session)
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
          resultImage,
        } = game;

        const baseTime = gameName === "TMC" ? startTime : gameTime;
        if (
          !baseTime ||
          isNaN(baseTime.getTime()) ||
          (gameName === "ARV" && (!revealTime || !outcomeTime))
        ) {
          await model.findByIdAndUpdate(
            _id,
            {
              isCompleted: true,
              isActive: false,
              isPartiallyActive: false,
              status: "expired",
              outcomeTime: now,
            },
            { session }
          );

          await CompletedTargets.findOneAndUpdate(
            { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
            {
              $push: {
                [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: _id,
              },
            },
            { upsert: true, session }
          );

          await Notification.deleteMany({ targetCode: code }, { session });
          await emitGlobalNotification(io, {
            message:
              gameName === "ARV"
                ? `The ARV game ${code} is now expired! wait for the result.`
                : `${gameName} game ${code} has expired (forced).`,
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
          await model.findByIdAndUpdate(
            _id,
            { startNotified: true },
            { session }
          );
          await emitGlobalNotification(io, {
            message: `ARV game ${code} has started!`,
            targetCode: code,
          });
        }

        // Reveal Logic
        if (status === "active" && now.getTime() >= gameEnd.getTime()) {
          await model.findByIdAndUpdate(
            _id,
            {
              isActive: false,
              isPartiallyActive: true,
              status: "revealed",
              revealNotified: true,
            },
            { session }
          );

          if (gameName === "TMC") {
            const submissions = await UserSubmission.find({
              "participatedTMCTargets.TMCId": _id,
            }).session(session);

            let messageSent = false;
            if (submissions.length > 0) {
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
              messageSent = true;
            }

            await emitGlobalNotification(io, {
              message: messageSent
                ? `TMC game ${code} has been revealed!`
                : `TMC game ${code} has been revealed!`,
              targetCode: code,
            });
          } else if (gameName === "ARV") {
            const submissions = await UserSubmission.find({
              "participatedARVTargets.ARVId": _id,
            }).session(session);

            let messageSent = false;
            if (submissions.length > 0) {
              for (const submission of submissions) {
                const entry = submission.participatedARVTargets.find(
                  (e) => e.ARVId.toString() === _id.toString()
                );
                if (entry) {
                  await emitNotification(io, {
                    userId: submission.userId,
                    targetCode: code,
                    message: `Your ARV game ${code} has been revealed!`,
                  });
                }
              }
              messageSent = true;
            }

            await emitGlobalNotification(io, {
              message: messageSent
                ? `Your ARV game ${code} has been revealed!`
                : `Your ARV game ${code} has been revealed!`,
              targetCode: code,
            });
          }
        }

        // ARV Outcome with Auto-Point Calculation
        if (
          gameName === "ARV" &&
          status === "revealed" &&
          now.getTime() >= revealEnd.getTime() &&
          !outcomeNotified
        ) {
          const submissions = await UserSubmission.find({
            "participatedARVTargets.ARVId": _id,
          }).session(session);

          let messageSent = false;

          if (submissions.length > 0) {
            for (const submission of submissions) {
              const entry = submission.participatedARVTargets.find(
                (e) => e.ARVId.toString() === _id.toString()
              );

              if (entry && entry.points === 0) {
                const points = entry.submittedImage === resultImage ? 25 : -10;

                entry.points = points;
                submission.totalPoints += points;
                await submission.save({ session });

                const user = await User.findById(submission.userId).session(
                  session
                );
                if (user) {
                  user.totalPoints += points;
                  await user.save({ session });

                  const tierUpdate = await checkTierUpdate(user._id);
                  if (tierUpdate?.changed) {
                    submission.tierRank = tierUpdate.newTier;
                    await submission.save({ session });
                  }
                }

                messageSent = true;
              }
            }
          }

          await model.findByIdAndUpdate(
            _id,
            {
              isActive: false,
              isPartiallyActive: true,
              status: "completed",
              outcomeNotified: true,
            },
            { session }
          );

          await emitGlobalNotification(io, {
            message: messageSent
              ? `ARV game ${code} has reached outcome!`
              : `ARV game ${code} has reached outcome!`,
            targetCode: code,
          });
          await Notification.create(
            [
              {
                message: `ARV game ${code} has reached outcome! wait for the result`,
                targetCode: code,
              },
            ],
            { session }
          );
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
          await model.findByIdAndUpdate(
            _id,
            {
              isCompleted: true,
              isActive: false,
              isPartiallyActive: false,
              status: "expired",
              outcomeTime: now,
            },
            { session }
          );

          await CompletedTargets.findOneAndUpdate(
            { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
            {
              $push: {
                [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: _id,
              },
            },
            { upsert: true, session }
          );

          await Notification.deleteMany({ targetCode: code }, { session });

          await emitGlobalNotification(io, {
            message:
              gameName === "ARV"
                ? `The ARV game ${code} is now expired! wait for the result.`
                : `${gameName} game ${code} has expired.`,
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

        // Buffer Notification (TMC only)
        if (
          gameName === "TMC" &&
          status === "revealed" &&
          now.getTime() >= revealEnd.getTime() &&
          !bufferNotified
        ) {
          await model.findByIdAndUpdate(
            _id,
            { bufferNotified: true },
            { session }
          );

          await emitGlobalNotification(io, {
            message: `TMC game ${code} is in buffer stage.`,
            targetCode: code,
          });
        }
      }

      // Start queued ARV games if no active games
      if (!activeGames.length && gameName === "ARV") {
        const queue = await GameQueue.findById(
          "67da824e62d5a1b8cfece4c8"
        ).session(session);
        if (queue && queue.isARVQueueActive && queue.ARVTargets.length) {
          const nextGame = await startNextGameFromCron(
            model,
            io,
            console.error,
            gameName
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
          .session(session)
          .lean();

        for (const game of stuckGames) {
          let outcomeEnd;
          if (gameName === "TMC") {
            const baseTime = game.startTime;
            const revealEnd = baseTime
              ? addMinutes(
                  new Date(baseTime),
                  game.gameDuration + game.revealDuration
                )
              : null;
            outcomeEnd =
              game.bufferTime ||
              (revealEnd ? addMinutes(revealEnd, game.bufferDuration) : null);
          } else if (gameName === "ARV") {
            outcomeEnd = game.outcomeTime ? new Date(game.outcomeTime) : null;
          }

          if (!outcomeEnd || now.getTime() >= outcomeEnd.getTime()) {
            await model.findByIdAndUpdate(
              game._id,
              {
                isCompleted: true,
                isActive: false,
                isPartiallyActive: false,
                status: "expired",
                outcomeTime: outcomeEnd || now,
              },
              { session }
            );

            await CompletedTargets.findOneAndUpdate(
              { _id: process.env.COMPLETED_TARGETS_DOCUMENT_ID },
              {
                $push: {
                  [gameName === "TMC" ? "TMCTargets" : "ARVTargets"]: game._id,
                },
              },
              { upsert: true, session }
            );

            await Notification.deleteMany(
              { targetCode: game.code },
              { session }
            );

            await emitGlobalNotification(io, {
              message:
                gameName === "ARV"
                  ? `The ARV game ${game.code} is now expired! wait for the result.`
                  : `${gameName} game ${game.code} has expired (forced).`,
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
            gameName
          );
          if (nextGame) {
            await emitGlobalNotification(io, {
              message: `New ARV game ${nextGame.code} has started!`,
              targetCode: nextGame.code,
            });
          }
        }
      }
    });
  } catch (error) {
    console.error(`Error in manageGameLifecycle (${gameName}):`, error);
  } finally {
    session.endSession();
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
