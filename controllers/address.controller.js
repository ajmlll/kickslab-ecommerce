const Address = require("../models/address.model");

// GET ALL ADDRESSES
exports.getAllAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user.id }).sort({ isDefault: -1, createdAt: -1 });
        res.status(200).json({ success: true, addresses });
    } catch (error) {
        console.error("Get Addresses Error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch addresses." });
    }
};

// ADD NEW ADDRESS
exports.addAddress = async (req, res) => {
    try {
        const { name, address, city, state, zipCode, phone, type, isDefault } = req.body;

        // If user is setting this as default, update all others to not default
        if (isDefault) {
            await Address.updateMany({ user: req.user.id }, { isDefault: false });
        }

        const newAddress = new Address({
            user: req.user.id,
            name,
            address,
            city,
            state,
            zipCode,
            phone,
            type,
            isDefault
        });

        // If it's the first address, make it default automatically
        const count = await Address.countDocuments({ user: req.user.id });
        if (count === 0) {
            newAddress.isDefault = true;
        }

        await newAddress.save();
        res.status(201).json({ success: true, message: "Address added successfully.", address: newAddress });
    } catch (error) {
        console.error("Add Address Error:", error);
        res.status(500).json({ success: false, error: "Failed to add address." });
    }
};

// UPDATE ADDRESS
exports.updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, city, state, zipCode, phone, type, isDefault } = req.body;

        const addressDoc = await Address.findOne({ _id: id, user: req.user.id });
        if (!addressDoc) {
            return res.status(404).json({ success: false, error: "Address not found." });
        }

        if (isDefault && !addressDoc.isDefault) {
            await Address.updateMany({ user: req.user.id }, { isDefault: false });
        }

        addressDoc.name = name;
        addressDoc.address = address;
        addressDoc.city = city;
        addressDoc.state = state;
        addressDoc.zipCode = zipCode;
        addressDoc.phone = phone;
        addressDoc.type = type;

        // Cannot casually unset default if it is the only one, but UI protects against this. For now just set.
        addressDoc.isDefault = isDefault;

        await addressDoc.save();
        res.status(200).json({ success: true, message: "Address updated successfully.", address: addressDoc });
    } catch (error) {
        console.error("Update Address Error:", error);
        res.status(500).json({ success: false, error: "Failed to update address." });
    }
};

// DELETE ADDRESS
exports.deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const addressDoc = await Address.findOneAndDelete({ _id: id, user: req.user.id });

        if (!addressDoc) {
            return res.status(404).json({ success: false, error: "Address not found." });
        }

        // If we deleted the default address, we should assign another one as default if any exist
        if (addressDoc.isDefault) {
            const nextAddress = await Address.findOne({ user: req.user.id });
            if (nextAddress) {
                nextAddress.isDefault = true;
                await nextAddress.save();
            }
        }

        res.status(200).json({ success: true, message: "Address deleted successfully." });
    } catch (error) {
        console.error("Delete Address Error:", error);
        res.status(500).json({ success: false, error: "Failed to delete address." });
    }
};

// SET DEFAULT ADDRESS
exports.setDefaultAddress = async (req, res) => {
    try {
        const { id } = req.params;

        const addressDoc = await Address.findOne({ _id: id, user: req.user.id });
        if (!addressDoc) {
            return res.status(404).json({ success: false, error: "Address not found." });
        }

        await Address.updateMany({ user: req.user.id }, { isDefault: false });

        addressDoc.isDefault = true;
        await addressDoc.save();

        res.status(200).json({ success: true, message: "Default address updated.", address: addressDoc });
    } catch (error) {
        console.error("Set Default Address Error:", error);
        res.status(500).json({ success: false, error: "Failed to set default address." });
    }
};
