const Cart = require("../models/cart.model");
const Product = require("../models/Product");
const { applyOffersToProducts } = require("../utils/offerHelper");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// GET USER CART
exports.getCart = catchAsync(async (req, res, next) => {
  if (req.user.id === "env-admin") {
    return res.json({ items: [] });
  }
  const cartDoc = await Cart.findOne({ user: req.user.id })
    .populate("items.product");

  if (!cartDoc) {
    return res.json({ items: [] });
  }

  const cart = cartDoc.toObject();

  // Apply Offers to product data
  if (cart.items && cart.items.length > 0) {
    const productDocs = cart.items.map(item => item.product).filter(Boolean);
    const appliedProducts = await applyOffersToProducts(productDocs);

    let productIdx = 0;
    cart.items.forEach(item => {
      if (item.product) {
        item.product = appliedProducts[productIdx++];
      }
    });
  }

  res.json(cart);
});

// ADD TO CART
exports.addToCart = catchAsync(async (req, res, next) => {
  if (req.user.id === "env-admin") {
    return next(new AppError("Admin accounts cannot add to cart", 403));
  }

  const { productId, quantity, size } = req.body;

  // Find the product to check stock limits
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  let availableStock = 0;
  if (product.sizes && product.sizes.length > 0) {
    const sizeVariant = product.sizes.find(s => String(s.size) === size);
    availableStock = sizeVariant ? sizeVariant.stock : 0;
  } else {
    availableStock = product.stock || 0;
  }

  let cart = await Cart.findOne({ user: req.user.id });

  if (!cart) {
    cart = new Cart({
      user: req.user.id,
      items: []
    });
  }

  const existingItem = cart.items.find(
    item => item.product && item.product.toString() === productId && item.size === size
  );

  let newQuantity = quantity;
  if (existingItem) {
    newQuantity = existingItem.quantity + quantity;
  }

  if (newQuantity > availableStock) {
    return res.status(400).json({
      limitReached: true,
      message: `Stock limit reached. You can only add up to ${availableStock} items of this size/product.`
    });
  }

  if (existingItem) {
    existingItem.quantity = newQuantity;
    if (existingItem.quantity <= 0) {
      cart.items = cart.items.filter(i => i._id.toString() !== existingItem._id.toString());
    }
  } else if (quantity > 0) {
    cart.items.push({ product: productId, quantity: quantity, size: size });
  }

  await cart.save();

  // Populate to return full cart immediately if needed by frontend
  const populatedCart = await Cart.findById(cart._id).populate("items.product");
  res.json(populatedCart);
});

// REMOVE ITEM
exports.removeItem = catchAsync(async (req, res, next) => {
  if (req.user.id === "env-admin") {
    return next(new AppError("Admin accounts cannot use cart", 403));
  }

  const { productId, size } = req.params;

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return next(new AppError("Cart not found", 404));

  cart.items = cart.items.filter(item => {
    if (req.query.size && item.size) {
      return !(item.product.toString() === productId && item.size === req.query.size);
    }
    return item.product.toString() !== productId;
  });

  await cart.save();
  res.json(cart);
});
