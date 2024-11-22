// routes.js
const express = require('express');
const router = express.Router();
const { fetchPosts } = require('./dbOperations'); 

// // ルーム選択ページHTML
// router.get('/rooms', (req, res) => {
//     res.sendFile(__dirname + '/public/room-selection.html');
// });

// // チャットページHTML
// router.get('/rooms/:roomId', (req, res) => {
//     res.sendFile(__dirname + '/public/chat-room.html');
// });

// チャットページHTML
router.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/chat-room.html');
});

// チャットページ用CSS
router.get('/style.css', (_, res) => {
    res.header('Content-Type', 'text/css');
    res.sendFile(__dirname + '/public/style.css');
});

// ドキュメントページHTML
router.get('/:randomString/:myName/document', (req, res) => {
    res.sendFile(__dirname + '/public/document.html');
});

// ドキュメントページ用CSS
router.get('/document.css', (_, res) => {
    res.header('Content-Type', 'text/css');
    res.sendFile(__dirname + '/public/document.css');
});

// ドキュメントページ用 DBアクセスAPI
router.get('/api/:randomString/messages', async (req, res) => {
    try {
        const apiString = req.params.randomString;
        const messages = await fetchPosts(apiString);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages in API' });
    }
});

module.exports = router;
