import { CategoryImage } from "../model/categoryImage.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.util.js";
import { deleteFromCloudinary } from "../utils/cloudinaryDestroy.util.js";

// Helper: Create or update category and subcategory
const createCategoryAndSubCategory = async (
  categoryName,
  subCategoryName = null
) => {
  // Normalize to lowercase for case-insensitive matching
  const normalizedCategoryName = categoryName.toLowerCase();
  let category = await CategoryImage.findOne({
    categoryName: { $regex: `^${normalizedCategoryName}$`, $options: "i" },
  });

  // If category doesn't exist, create a new one
  if (!category) {
    category = new CategoryImage({ categoryName, subCategories: [] });
  }

  // If subCategoryName is provided, add or update subcategory
  if (subCategoryName) {
    const normalizedSubCategoryName = subCategoryName.toLowerCase();
    let subCategory = category.subCategories.find(
      (sc) => sc.name.toLowerCase() === normalizedSubCategoryName
    );

    // If subcategory doesn't exist, create a new one
    if (!subCategory) {
      subCategory = { name: subCategoryName, images: [] };
      category.subCategories.push(subCategory);
    }
  }

  // Save category
  await category.save();
  return category;
};

// Create category (with optional subcategory)
const createCategory = async (req, res) => {
  const { categoryName, subCategoryName } = req.body;

  // Validate input
  if (!categoryName) {
    return res
      .status(400)
      .json({ status: false, message: "Category name is required" });
  }

  try {
    // Create or find category and optionally add subcategory
    const category = await createCategoryAndSubCategory(
      categoryName,
      subCategoryName
    );

    return res.json({
      status: true,
      message: subCategoryName
        ? "Category and subcategory created successfully"
        : "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.log("Error creating category:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

// Add subcategory to existing category
const addSubCategory = async (req, res) => {
  const { categoryName, subCategoryName } = req.body;

  // Validate input
  if (!categoryName || !subCategoryName) {
    return res.status(400).json({
      status: false,
      message: "Both category name and subcategory name are required",
    });
  }

  try {
    // Find category
    const normalizedCategoryName = categoryName.toLowerCase();
    let category = await CategoryImage.findOne({
      categoryName: { $regex: `^${normalizedCategoryName}$`, $options: "i" },
    });
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    // Check if subcategory already exists
    const normalizedSubCategoryName = subCategoryName.toLowerCase();
    if (
      category.subCategories.some(
        (sc) => sc.name.toLowerCase() === normalizedSubCategoryName
      )
    ) {
      return res.status(400).json({
        status: false,
        message: "Subcategory already exists",
      });
    }

    // Add new subcategory
    category.subCategories.push({ name: subCategoryName, images: [] });
    await category.save();

    return res.json({
      status: true,
      message: "Subcategory added successfully",
      data: category,
    });
  } catch (error) {
    console.log("Error adding subcategory:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

// Category-wise image upload
const categoryWiseImageUpload = async (req, res) => {
  try {
    const { categoryName, subCategoryName } = req.body;

    // Validate input
    if (!categoryName || !subCategoryName || !req.file) {
      return res.status(400).json({
        status: false,
        message: "Category name, subcategory name, and image are required",
      });
    }

    // Find category
    const normalizedCategoryName = categoryName.toLowerCase();
    let category = await CategoryImage.findOne({
      categoryName: { $regex: `^${normalizedCategoryName}$`, $options: "i" },
    });
    if (!category) {
      return res
        .status(404)
        .json({ status: false, message: "Category not found" });
    }

    // Find subcategory and validate it belongs to the category
    const normalizedSubCategoryName = subCategoryName.toLowerCase();
    let subCategory = category.subCategories.find(
      (sc) => sc.name.toLowerCase() === normalizedSubCategoryName
    );
    if (!subCategory) {
      return res.status(404).json({
        status: false,
        message:
          "Subcategory not found or does not belong to the specified category",
      });
    }

    // Cloudinary upload
    const cloudinaryUpload = await uploadOnCloudinary(req.file.buffer, {
      resource_type: "auto",
    });
    const imageUrl = cloudinaryUpload?.secure_url;

    // Add image URL to subcategory
    subCategory.images.push({ imageUrl });
    await category.save();

    return res.json({
      status: true,
      message: "Image uploaded successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

// Get subcategories for a specific category
const getSubCategoriesByCategory = async (req, res) => {
  try {
    const { categoryName } = req.params;

    const normalizedCategoryName = categoryName.toLowerCase();
    const category = await CategoryImage.findOne(
      {
        categoryName: { $regex: `^${normalizedCategoryName}$`, $options: "i" },
      },
      { subCategories: 1 }
    );
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    const subCategoryNames = category.subCategories.map((sc) => sc.name);

    return res.status(200).json({
      status: true,
      message: "Subcategories fetched successfully",
      data: subCategoryNames,
    });
  } catch (error) {
    console.log("Error fetching subcategories:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

// Get all categories
const getAllCategories = async (_, res) => {
  try {
    const categories = await CategoryImage.find({});
    if (!categories.length) {
      return res
        .status(404)
        .json({ status: false, message: "No categories found" });
    }
    return res.status(200).json({
      status: true,
      message: "All categories fetched successfully",
      data: categories,
    });
  } catch (error) {
    console.log("Error getting categories:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

// Get category and subcategory names
const getCategoryAndSubCategoryNames = async (req, res) => {
  try {
    const categories = await CategoryImage.find({}, { _id: 0, __v: 0 });
    if (!categories.length) {
      return res
        .status(404)
        .json({ status: false, message: "No categories found" });
    }
    const categoryNames = categories.map((category) => ({
      categoryName: category.categoryName,
      subCategoryNames: category.subCategories.map(
        (subCategory) => subCategory.name
      ),
    }));
    return res.status(200).json({
      status: true,
      message: "All categories fetched successfully",
      data: categoryNames,
    });
  } catch (error) {
    console.log("Error getting categories:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

// Update category
const updateCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { categoryName, subCategoryName } = req.body;

    // Find the category by ID
    let category = await CategoryImage.findById(id);
    if (!category) {
      return res
        .status(404)
        .json({ status: false, message: "Category not found" });
    }

    // Update category name if provided
    if (categoryName) {
      category.categoryName = categoryName;
    }

    // Find the first subcategory
    let subCategory = category.subCategories[0];
    if (!subCategory) {
      return res
        .status(404)
        .json({ status: false, message: "Subcategory not found" });
    }

    // Update subcategory name if provided
    if (subCategoryName) {
      subCategory.name = subCategoryName;
    }

    // Upload new image if provided
    if (req.file) {
      // Upload to Cloudinary
      const cloudinaryUpload = await uploadOnCloudinary(req.file.buffer, {
        resource_type: "auto",
      });

      // Delete old Cloudinary image if exists
      if (subCategory.images.length > 0) {
        const oldImageUrl = subCategory.images[0].imageUrl;
        const publicId = oldImageUrl.split("/").pop().split(".")[0];
        await deleteFromCloudinary(publicId);
      }

      // Update subcategory image
      subCategory.images = [{ imageUrl: cloudinaryUpload.secure_url }];
    }

    // Save updated category
    await category.save();

    return res.status(200).json({
      status: true,
      message: "Update successful",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

// Delete category
const deleteCategoryById = async (req, res, next) => {
  const { id, imageId, subCategoryName } = req.params;

  try {
    const category = await CategoryImage.findById(id);
    if (!category) {
      return res
        .status(404)
        .json({ status: false, message: "Category not found" });
    }

    // Find the subCategory
    const subCategoryIndex = category.subCategories.findIndex(
      (subCat) => subCat.name === subCategoryName
    );

    if (subCategoryIndex === -1) {
      return res
        .status(404)
        .json({ status: false, message: "Subcategory not found" });
    }

    const subCategory = category.subCategories[subCategoryIndex];

    // Find the image
    const imageIndex = subCategory.images.findIndex(
      (img) => img._id.toString() === imageId
    );

    if (imageIndex === -1) {
      return res
        .status(404)
        .json({ status: false, message: "Image not found" });
    }

    // Delete from Cloudinary
    const publicId = subCategory.images[imageIndex].imageUrl
      .split("/")
      .pop()
      .split(".")[0];

    await deleteFromCloudinary(publicId);

    // Remove the image
    subCategory.images.splice(imageIndex, 1);

    // If no images left, remove the subCategory
    if (subCategory.images.length === 0) {
      category.subCategories.splice(subCategoryIndex, 1);
    }

    // If no subCategories left, delete the whole category
    if (category.subCategories.length === 0) {
      await CategoryImage.findByIdAndDelete(id);
      return res
        .status(200)
        .json({ status: true, message: "Image deleted successfully" });
    }

    // Otherwise, save the updated document
    await category.save();

    return res.status(200).json({
      status: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Get category images for frontend
const getCategoryImages = async (req, res, next) => {
  try {
    const { categoryName } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const normalizedCategoryName = categoryName.toLowerCase();
    const category = await CategoryImage.findOne({
      categoryName: { $regex: `^${normalizedCategoryName}$`, $options: "i" },
    });
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    // Default pagination values
    const itemsPerPage = parseInt(limit) || 10;
    const currentPage = parseInt(page) || 1;

    // Loop through subcategories and paginate their images
    const paginatedSubCategories = category.subCategories.map((subCategory) => {
      const totalItems = subCategory.images.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      const validPage = Math.max(1, Math.min(currentPage, totalPages));

      const startIndex = (validPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedImages = subCategory.images
        .slice(startIndex, endIndex)
        .map((img) => ({
          imageId: img._id,
          image: img.imageUrl,
          status: img.status || "unused",
          usedAt: img.usedAt || null,
        }));

      return {
        name: subCategory.name,
        images: paginatedImages,
        pagination: {
          currentPage: validPage,
          totalPages,
          totalItems,
          itemsPerPage,
        },
      };
    });

    return res.status(200).json({
      status: true,
      message: "Category images fetched successfully",
      data: paginatedSubCategories,
    });
  } catch (error) {
    next(error);
  }
};

// Get subcategory images for frontend
const getSubCategoryImages = async (req, res, next) => {
  try {
    const { categoryName, subCategoryName } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const normalizedCategoryName = categoryName.toLowerCase();
    const category = await CategoryImage.findOne({
      categoryName: { $regex: `^${normalizedCategoryName}$`, $options: "i" },
    });
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    const normalizedSubCategoryName = subCategoryName.toLowerCase();
    const subCategory = category.subCategories.find(
      (subCat) => subCat.name.toLowerCase() === normalizedSubCategoryName
    );

    if (!subCategory) {
      return res.status(404).json({
        status: false,
        message: "Subcategory not found",
      });
    }

    // Default pagination values
    const itemsPerPage = parseInt(limit) || 10;
    const currentPage = parseInt(page) || 1;

    // Pagination calculations
    const totalItems = subCategory.images.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const validPage = Math.max(1, Math.min(currentPage, totalPages));

    const startIndex = (validPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedImages = subCategory.images
      .slice(startIndex, endIndex)
      .map((img) => ({
        imageId: img._id,
        image: img.imageUrl,
        status: img.status || "unused",
        usedAt: img.usedAt || null,
      }));

    return res.status(200).json({
      status: true,
      message: "Subcategory images fetched successfully",
      data: [
        {
          name: subCategory.name,
          images: paginatedImages,
          pagination: {
            currentPage: validPage,
            totalPages,
            totalItems,
            itemsPerPage,
          },
        },
      ],
    });
  } catch (error) {
    next(error);
  }
};

// Get all images
const getAllImages = async (req, res, next) => {
  try {
    const categories = await CategoryImage.find();

    const allImages = [];

    categories.forEach((category) => {
      category.subCategories.forEach((sub) => {
        sub.images.forEach((img) => {
          allImages.push({
            imageId: img._id,
            categoryId: category._id,
            categoryName: category.categoryName,
            subcategoryName: sub.name,
            image: img.imageUrl,
            status: img.status || "unused",
            usedAt: img.usedAt || null,
          });
        });
      });
    });

    return res.status(200).json({
      status: true,
      data: allImages,
      message: "All images fetched successfully by category and subcategory",
    });
  } catch (error) {
    next(error);
  }
};

// Get all used images
const getAllUsedImages = async (_, res, next) => {
  try {
    const categories = await CategoryImage.find({});

    const allUsedImages = [];

    categories.forEach((category) => {
      category.subCategories.forEach((sub) => {
        sub.images.forEach((img) => {
          if (img.isUsed) {
            allUsedImages.push({
              imageId: img._id,
              categoryId: category._id,
              categoryName: category.categoryName,
              subcategoryName: sub.name,
              image: img.imageUrl,
              status: img.status || "used",
              usedAt: img.usedAt || null,
            });
          }
        });
      });
    });

    return res.status(200).json({
      status: true,
      data: allUsedImages,
      message:
        "All used images fetched successfully by category and subcategory",
    });
  } catch (error) {
    next(error);
  }
};

// Update image isUsed status
const updateImageIsUsedStatus = async (req, res, next) => {
  const { imageId, categoryId: id } = req.params;
  try {
    const categoryImage = await CategoryImage.findById(id);

    if (!categoryImage) {
      return res
        .status(404)
        .json({ status: false, message: "Category not found" });
    }

    let imageFound = false;

    for (const subCategory of categoryImage.subCategories) {
      const image = subCategory.images.id(imageId);
      if (image) {
        image.isUsed = true;
        image.status = "used";
        image.usedAt = new Date();
        imageFound = true;
        break;
      }
    }

    if (!imageFound) {
      return res.status(404).json({
        status: false,
        message: "Image not found in subcategories",
      });
    }

    await categoryImage.save();

    return res.status(200).json({
      status: true,
      message: "Image isUsed status updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export {
  createCategory,
  addSubCategory,
  categoryWiseImageUpload,
  getCategoryImages,
  getSubCategoryImages,
  getAllCategories,
  updateCategoryById,
  deleteCategoryById,
  getAllImages,
  getCategoryAndSubCategoryNames,
  updateImageIsUsedStatus,
  getAllUsedImages,
  getSubCategoriesByCategory,
};
