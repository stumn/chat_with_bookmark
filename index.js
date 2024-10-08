// 環境変数の読み込み
require('dotenv').config();

// 必要なモジュールのインポート
const express = require('express');
const app = express();
const routes = require('./routes');

app.use('/', routes);

const http = require('http');
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);

// const { mongoose, Post, Memo } = require('./db');
const { saveUser, getUserInfo, getPastLogs, organizeCreatedAt, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, findPost, fetchPosts } = require('./dbOperations');
const { handleErrors, createVoteArrays, checkVoteStatus, calculate_VoteSum, organize_voteData, checkEventStatus } = require('./utils');

const { error } = require('console');

// 定数の設定
const PORT = process.env.PORT || 3000;
const ANONYMOUS_NAME = '匿名';

// オンラインユーザーのリスト
let onlineUsers = [];
let idsOnlineUsers = [];

// クライアントから接続があったときのイベントハンドラ
io.on('connection', async (socket) => {

  // ログイン時
  socket.on('sign-up', async (rawname) => {
    const { name, randomString } = await logInFunction(rawname, socket);
    socket.emit('randomString', randomString);

    // < チャットメッセージ >
    socket.on('chat message', async (msg) => {
      const p = await SaveChatMessage(name, msg);

      const organizedPost = {
        _id: p._id,
        name: p.name,
        msg: p.msg,
        question: p.question,
        options: p.options,
        createdAt: organizeCreatedAt(p.createdAt)
      }

      io.emit('chatLogs', organizedPost);
    });

    // < 自分メモ >
    socket.on('personal memo', async (memo) => {
      const m = await SavePersonalMemo(name, memo, socket);

      const organizedMemo = {
        _id: m._id,
        name: m.name,
        msg: m.msg,
        createdAt: organizeCreatedAt(m.createdAt)
      }
      console.log('organizedMemo', organizedMemo);
      socket.emit('memoLogs', organizedMemo); // 自分だけに送信
    });

    // < アンケートメッセージ >
    socket.on('submitSurvey', async data => {
      const s = await SaveSurveyMessage(data, name);

      const organizedSurvey = {
        _id: s._id,
        name: s.name,
        question: s.question,
        options: s.options,
        createdAt: organizeCreatedAt(s.createdAt)
      }
      console.log('organizedSurvey', organizedSurvey);
      io.emit('survey_post', organizedSurvey);
    });

    // < アンケート投票 >
    socket.on('survey', async (msgId, option) => {
      const voteData = await processVoteEvent(msgId, option, socket.id, socket);
      io.emit('updateVote', voteData);
    });

    // < ボタンイベント (up, down, bookmark) >
    socket.on('event', async (eventType, msgId) => {
      await receiveSendButtonEvent(eventType, msgId, name, socket);
    });

    // 伏せカードオープン
    socket.on('open_downCard', async (msg) => {
      console.log('open_downCard', msg);
      const p = await SaveChatMessage(name, msg.msg);

      const organizedPost = {
        _id: p._id,
        name: p.name,
        msg: p.msg,
        question: p.question,
        options: p.options,
        createdAt: msg.createdAt
      }

      io.emit('downCard', organizedPost);
    });
  });

  // < 切断時 >
  socket.on('disconnect', async () => {
    disconnectFunction(socket);
  });
});

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
    console.log('ユーザー情報保存たぶん完了');
  } catch (error) {
    handleErrors(error, 'LogInFunction ユーザー情報保存中にエラーが発生しました');
  }

  try { // 過去ログを取得・送信
    const pastLogs = await getPastLogs();
    console.log('過去ログ取得完了', pastLogs);
    socket.emit('pastLogs', pastLogs);
  } catch (error) {
    handleErrors(error, 'LogInFunction 過去ログ取得中にエラーが発生しました');
  }
  return { name, randomString };
}

// ★投票イベントを処理する関数
async function processVoteEvent(msgId, option, userSocketId, socket) {
  try {
    const surveyPost = await findPost(msgId); // ポストを特定
    let voteArrays = createVoteArrays(surveyPost);  // 投票配列

    let { userHasVoted, hasVotedOption } = checkVoteStatus(userSocketId, voteArrays); // ユーザーが投票済みか否か

    if (userHasVoted === true) { // 投票済み（関数切り分け済み）
      await handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost);
    }
    else { // 未投票(処理が短いので関数に切り分けていない)
      voteArrays[option].push(userSocketId);
      await surveyPost.save();
    }

    let voteSums = calculate_VoteSum(voteArrays); // 投票合計を計算

    return organize_voteData(surveyPost, voteSums); //返り値

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
    await surveyPost.save();
  }
}

// イベントの受送信（up, down, bookmark）
async function receiveSendButtonEvent(eventType, msgId, name, socket) {
  console.log('eventType: ' + eventType + ' msgId: ' + msgId + ' name: ' + name);

  try {
    const post = await findPost(msgId);

    const events = post[eventType + 's']; // ups, downs, bookmarks (配列)

    const isAlert = await checkEventStatus(events, socket.id);

    if (isAlert) {
      console.log('この人は既にアクションがあります');
      socket.emit('alert', `${eventType}は一度しかできません`);
    } else {
      events.push({ userSocketId: socket.id, name: name });
      console.log(`新たなユーザーの${eventType}を追加しました: ` + JSON.stringify(events));
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
