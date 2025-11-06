const express = require('express');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const OTP = require('./otpSchema');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log('🚀 Connected to MongoDB successfully');
    })
    .catch((error) => {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    });

// Trang chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API lấy domain
app.get('/api/config', (req, res) => {
    res.json({
        domain: process.env.DOMAIN
    });
});

// API tìm kiếm user
app.get('/api/search-user', async (req, res) => {
    const { username } = req.query;

    // Kiểm tra có username
    if (!username) {
        return res.status(400).json({
            error: 'Vui lòng nhập số điện thoại',
            respCode: '01'
        });
    }

    // Validate số điện thoại
    if (!/^0\d{8,10}$/.test(username)) {
        return res.json({
            respCode: '01',
            msg: 'Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại từ 9-11 chữ số bắt đầu bằng số 0.',
            error: 'Invalid phone number format'
        });
    }

    try {
        // Tạo params cho API backend
        const apiParams = {
            token: process.env.TOKEN,
            username: username
        };

        console.log('Calling backend API with params:', apiParams);

        const response = await axios.get(`${process.env.DOMAIN}/manage/api/users/search-user`, {
            params: apiParams
        });

        console.log('Backend response:', response.data);

        // Kiểm tra response từ API backend
        const data = response.data;

        // Nếu không tìm thấy user, trả về thông báo tiếng Việt
        if (!data.user || data.respCode !== '00') {
            return res.json({
                respCode: '01',
                msg: 'Không tìm thấy tài khoản trong hệ thống. Vui lòng kiểm tra lại số điện thoại.',
                error: 'User not found'
            });
        }

        // Tìm thấy user - tạo OTP và gửi
        const user = data.user;
        const otpRecord = await OTP.createOTP(user._id, username);

        // Fake gửi OTP (trong thực tế sẽ gọi API SMS/Email)
        const sendResult = await sendOTPFake(username, otpRecord.otpCode);

        if (!sendResult.success) {
            return res.json({
                respCode: '02',
                msg: 'Không thể gửi OTP. Vui lòng thử lại sau.',
                error: 'Failed to send OTP'
            });
        }

        // Trả về thông tin user và trạng thái gửi OTP thành công
        res.json({
            ...data,
            otpSent: true,
            otpInfo: {
                phoneNumber: username,
                expiryTime: otpRecord.expiryTime,
                attemptsLeft: otpRecord.maxAttempts
            }
        });
    } catch (error) {
        console.error('Search user error:', error.message);

        // Kiểm tra nếu lỗi từ API backend
        if (error.response && error.response.data) {
            const backendData = error.response.data;
            console.log('Backend error response:', backendData);

            if (backendData.msg && backendData.msg.toLowerCase().includes('usernotfound')) {
                return res.json({
                    respCode: '01',
                    msg: 'Không tìm thấy tài khoản trong hệ thống. Vui lòng kiểm tra lại số điện thoại.',
                    error: 'User not found'
                });
            }
        }

        res.status(500).json({
            error: 'Lỗi kết nối server. Vui lòng thử lại sau.',
            details: error.message,
            respCode: '99'
        });
    }
});

// Function fake gửi OTP
async function sendOTPFake(phoneNumber, otpCode) {
    console.log(`📱 [FAKE SMS] Gửi OTP đến ${phoneNumber}: ${otpCode}`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fake success response (trong thực tế sẽ gọi API SMS gateway)
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
        console.log(`✅ [FAKE SMS] Gửi thành công OTP ${otpCode} đến ${phoneNumber}`);
        return {
            success: true,
            message: 'OTP sent successfully',
            provider: 'FAKE_SMS_GATEWAY'
        };
    } else {
        console.log(`❌ [FAKE SMS] Gửi thất bại OTP đến ${phoneNumber}`);
        return {
            success: false,
            message: 'SMS gateway error',
            error: 'NETWORK_ERROR'
        };
    }
}

// API xác thực OTP
app.post('/api/verify-otp', async (req, res) => {
    const { userId, otpCode } = req.body;

    if (!userId || !otpCode) {
        return res.status(400).json({
            error: 'userId và otpCode là bắt buộc',
            respCode: '01'
        });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otpCode)) {
        return res.json({
            respCode: '01',
            msg: 'Mã OTP phải có 6 chữ số',
            error: 'Invalid OTP format'
        });
    }

    try {
        // Xác thực OTP
        const verifyResult = await OTP.verifyOTP(userId, otpCode);

        if (verifyResult.success) {
            // OTP đúng
            res.json({
                respCode: '00',
                msg: 'Xác thực OTP thành công',
                data: {
                    userId: userId,
                    verifiedAt: new Date().toISOString()
                }
            });
        } else {
            // OTP sai hoặc có lỗi
            let respCode = '01';
            if (verifyResult.code === 'OTP_EXPIRED') {
                respCode = '02';
            } else if (verifyResult.code === 'MAX_ATTEMPTS_EXCEEDED') {
                respCode = '03';
            }

            res.json({
                respCode: respCode,
                msg: verifyResult.message,
                error: verifyResult.code,
                attemptsLeft: verifyResult.attemptsLeft || 0
            });
        }
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            error: 'Lỗi server khi xác thực OTP',
            respCode: '99',
            details: error.message
        });
    }
});

// API gửi lại OTP
app.post('/api/resend-otp', async (req, res) => {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
        return res.status(400).json({
            error: 'userId và phoneNumber là bắt buộc',
            respCode: '01'
        });
    }

    try {
        // Tạo OTP mới
        const otpRecord = await OTP.createOTP(userId, phoneNumber);

        // Fake gửi OTP
        const sendResult = await sendOTPFake(phoneNumber, otpRecord.otpCode);

        if (sendResult.success) {
            res.json({
                respCode: '00',
                msg: 'Gửi lại OTP thành công',
                data: {
                    phoneNumber: phoneNumber,
                    expiryTime: otpRecord.expiryTime,
                    attemptsLeft: otpRecord.maxAttempts
                }
            });
        } else {
            res.json({
                respCode: '02',
                msg: 'Không thể gửi lại OTP. Vui lòng thử lại sau.',
                error: 'Failed to resend OTP'
            });
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            error: 'Lỗi server khi gửi lại OTP',
            respCode: '99',
            details: error.message
        });
    }
});

// API đặt lại mật khẩu
app.post('/api/set-password', async (req, res) => {
    console.log('req.body:', req.body);
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
        return res.status(400).json({ error: 'userId and newPassword are required' });
    }

    console.log(`Changing password for userId: ${userId}`);
    console.log(`New password: ${newPassword}`);

    try {
        const response = await axios.post(
            `${process.env.DOMAIN}/manage/api/users/set-user-password`,
            { userId, newPassword },
            {
                params: {
                    token: process.env.TOKEN
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('API set-user-password response status:', response.status);
        console.log('API set-user-password response data:', response.data);
        res.json(response.data);
    } catch (error) {
        if (error.response) {
            console.error('API error status:', error.response.status);
            console.error('API error data:', error.response.data);
            res.status(500).json({ error: 'Failed to set password', backend: error.response.data });
        } else if (error.request) {
            console.error('No response received:', error.request);
            res.status(500).json({ error: 'No response received from backend' });
        } else {
            console.error('Axios error:', error.message);
            res.status(500).json({ error: 'Failed to set password', details: error.message });
        }
    }
});

// API debug - xem thống kê OTP (chỉ để test)
app.get('/api/otp/stats', async (req, res) => {
    try {
        const stats = await OTP.getStats();
        res.json({
            respCode: '00',
            msg: 'OTP statistics',
            data: stats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            error: 'Lỗi server khi lấy thống kê OTP',
            respCode: '99',
            details: error.message
        });
    }
});

// API debug - xem OTP hiện tại của user (chỉ để test)
app.get('/api/otp/debug/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const otpRecord = await OTP.findActiveOTPByUserId(userId);

        if (otpRecord) {
            res.json({
                respCode: '00',
                msg: 'OTP found',
                data: {
                    otpCode: otpRecord.otpCode,
                    phoneNumber: otpRecord.phoneNumber,
                    createdAt: otpRecord.createdAt,
                    expiryTime: otpRecord.expiryTime,
                    attempts: otpRecord.attempts,
                    maxAttempts: otpRecord.maxAttempts,
                    isExpired: otpRecord.isExpired,
                    isUsed: otpRecord.isUsed
                }
            });
        } else {
            res.json({
                respCode: '01',
                msg: 'No active OTP found for this user',
                data: null
            });
        }
    } catch (error) {
        console.error('Debug OTP error:', error);
        res.status(500).json({
            error: 'Lỗi server khi debug OTP',
            respCode: '99',
            details: error.message
        });
    }
});

// API cleanup OTP hết hạn (manual trigger)
app.post('/api/otp/cleanup', async (req, res) => {
    try {
        const cleanedCount = await OTP.cleanupExpiredOTPs();
        res.json({
            respCode: '00',
            msg: 'Cleanup completed',
            data: {
                cleanedCount: cleanedCount
            }
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            error: 'Lỗi server khi cleanup OTP',
            respCode: '99',
            details: error.message
        });
    }
});


// Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
