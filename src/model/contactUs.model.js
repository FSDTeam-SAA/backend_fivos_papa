import mongoose, { Schema } from "mongoose";

const contactUsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
    },
    email: {
      type: String,
    },
    subject: {
      type: String,
    },
    message: {
      type: String,
    },
    replied: { type: Boolean, default: false },
    replySubject: String,
    replyMessage: String,
  },
  { timestamps: true }
);

export const ContactUs = mongoose.model("ContactUs", contactUsSchema);
