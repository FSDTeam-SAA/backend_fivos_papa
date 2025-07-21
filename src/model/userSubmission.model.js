import mongoose, { Schema } from "mongoose";

const UserSubmissionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    participatedTMCTargets: [
      {
        TMCId: {
          type: Schema.Types.ObjectId,
          ref: "TMCTarget",
        },
        firstChoiceImage: {
          type: String,
          default: "",
        },
        secondChoiceImage: {
          type: String,
          default: "",
        },
        points: {
          type: Number,
        },
        submissionTime: {
          type: Date,
        },
      },
    ],
    participatedARVTargets: [
      {
        ARVId: {
          type: Schema.Types.ObjectId,
          ref: "ARVTarget",
        },
        submittedImage: {
          type: String,
          default: "",
        },
        points: {
          type: Number,
          default: 0,
        },
        submissionTime: {
          type: Date,
        },
      },
    ],
    completedChallenges: {
      type: Number,
      default: 0,
    },
    totalPoints: {
      type: Number,
      default: 0,
    },
    lastChallengeDate: {
      type: Date,
    },
    tierRank: {
      type: String,
      default: "NOVICE SEEKER",
    },
    isResultRevealed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const UserSubmission = mongoose.model(
  "UserSubmission",
  UserSubmissionSchema
);
