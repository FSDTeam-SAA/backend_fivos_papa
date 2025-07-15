// model/completedTargets.model.js
import mongoose, { Schema } from "mongoose";

const completedTargetsSchema = new Schema(
  {
    ARVTargets: [
      {
        type: Schema.Types.ObjectId,
        ref: "ARVTarget",
      },
    ],
    TMCTargets: [
      {
        type: Schema.Types.ObjectId,
        ref: "TMCTarget",
      },
    ],
    ARVQueueStarted: {
      type: Boolean,
      default: false,
    },
    TMCQueueStarted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const CompletedTargets = mongoose.model(
  "CompletedTargets",
  completedTargetsSchema
);
