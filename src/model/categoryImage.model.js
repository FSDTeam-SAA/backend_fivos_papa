import mongoose, { Schema } from "mongoose";

const categoryImageSchema = new Schema({
  categoryName: {
    type: String,
    required: true,
  },
  subCategories: [
    {
      name: {
        type: String,
        required: true,
      },
      images: [
        {
          imageUrl: String,
          isUsed: {
            type: Boolean,
            default: false,
          },
          status: {
            type: String,
            enum: ["unused", "used", "reserved"],
            default: "unused",
          },
          usedAt: {
            type: Date,
            default: null,
          },
        },
      ],
    },
  ],
});

export const CategoryImage = mongoose.model(
  "CategoryImage",
  categoryImageSchema
);
