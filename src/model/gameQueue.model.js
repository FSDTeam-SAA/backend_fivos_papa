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
  },
  { timestamps: true }
);

export const GameQueue = mongoose.model("GameQueue", gameQueueSchema);
