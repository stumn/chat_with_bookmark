// db.js
const mongoose = require('mongoose');
const MONGODB_URL = process.env.MONGODB_URL;

// mongoose 接続~
mongoose.connect(MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('MongoDB connected');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

// オプション設定
const options = {
    timestamps: true,
    toObject: {
        virtuals: true,
        versionKey: false,
        // transform: (_, ret) => { delete ret._id; return ret; }
    }
};

// bookmark スキーマ（Post 内部）
const bookmarkSchema = new mongoose.Schema({
    userSocketId: String,
    name: String
});

// Post スキーマ / モデル
const postSchema = new mongoose.Schema({
    name: String,
    msg: String,
    question: String,
    options: Array,
    ups: [{ type: bookmarkSchema, default: () => ({}) }],
    downs: [{ type: bookmarkSchema, default: () => ({}) }],
    bookmarks: [{ type: bookmarkSchema, default: () => ({}) }],
    voteOpt0: [String],
    voteOpt1: [String],
    voteOpt2: [String]
    // voteOptions: [[voteSchema]]　2次元配列の拡張案
}, options);

const Post = mongoose.model("Post", postSchema);

// memo スキーマ / モデル
const memoSchema = new mongoose.Schema({
    name: String,
    memo: String
}, options);

const Memo = mongoose.model("Memo", memoSchema);

module.exports = { mongoose, Post, Memo };