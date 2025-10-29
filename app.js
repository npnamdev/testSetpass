const express = require('express');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trang chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API tìm kiếm user
app.post('/api/search-user', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const response = await axios.get(`${process.env.DOMAIN}manage/api/users/search-user`, {
            params: {
                token: process.env.TOKEN,
                username
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user', details: error.message });
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
            `${process.env.DOMAIN}manage/api/users/set-user-password`,
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


// Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
