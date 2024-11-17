// dbOperations.js
const { mongoose, User, Post, Memo } = require('./db');
const { handleErrors, organizeLogs } = require('./utils');

// ユーザーモデルに保存
async function saveUser(name, socketId, randomString) {
    try {
        const userData = { name, socketId, randomString };
        const newUser = await User.create(userData);
        return newUser;
    } catch (error) {
        handleErrors(error, 'ユーザー保存時にエラーが発生しました');
    }
}

// ユーザー情報を取得
async function getUserInfo(name) {
    try {
        const userInfo = await User.findOne().where('name').equals(name);
        const randomString = userInfo.randomString;
        return randomString;
    } catch {
        handleErrors(error, 'ユーザー情報取得時にエラーが発生しました');
    }
}

// const PAST_POST = 10 // 過去ログ取得数

// ログイン時・過去ログをDBから取得
async function getPastLogs() {
    try {
        let posts = await Post.find({}).sort({ createdAt: -1 });
        let stacks = posts.filter(e => e.parentPostId !== null);

        posts = posts.filter(e => e.parentPostId === null);
        posts.reverse();

        const pastLogs = await processXlogs(posts);
        const stackLogs = await processXlogs(stacks);
        return { pastLogs, stackLogs };
    } catch (error) {
        handleErrors(error, 'getPastLogs 過去ログ取得中にエラーが発生しました');
    }
}

async function processXlogs(posts) {
    const xLogs = await Promise.all(posts.map(organizeLogs));
    xLogs.forEach(e => { e.createdAt = organizeCreatedAt(e.createdAt); });
    return xLogs;
}

function organizeCreatedAt(createdAt) {
    const UTCdate = new Date(createdAt);
    const formattedCreatedAt = UTCdate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    return formattedCreatedAt;
}

// データベースにレコードを保存
async function saveRecord(name, msg, inqury = {}, stack = {}, memo = {}) {
    try {
        const { options = [], voters = [] } = inqury;
        const { parentPostId = null, childPostIds = [] } = stack;
        const { memoId = null, memoCreatedAt = null } = memo;
        const bookmarks = [];

        const npData = { name, msg, options, voters, bookmarks, parentPostId, childPostIds, memoId, memoCreatedAt };
        const newPost = await Post.create(npData);
        return newPost;
    } catch (error) {
        handleErrors(error, 'データ保存時にエラーが発生しました');
    }
}

// 自分メモ保存
async function SavePersonalMemo(name, msg) {
    try {
        const memoData = { name, msg };
        const newMemo = await Memo.create(memoData);
        console.log('自分メモ保存完了', newMemo.name, newMemo.msg, newMemo.createdAt);
        return newMemo;
    } catch (error) {
        handleErrors(error, '自分メモ保存時にエラーが発生しました');
    }
}

// チャットメッセージ受送信
async function SaveChatMessage(name, msg) {
    try {
        const record = await saveRecord(name, msg);
        console.log('チャット保存しました💬:' + record.msg + record.createdAt);
        return organizeLogs(record);
    }
    catch (error) {
        handleErrors(error, 'チャット受送信中にエラーが発生しました');
    }
}

// アンケートメッセージ受送信
async function SaveSurveyMessage(name, msg, options) {
    const voters = options.map(() => []); // 選択肢数分の空配列を作成
    try {
        const inqury = { options, voters };
        const surveyPost = await saveRecord(name, msg, inqury);
        console.log('アンケート保存しました📊:', surveyPost.msg, surveyPost._id);
        return organizeLogs(surveyPost);
    } catch (error) {
        handleErrors(error, 'アンケート受送信中にエラーが発生しました');
    }
}

// メモ公開
async function SaveRevealMemo(name, msg, memoId, memoCreatedAt) {
    try {
        // inqury 追加してもいいかも
        const memo = { memoId, memoCreatedAt };
        const revealMemo = await saveRecord(name, msg, {}, {}, memo);
        console.log(`メモ公開${revealMemo.memoCreatedAt}, ${revealMemo.createdAt}`);
        return organizeLogs(revealMemo);
    } catch (error) {
        handleErrors(error, 'メモ公開時にエラーが発生しました');
    }
}

// 重ねてメモ公開
async function SaveKasaneteMemo(name, msg, stack, memo) {
    try {
        // 重ねて公開するメモの方
        const KasaneteMemo = await saveRecord(name, msg, {}, stack, memo);
        console.log(`重ねてメモ公開${KasaneteMemo.memoCreatedAt}, ${KasaneteMemo.createdAt}`);
        return KasaneteMemo;
    } catch (error) {
        handleErrors(error, '重ねてメモ公開時にエラーが発生しました');
    }
}

// 重ねられた投稿に、stack 情報を追加
async function SaveParentPost(child, parent) {
    try {
        if (!parent.childPostIds) parent.childPostIds = [];
        parent.childPostIds.push(child._id);
        await parent.save();
    } catch (error) {
        handleErrors(error, '重ねられた投稿に、stack 情報を追加中にエラーが発生しました');
    }
}

const retries = 3;
const delay = 3000;
async function findPost(msgId) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`findPost (attempt ${attempt}): `, msgId);
            if (!msgId) { throw new Error('msgId がありません'); }
            const post = await Post.findById(msgId);
            if (!post) { throw new Error(`投稿が見つかりません: ${msgId}`); }
            return post; // 見つかった場合
        } catch (error) {
            console.error(`エラー (attempt ${attempt}):`, error.message);
            if (attempt === retries) {
                handleErrors(error, `投稿見つからない: ${msgId}`);
                throw error; // 最後のリトライで失敗した場合はエラーを投げる
            }
            console.log(`リトライします (${delay / 1000}秒後)...`);
            await new Promise(resolve => setTimeout(resolve, delay)); // 指定された時間待機
        }
    }
}


async function findMemo(msgId) {
    try {
        const memo = await Memo.findById(msgId);
        if (!memo) { throw new Error(`メモが見つかりません: ${msgId}`); }
        return memo;
    } catch (error) {
        handleErrors(error, `メモ見つからない${msgId}`);
    }
}

async function getUserInfo_rsnm(randomString) {
    try {
        const userInfo = await User.findOne().where('randomString').equals(randomString);
        return userInfo.name;
    } catch {
        handleErrors(error, ' rs=>name ユーザー情報取得時にエラーが発生しました');
    }
}

// ドキュメントページ用 DBからの過去ログ取得の関数
async function fetchPosts(randomString, myName) {

    // まずユーザー情報のDBから、nameTomatchを取得
    const nameToMatch = await getUserInfo_rsnm(randomString);

    try {
        console.log('nameToMatch 入っているか再度確認: ', nameToMatch);
        let posts = await Post.find({ 'bookmarks': { '$elemMatch': { 'name': nameToMatch } } }).sort({ createdAt: -1 });

        // bookmarksが見つからない場合
        if (posts.length === 0) { console.log('bookmarksがありません'); }

        let messages = [];
        posts.forEach(e => {
            messages.push({ name: e.name, msg: e.msg, createdAt: e.createdAt });
        });

        // memo を取得
        const memos = await Memo.find({ name: nameToMatch });
        memos.forEach(e => {
            messages.push({ name: "○", msg: e.msg, createdAt: e.createdAt });
        });

        // createdAt でソート
        messages.sort((a, b) => a.createdAt - b.createdAt);

        console.log('api 過去ログ messaages: ', messages);
        return messages;
    }
    catch (error) {
        handleErrors(error, 'api 過去ログ取得中にエラーが発生しました');
    }
}

async function saveStackRelation(dragedId, dropId) {
    try {
        // Find dragged post and handle errors
        const draggedPost = await findPost(dragedId);
        if (!draggedPost) throw new Error(`Post with ID ${dragedId} not found.`);

        // Update parentPostId to true
        draggedPost.parentPostId = true;
        await draggedPost.save();

        // Find drop post and handle errors
        const dropPost = await findPost(dropId);
        if (!dropPost) throw new Error(`Post with ID ${dropId} not found.`);

        // Add draggedId to childPostIds
        dropPost.childPostIds.push(dragedId);
        await dropPost.save();

        return { draggedPost, dropPost };

    } catch (error) {
        handleErrors(error, 'Error saving stack relation');
        throw error;  // Re-throw the error to be handled by the caller
    }
}

module.exports = { saveUser, getUserInfo, getPastLogs, organizeCreatedAt, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, SaveRevealMemo, SaveKasaneteMemo, findPost, findMemo, fetchPosts, saveStackRelation, SaveParentPost };
