import mongoose, { Schema } from "mongoose";

const gameQueueSchema = new Schema(
  {
    TMCTargets: [
      {
        type: Schema.Types.ObjectId,
        ref: "TMCTarget",
      },
    ],
    ARVTargets: [
      {
        type: Schema.Types.ObjectId,
        ref: "ARVTarget",
      },
    ],
    isTMCQueueActive: {
      type: Boolean,
      default: false,
    },
    isARVQueueActive: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const GameQueue = mongoose.model("GameQueue", gameQueueSchema);
