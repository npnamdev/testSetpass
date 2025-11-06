const mongoose = require('mongoose');

// OTP Schema
const otpSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    phoneNumber: {
        type: String,
        required: true,
        match: /^0\d{8,10}$/
    },
    otpCode: {
        type: String,
        required: true,
        length: 6,
        match: /^\d{6}$/
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0
    },
    maxAttempts: {
        type: Number,
        default: 5,
        min: 1
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiryTime: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 }
    }
}, {
    timestamps: true
});

// Index để optimize queries
otpSchema.index({ userId: 1, isUsed: 1, expiryTime: 1 });
otpSchema.index({ expiryTime: 1 }, { expireAfterSeconds: 0 });

// Virtual để check expired
otpSchema.virtual('isExpired').get(function () {
    return new Date() > this.expiryTime;
});

// Static methods
otpSchema.statics.createOTP = async function (userId, phoneNumber) {
    try {
        // Xóa OTP cũ của user này
        await this.deleteMany({ userId: userId });

        const otpCode = this.generateOTPCode();
        const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

        const otpRecord = new this({
            userId: userId,
            phoneNumber: phoneNumber,
            otpCode: otpCode,
            expiryTime: expiryTime
        });

        await otpRecord.save();

        console.log(`📱 OTP created for user ${userId}: ${otpCode} (expires at ${expiryTime.toLocaleString()})`);

        return otpRecord;
    } catch (error) {
        console.error('Error creating OTP:', error);
        throw error;
    }
};

// Tìm OTP active theo userId
otpSchema.statics.findActiveOTPByUserId = async function (userId) {
    try {
        const otpRecord = await this.findOne({
            userId: userId,
            isUsed: false,
            expiryTime: { $gt: new Date() }
        });

        return otpRecord;
    } catch (error) {
        console.error('Error finding OTP:', error);
        throw error;
    }
};

// Xác thực OTP
otpSchema.statics.verifyOTP = async function (userId, inputOTP) {
    try {
        const otpRecord = await this.findActiveOTPByUserId(userId);

        if (!otpRecord) {
            return {
                success: false,
                message: 'OTP không tồn tại hoặc đã hết hạn',
                code: 'OTP_NOT_FOUND'
            };
        }

        if (otpRecord.isExpired) {
            return {
                success: false,
                message: 'OTP đã hết hạn',
                code: 'OTP_EXPIRED'
            };
        }

        if (otpRecord.isUsed) {
            return {
                success: false,
                message: 'OTP đã được sử dụng',
                code: 'OTP_USED'
            };
        }

        // Tăng số lần thử
        otpRecord.attempts++;

        if (otpRecord.attempts > otpRecord.maxAttempts) {
            otpRecord.isUsed = true;
            await otpRecord.save();
            return {
                success: false,
                message: 'Vượt quá số lần thử cho phép',
                code: 'MAX_ATTEMPTS_EXCEEDED'
            };
        }

        if (otpRecord.otpCode !== inputOTP) {
            await otpRecord.save();
            return {
                success: false,
                message: `OTP không đúng. Còn ${otpRecord.maxAttempts - otpRecord.attempts} lần thử`,
                code: 'OTP_INCORRECT',
                attemptsLeft: otpRecord.maxAttempts - otpRecord.attempts
            };
        }

        // OTP đúng
        otpRecord.isUsed = true;
        await otpRecord.save();

        return {
            success: true,
            message: 'OTP xác thực thành công',
            code: 'OTP_VERIFIED'
        };
    } catch (error) {
        console.error('Error verifying OTP:', error);
        throw error;
    }
};

// Tạo mã OTP 6 chữ số
otpSchema.statics.generateOTPCode = function () {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Lấy thống kê
otpSchema.statics.getStats = async function () {
    try {
        const total = await this.countDocuments();
        const active = await this.countDocuments({
            isUsed: false,
            expiryTime: { $gt: new Date() }
        });
        const expired = await this.countDocuments({
            expiryTime: { $lte: new Date() }
        });
        const used = await this.countDocuments({
            isUsed: true
        });

        return {
            total,
            active,
            expired,
            used
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        throw error;
    }
};

// Cleanup OTP hết hạn (MongoDB TTL sẽ tự động xóa)
otpSchema.statics.cleanupExpiredOTPs = async function () {
    try {
        const result = await this.deleteMany({
            $or: [
                { expiryTime: { $lte: new Date() } },
                { isUsed: true }
            ]
        });

        if (result.deletedCount > 0) {
            console.log(`🧹 Cleaned up ${result.deletedCount} expired/used OTP records`);
        }

        return result.deletedCount;
    } catch (error) {
        console.error('Error cleaning up OTPs:', error);
        throw error;
    }
};

// Instance methods
otpSchema.methods.isExpiredCheck = function () {
    return new Date() > this.expiryTime;
};

// Create model
const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;