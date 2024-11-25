// db.js
const mongoose = require('mongoose');
const MONGODB_URL = process.env.MONGODB_URL;

// mongoose 接続~
mongoose.connect(MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => { console.log('MongoDB connected'); })
    .catch(err => { console.error('MongoDB connection error:', err); });

// オプション設定
const options = {
    timestamps: true,
    toObject: {
        virtuals: true,
        versionKey: false,
        transform: (_, ret) => { delete ret._id; return ret; }
    }
};

// user スキーマ
const userSchema = new mongoose.Schema({
    name: String,
    socketId: [],
    randomString: String
}, options);

const User = mongoose.model("User", userSchema);

// bookmark スキーマ（Post 内部）
const bookmarkSchema = new mongoose.Schema({
    userSocketId: String,
    name: String
});

// Post スキーマ / モデル
const postSchema = new mongoose.Schema({
    // 基本情報
    name: String,
    msg: String,
    options: [String],
    voters: [[String]],
    bookmarks: [{ type: bookmarkSchema, default: () => ({}) }],

    // 重ねる機能
    parentPostId: { type: String, default: null },  // 親ポストのID
    childPostIds: [String],  // 子ポストのIDリスト

    // メモ機能（公開メモかどうか）
    memoId: String,
    memoCreatedAt: Date
}, options);

const Post = mongoose.model("Post", postSchema);

// memo スキーマ / モデル
const memoSchema = new mongoose.Schema({
    name: String,
    msg: String,
    isBeingOpened: { type: Boolean, default: false } // メモが公開されているかどうか
}, options);

const Memo = mongoose.model("Memo", memoSchema);

module.exports = { mongoose, User, Post, Memo };