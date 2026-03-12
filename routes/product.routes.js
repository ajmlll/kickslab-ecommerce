const express = require('express');
const router = express.Router();
const {
    createProduct,
    getAllProducts,
    getProduct,
    updateProduct,
    deleteProduct,
    getSearchSuggestions
} = require('../controllers/product.controller');
const productUpload = require('../middlewares/productUpload');
const { validateProduct } = require('../middlewares/productValidator');
const multer = require('multer');

// Middleware helper for robust file upload error handling
const uploadHandler = (req, res, next) => {
    productUpload.any()(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `Upload Error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ message: `Upload Error: ${err.message}` });
        }

        // Transform files array into object for controller compatibility
        if (req.files) {
            const filesObj = {};
            req.files.forEach(file => {
                if (!filesObj[file.fieldname]) {
                    filesObj[file.fieldname] = [];
                }
                filesObj[file.fieldname].push(file);
            });
            req.files = filesObj;
        }
        next();
    });
};

const { protect, adminOnly, authorizeLevels } = require("../middlewares/auth.middleware");

router.post('/products', protect, adminOnly, uploadHandler, validateProduct, createProduct);
router.get('/products', getAllProducts);
router.get('/products/suggestions', getSearchSuggestions);
router.get('/products/:id', getProduct);
router.put('/products/:id', protect, adminOnly, uploadHandler, validateProduct, updateProduct);
router.delete('/products/:id', protect, adminOnly, deleteProduct);

module.exports = router;
