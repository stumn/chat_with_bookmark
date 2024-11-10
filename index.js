// 環境変数の読み込み
require('dotenv').config();

// 必要なモジュールのインポート
const express = require('express');
const app = express();
const routes = require('./routes');

// 静的ファイルを提供（JS, CSSなど）
app.use(express.static('public'));

app.use('/', routes);

const http = require('http');
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);

// const { mongoose, Post, Memo } = require('./db');
const { saveUser, getUserInfo, getPastLogs, organizeCreatedAt, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, SaveRevealMemo, SaveKasaneteMemo, findPost, findMemo, fetchPosts, saveStackRelation, SaveParentPost } = require('./dbOperations');
const { handleErrors, checkVoteStatus, calculate_VoteSum, checkEventStatus } = require('./utils');

const { error } = require('console');

// 定数の設定
const PORT = process.env.PORT || 3000;
// const ANONYMOUS_NAME = '匿名';

// オンラインユーザーのリスト
let onlineUsers = [];
let idsOnlineUsers = [];
let memoCount = 0;

// クライアントから接続があったときのイベントハンドラ
io.on('connection', async (socket) => {

  // ログイン時
  socket.on('sign-up', async (rawname) => {
    const { name, randomString } = await logInFunction(rawname, socket);
    socket.emit('randomString', randomString);

    // < 自分メモ >
    socket.on('personal memo', async (memo) => {
      const m = await SavePersonalMemo(name, memo);

      const organizedMemo = {
        id: m._id,
        name: m.name,
        msg: m.msg,
        createdAt: organizeCreatedAt(m.createdAt)
      }

      socket.emit('memoLogs', organizedMemo); // 自分だけに送信

      memoCount++;
      if (memoCount >= 1) { io.emit('memoCount', memoCount); }

    });

    function decreaseMemoCount() {
      if (memoCount > 0) {
        memoCount -= 1;
        socket.emit('memoCount', memoCount);
      }
    }

    setInterval(decreaseMemoCount, 1000 * 5);

    // < チャット（選択肢付き）メッセージ >
    socket.on('chat message', async (msg) => {
      let postSet;
      if ((msg.match(/::/g) || []).length >= 2) {

        // 文字列を最初に出現する "::" で分割して、質問部分と選択肢部分に分ける
        const { formattedQuestion, options } = parseQuestionOptions(msg);

        const record = await SaveSurveyMessage(name, formattedQuestion, options);
        postSet = {
          _id: record._id,
          name: record.name,
          msg: record.msg,
          options: record.options,
          voteSums: record.voteSums,
          createdAt: organizeCreatedAt(record.createdAt)
        }
      }
      else {

        const p = await SaveChatMessage(name, msg);

        postSet = {
          _id: p._id,
          name: p.name,
          msg: p.msg,
          createdAt: organizeCreatedAt(p.createdAt)
        }
      }
      socket.emit('myChat', postSet);
      socket.broadcast.emit('chatLogs', postSet);
    });

    // < アンケート投票 >
    socket.on('survey', async (msgId, option) => {
      const voteData = await processVoteEvent(msgId, option, socket.id, socket);
      io.emit('updateVote', voteData); // id とcount を送信
    });

    // < ボタンイベント (bookmark) >
    socket.on('event', async (eventType, msgId) => {
      await receiveSendButtonEvent(eventType, msgId, name, socket);
    });

    // 伏せカードオープン
    socket.on('revealMemo', async (memo) => {
      const record = await SaveRevealMemo(memo.name, memo.msg, memo._id, memo.createdAt);
      notifyRevealMemo(record, name);

      const postSet = {
        _id: record._id,
        name: record.name,
        msg: record.msg,
        memoCreatedAt: organizeCreatedAt(record.memoCreatedAt),
        createdAt: organizeCreatedAt(record.createdAt)
      }

      socket.emit('myOpenCard', postSet);
      socket.broadcast.emit('downCard', postSet);


    });

    socket.on('kasaneteOpen', async (memoId, dropId) => {
      const memo = await findMemo(memoId);
      const target = await findPost(dropId);

      // const inquryData = { options, voters };
      const stackData = { parentPostId: target._id, childPostIds: [] };
      const memoData = { memoId: memo._id, memoCreatedAt: memo.createdAt };

      const record = await SaveKasaneteMemo(memo.name, memo.msg, stackData, memoData);
      notifyRevealMemo(record, name);

      // 重ねられた投稿に、stack 情報を追加
      SaveParentPost(record, target);

      const postSet = {
        _id: record._id,
        name: record.name,
        msg: record.msg,
        memoCreatedAt: organizeCreatedAt(record.memoCreatedAt)
      }

      const data = { postSet, dropId };

      socket.emit('myKasaneOpen', data);
      socket.broadcast.emit('kasaneOpen', data);
    });

    // ドラッグstart
    socket.on('dragstart', id => {
      socket.broadcast.emit('dragstart', id); // 操作したユーザ以外に送信
    });

    // ドラッグend
    socket.on('dragend', id => {
      socket.broadcast.emit('dragend', id); // 操作したユーザ以外に送信
    });

    // ドラッグover
    // ドラッグリーブ

    // ドラッグドロップ
    socket.on('drop', async (kasaneData) => {
      socket.broadcast.emit('drop', kasaneData); // 操作したユーザ以外に送信
      await saveStackRelation(kasaneData.draggedId, kasaneData.dropId);
    });
  });

  // < 切断時 >
  socket.on('disconnect', async () => {
    disconnectFunction(socket);
  });
});

function notifyRevealMemo(record, name) {
  const difference = new Date(record.createdAt) - new Date(record.memoCreatedAt);
  const data = { name, difference };
  io.emit('notification', data);
}

function parseQuestionOptions(data) {
  const [question, ...rest] = data.split('::');
  // 残りの部分をまとめて再び "::" で分割して、選択肢の配列を作成
  const options = rest.join('::').split('::').map(option => option.trim());
  const formattedQuestion = question.trim();
  return { formattedQuestion, options };
}

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// ログイン時（名前・オンラインユーザーリスト・過去ログ）
async function logInFunction(rawname, socket) {
  const name = rawname !== null && rawname !== '' ? rawname : ANONYMOUS_NAME;
  console.log(name + ' (' + socket.id + ') 接続完了💨');

  onlineUsers.push(name);
  idsOnlineUsers.push({ id: socket.id, name: name });
  io.emit('onlineUsers', onlineUsers);

  // ランダム文字列生成
  const randomString = generateRandomString(10); // 10文字
  console.log('randomString: ', randomString);

  try { // ユーザー情報を保存 
    await saveUser(name, socket.id, randomString);
  } catch (error) {
    handleErrors(error, 'LogInFunction ユーザー情報保存中にエラーが発生しました');
  }

  try { // 過去ログを取得・送信
    const { pastLogs, stackLogs } = await getPastLogs();
    // console.log('過去ログ取得完了', pastLogs);
    // console.log('stackLogs', stackLogs);
    socket.emit('pastLogs', { pastLogs, stackLogs });
  } catch (error) {
    handleErrors(error, 'LogInFunction 過去ログ取得中にエラーが発生しました');
  }
  return { name, randomString };
}

// ★投票イベントを処理する関数
async function processVoteEvent(msgId, option, userSocketId, socket) {
  try {
    const surveyPost = await findPost(msgId); // ポストを特定
    const voteArrays = surveyPost.voters;  // 投票配列

    let { userHasVoted, hasVotedOption } = checkVoteStatus(userSocketId, voteArrays); // ユーザーが投票済みか否か

    if (userHasVoted === true) { // 投票済み（関数切り分け済み）
      await handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost);
    }
    else { // 未投票(処理が短いので関数に切り分けていない)
      voteArrays[option].push(userSocketId);
      surveyPost.markModified('voters');
      await surveyPost.save();
    }

    let voteSums = calculate_VoteSum(voteArrays); // 投票合計を計算

    return {
      _id: surveyPost._id,
      voteSums: voteSums
    };

  } catch (error) {
    handleErrors(error, 'processVoteEvent  投票処理中にエラーが発生しました');
  }
}

// -投票済みユーザーの投票
async function handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost) {

  // 同じ選択肢に投票済み
  if (option === hasVotedOption) {
    socket.emit('alert', '同じ選択肢には投票できません');
    return;
  }

  // 違う選択肢に投票済み dialogで確認
  socket.emit('dialog_to_html', '投票を変更しますか？');
  const answer = await new Promise(resolve => { socket.on('dialog_to_js', resolve); });

  // answer 変更希望 => 投票済みの選択肢を1減らし、新しい選択肢に1増やす
  if (answer === true) {
    voteArrays[hasVotedOption].pull(socket.id);
    voteArrays[option].push(socket.id);
    surveyPost.markModified('voters');
    await surveyPost.save();
  }
}

// イベントの受送信（up, down, bookmark）
async function receiveSendButtonEvent(eventType, msgId, name, socket) {
  try {

    console.log('receiveSendButtonEvent', eventType, msgId, name);

    const post = await findPost(msgId);
    const events = post[eventType + 's']; // ups, downs, bookmarks (配列)
    const isAlert = await checkEventStatus(events, socket.id);

    if (isAlert) {
      // socket.emit('alert', `${eventType}は一度しかできません`);
    } else {
      events.push({ userSocketId: socket.id, name: name });
      await post.save();
    }

    const eventData = { _id: post._id, count: events.length };
    io.emit(eventType, eventData); // 結果を送信

  } catch (error) {
    handleErrors(error, `receiveSendButtonEvent ${eventType}処理中にエラーが発生しました`);
  }
}

// 切断時のイベントハンドラ　＝　オンラインメンバーから削除
async function disconnectFunction(socket) {
  try {
    const targetName = idsOnlineUsers.find(obj => obj.id === socket.id)?.name;
    onlineUsers = onlineUsers.filter(val => val !== targetName);
    io.emit('onlineUsers', onlineUsers);
  } catch (error) {
    handleErrors(error, 'disconnectFunction 切断時');
  }
}

// サーバーの起動
server.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});
