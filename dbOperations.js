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
        // const posts = await Post.find({}).limit(PAST_POST).sort({ createdAt: -1 });
        let posts = await Post.find({}).sort({ createdAt: -1 });
        let stacks = posts.filter(e => e.isStackingOn === true);

        posts = posts.filter(e => e.isStackingOn === false);
        posts.reverse();

        const pastLogs = await Promise.all(posts.map(organizeLogs));
        pastLogs.forEach(e => {
            e.createdAt = organizeCreatedAt(e.createdAt);
        });

        const stackLogs = await Promise.all(stacks.map(organizeLogs));
        stackLogs.forEach(e => {
            e.createdAt = organizeCreatedAt(e.createdAt);
        });
        console.log('過去ログ整理完了', pastLogs[pastLogs.length - 1]);
        return { pastLogs, stackLogs };
    } catch (error) {
        handleErrors(error, 'getPastLogs 過去ログ取得中にエラーが発生しました');
    }
}

function organizeCreatedAt(createdAt) {
    const UTCdate = new Date(createdAt);
    const formattedCreatedAt = UTCdate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    return formattedCreatedAt;
}

// データベースにレコードを保存
async function saveRecord(name, msg, question = '', options = [], voteOptions = [], ups = [], downs = [], bookmarks = [], isOpenCard = false, isStackingOn = false, stackedPostIds = []) {
    try {
        const npData = { name, msg, question, options, voteOptions, ups, downs, bookmarks, isOpenCard, isStackingOn, stackedPostIds };
        console.log('npData: ', npData);
        const newPost = await Post.create(npData);
        return newPost;
    } catch (error) {
        handleErrors(error, 'データ保存時にエラーが発生しました');
    }
}

// チャットメッセージ受送信
async function SaveChatMessage(name, msg, isOpenCard) {
    try {
        console.log('SCM msg: ', msg);
        console.log('SCM isOpenCard: ', isOpenCard);
        const p = await saveRecord(name, msg, '', [], [], [], [], [], isOpenCard);
        console.log('チャット保存しました💬:' + p.msg + p.isOpenCard);
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
async function SaveSurveyMessage(formattedQuestion, options, name) {
    const voteOptions = options.map(() => []); // 選択肢数分の空配列を作成
    console.log('voteOptions: ', voteOptions);
    try {
        const surveyPost = await saveRecord(name, '', formattedQuestion, options, voteOptions);
        console.log('surveyPost: ', surveyPost);
        return organizeLogs(surveyPost);
    } catch (error) {
        handleErrors(error, 'アンケート受送信中にエラーが発生しました');
    }
}

// 投稿を見つける関数
async function findPost(msgId) {
    try {
        const post = await Post.findById(msgId);
        if (!post) {
            throw new Error(`投稿が見つかりません: ${msgId}`);
        }
        return post;
    } catch (error) {
        handleErrors(error, `投稿見つからない${msgId}`);
    }
}

async function findMemo(msgId) {
    try {
        const memo = await Memo.findById(msgId);
        if (!memo) {
            throw new Error(`メモが見つかりません: ${msgId}`);
        }
        return memo;
    } catch (error) {
        handleErrors(error, `メモ見つからない${msgId}`);
    }
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
async function fetchPosts(randomString, myName) {

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

        // Update isStackingOn to true
        draggedPost.isStackingOn = true;
        await draggedPost.save();

        // Find drop post and handle errors
        const dropPost = await findPost(dropId);
        if (!dropPost) throw new Error(`Post with ID ${dropId} not found.`);
        console.log('dropPost: ', dropPost);

        // Add draggedId to stackedPostIds
        dropPost.stackedPostIds.push(dragedId);
        await dropPost.save();

        return { draggedPost, dropPost };

    } catch (error) {
        console.error('Error saving stack relation:', error);
        throw error;  // Re-throw the error to be handled by the caller
    }
}

async function kasaneteOpen_saveStackRelation(draggedPost, dropPost) {
    try {
        console.log('draggedPost: ', draggedPost);
        console.log('dropPost: ', dropPost);

        // Update isStackingOn to true
        draggedPost.isStackingOn = true;
        await draggedPost.save();

        // Add draggedId to stackedPostIds
        dropPost.stackedPostIds.push(draggedPost._id);
        await dropPost.save();

        // return { draggedPost, dropPost };

    } catch (error) {
        console.error('Error saving stack relation:', error);
        throw error;  // Re-throw the error to be handled by the caller
    }
}

module.exports = { saveUser, getUserInfo, getPastLogs, organizeCreatedAt, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, findPost, findMemo, fetchPosts, saveStackRelation, kasaneteOpen_saveStackRelation };
