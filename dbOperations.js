// dbOperations.js 
const { mongoose, Post, Memo } = require('./db');
const { handleErrors, organizeLogs } = require('./utils');

const PAST_POST = 5; // 過去ログ取得数

// ログイン時・過去ログをDBから取得
async function getPastLogs() {
    try {
        const posts = await Post.find({}).limit(PAST_POST).sort({ createdAt: -1 });
        posts.reverse();
        const pastLogs = await Promise.all(posts.map(organizeLogs));
        pastLogs.forEach(e => {
            console.log(e.name + e.msg + e.ups + e.downs + e.bookmarks);
        });
        console.log('過去ログ整理完了');
        return pastLogs;
    } catch (error) {
        handleErrors(error, 'getPastLogs 過去ログ取得中にエラーが発生しました');
    }
}

// データベースにレコードを保存
async function saveRecord(name, msg, question = '', options = [], ups = [], downs = [], voteOpt0 = [], voteOpt1 = [], voteOpt2 = []) {
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
        const p = await saveRecord(name, msg);
        console.log('チャット保存しました💬:' + p.msg + p.id);
        return p;
    }
    catch (error) {
        handleErrors(error, 'チャット受送信中にエラーが発生しました');
    }
}

// 自分メモ受送信
async function SavePersonalMemo(name, memo, socket) {
    try {
        const m = await saveMemo(name, memo);
        console.log('自分メモ保存完了', m.name, m.memo);
        return m;
    }
    catch (error) {
        handleErrors(error, '自分メモ受送信中にエラーが発生しました');
    }
}

// 自分メモ保存
async function saveMemo(name, memo) {
    try {
        const memoData = { name, memo };
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

// ドキュメントページ用 DBからの過去ログ取得の関数
async function fetchPosts(nameToMatch) {
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

        // 反対に並べ替え
        posts.reverse();

        const pastLogs = await Promise.all(posts.map(organizeLogs));
        let messages = [];
        pastLogs.forEach(e => {
            messages.push({ user: e.name, message: e.msg });
        });
        console.log('api 過去ログ messaages: ', messages);
        return messages;
    }
    catch (error) {
        handleErrors(error, 'api 過去ログ取得中にエラーが発生しました');
    }
}

module.exports = { getPastLogs, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, findPost, fetchPosts };
