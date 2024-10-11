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

const PAST_POST = 10 // 過去ログ取得数

// ログイン時・過去ログをDBから取得
async function getPastLogs() {
    try {
        const posts = await Post.find({}).limit(PAST_POST).sort({ createdAt: -1 });
        posts.reverse();
        const pastLogs = await Promise.all(posts.map(organizeLogs));
        pastLogs.forEach(e => {
            e.createdAt = organizeCreatedAt(e.createdAt);
        });
        console.log('過去ログ整理完了');
        return pastLogs;
    } catch (error) {
        handleErrors(error, 'getPastLogs 過去ログ取得中にエラーが発生しました');
    }
}

function organizeCreatedAt(createdAt) {
    const UTCdate = new Date(createdAt);
    UTCdate.setHours(UTCdate.getHours() + 9);
    const organizedCreatedAt = UTCdate.toISOString().match(/T(\d{2}:\d{2}:\d{2})/)[1];
    createdAt = organizedCreatedAt;
    return createdAt;
}

// データベースにレコードを保存
async function saveRecord(name, msg, question = '', options = [], ups = [], downs = [], voteOpt0 = [], voteOpt1 = [], voteOpt2 = [], isStack = false, stackedPostId = []) {
    try {
        const npData = { name, msg, question, options, ups, downs, voteOpt0, voteOpt1, voteOpt2 };
        const newPost = await Post.create(npData);
        return newPost;
    } catch (error) {
        handleErrors(error, 'データ保存時にエラーが発生しました');
    }
}

// チャットメッセージ受送信
async function SaveChatMessage(name, msg) {
    try {
        console.log('SCM msg: ', msg);
        const p = await saveRecord(name, msg);
        console.log('チャット保存しました💬:' + p.msg + p.id);
        return p;
    }
    catch (error) {
        handleErrors(error, 'チャット受送信中にエラーが発生しました');
    }
}

// 自分メモ受送信
async function SavePersonalMemo(name, msg, socket) {
    try {
        const m = await saveMemo(name, msg);
        console.log('自分メモ保存完了', m.name, m.msg, m.createdAt);
        return m;
    }
    catch (error) {
        handleErrors(error, '自分メモ受送信中にエラーが発生しました');
    }
}

// 自分メモ保存
async function saveMemo(name, msg) {
    try {
        console.log(msg);
        const memoData = { name, msg };
        const newMemo = await Memo.create(memoData);
        console.log(newMemo);
        return newMemo;
    } catch (error) {
        handleErrors(error, '自分メモ保存時にエラーが発生しました');
    }
}

// アンケートメッセージ受送信
async function SaveSurveyMessage(data, name) {
    const Q = data.question;
    const optionTexts = [data.options[0], data.options[1], data.options[2]];
    try {
        const surveyPost = await saveRecord(name, '', Q, optionTexts);
        const xxx = organizeLogs(surveyPost);
        return xxx;
    } catch (error) {
        handleErrors(error, 'アンケート受送信中にエラーが発生しました');
    }
}

// 投稿を見つける関数
async function findPost(msgId) {
    const post = await Post.findById(msgId);
    if (!post) {
        handleErrors(error, `投稿見つからない${msgId}`);
        return;
    }
    return post;
}

async function getUserInfo_rsnm(randomString) {
    try {
        const userInfo = await User.findOne().where('randomString').equals(randomString);
        console.log('userInfo.name: ', userInfo.name);
        return userInfo.name;
    } catch {
        handleErrors(error, ' rs=>name ユーザー情報取得時にエラーが発生しました');
    }
}

// ドキュメントページ用 DBからの過去ログ取得の関数
async function fetchPosts(randomString) {

    // まずユーザー情報のDBから、nameTomatchを取得
    const nameToMatch = await getUserInfo_rsnm(randomString);

    try {
        console.log('nameToMatch 入っているか再度確認: ', nameToMatch);
        let posts = await Post.find(
            {
                'bookmarks': {
                    '$elemMatch': {
                        'name': nameToMatch
                    }
                }
            }
        ).sort({ createdAt: -1 });

        // bookmarksが見つからない場合
        if (posts.length === 0) {
            console.log('bookmarksがありません');
        }

        let messages = [];
        posts.forEach(e => {
            messages.push({ name: e.name, msg: e.msg, createdAt: e.createdAt });
        });

        // memo を取得
        const memos = await Memo.find({ name: nameToMatch });
        memos.forEach(e => {
            messages.push({ name: "personal memo", msg: e.msg, createdAt: e.createdAt });
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
        console.log('draggedPost: ', draggedPost);

        // Update isStack to true
        draggedPost.isStack = true;
        await draggedPost.save();

        // Find drop post and handle errors
        const dropPost = await findPost(dropId);
        if (!dropPost) throw new Error(`Post with ID ${dropId} not found.`);
        console.log('dropPost: ', dropPost);

        // Add draggedId to stackedPostId
        dropPost.stackedPostId.push(dragedId);
        await dropPost.save();

        return { draggedPost, dropPost };

    } catch (error) {
        console.error('Error saving stack relation:', error);
        throw error;  // Re-throw the error to be handled by the caller
    }
}


module.exports = { saveUser, getUserInfo, getPastLogs, organizeCreatedAt, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, findPost, fetchPosts, saveStackRelation };
